/**
 * verify-migration.ts
 *
 * Standalone script to validate the meta-conversions-refactor migration.
 * Uses raw pg client — does NOT depend on Prisma client or schema file.
 * Can be run against any Postgres database (dev, staging, prod-clone, prod).
 *
 * Modes:
 *   Default (post-migration validation):
 *     DATABASE_URL=<url> tsx scripts/verify-migration.ts
 *     Optional: --baseline=<path/to/baseline.json> for delta assertions
 *
 *   Snapshot (pre-migration baseline capture):
 *     DATABASE_URL=<url> tsx scripts/verify-migration.ts --snapshot [--out=<path>]
 *
 * Exit code: 0 = all checks PASS, 1 = one or more checks FAIL.
 */

import { Client } from "pg";
import fs from "node:fs/promises";
import process from "node:process";

// ── CLI arg parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isSnapshot = args.includes("--snapshot");
const outFlag = args.find((a) => a.startsWith("--out="));
const baselineFlag = args.find((a) => a.startsWith("--baseline="));
const outPath = outFlag ? outFlag.split("=")[1] : "./baseline.json";
const baselinePath = baselineFlag ? baselineFlag.split("=")[1] : null;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required.");
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type CheckResult = { name: string; pass: boolean; detail: string };

function pass(name: string, detail: string): CheckResult {
  return { name, pass: true, detail };
}

function fail(name: string, detail: string): CheckResult {
  return { name, pass: false, detail };
}

function printResults(results: CheckResult[]): void {
  console.log("");
  for (const r of results) {
    const icon = r.pass ? "PASS" : "FAIL";
    console.log(`  [${icon}] ${r.name}`);
    if (r.detail) console.log(`         ${r.detail}`);
  }
  console.log("");
}

// ── Snapshot mode ─────────────────────────────────────────────────────────────

interface BaselineSnapshot {
  capturedAt: string;
  databaseUrl: string;
  pre: {
    lead: {
      NOT_CONTACTED: number;
      CONTACTED: number;
      CONVERTED: number;
      EXPIRED: number;
      total: number;
    };
    conversion: {
      count: number;
    };
    amount_sum_converted: string | null;
    expired_with_cashier: number;
    expired_without_cashier: number;
  };
}

async function runSnapshot(client: Client): Promise<void> {
  console.log("Running PRE-MIGRATION snapshot...\n");

  const statusRes = await client.query(
    `SELECT status::text, count(*)::int AS cnt FROM "Lead" GROUP BY status ORDER BY status`
  );
  const statusMap: Record<string, number> = {};
  for (const row of statusRes.rows) {
    statusMap[row.status] = row.cnt;
  }

  const totalRes = await client.query(
    `SELECT count(*)::int AS cnt FROM "Lead"`
  );

  const amountRes = await client.query(
    `SELECT sum(amount)::numeric AS total FROM "Lead" WHERE status = 'CONVERTED' AND amount IS NOT NULL`
  );

  const conversionRes = await client.query(
    `SELECT count(*)::int AS cnt FROM "Conversion"`
  ).catch(() => ({ rows: [{ cnt: 0 }] }));

  const expiredWithCashier = await client.query(
    `SELECT count(*)::int AS cnt FROM "Lead" WHERE status = 'EXPIRED' AND "cashierId" IS NOT NULL`
  ).catch(() => ({ rows: [{ cnt: 0 }] }));

  const expiredNoCashier = await client.query(
    `SELECT count(*)::int AS cnt FROM "Lead" WHERE status = 'EXPIRED' AND "cashierId" IS NULL`
  ).catch(() => ({ rows: [{ cnt: 0 }] }));

  const snapshot: BaselineSnapshot = {
    capturedAt: new Date().toISOString(),
    databaseUrl: DATABASE_URL!.replace(/:\/\/[^@]+@/, "://<redacted>@"),
    pre: {
      lead: {
        NOT_CONTACTED: statusMap["NOT_CONTACTED"] ?? 0,
        CONTACTED: statusMap["CONTACTED"] ?? 0,
        CONVERTED: statusMap["CONVERTED"] ?? 0,
        EXPIRED: statusMap["EXPIRED"] ?? 0,
        total: totalRes.rows[0].cnt,
      },
      conversion: {
        count: conversionRes.rows[0].cnt,
      },
      amount_sum_converted: amountRes.rows[0].total
        ? String(amountRes.rows[0].total)
        : null,
      expired_with_cashier: expiredWithCashier.rows[0].cnt,
      expired_without_cashier: expiredNoCashier.rows[0].cnt,
    },
  };

  await fs.writeFile(outPath, JSON.stringify(snapshot, null, 2), "utf8");

  console.log("Snapshot captured:");
  console.log(`  NOT_CONTACTED : ${snapshot.pre.lead.NOT_CONTACTED}`);
  console.log(`  CONTACTED     : ${snapshot.pre.lead.CONTACTED}`);
  console.log(`  CONVERTED     : ${snapshot.pre.lead.CONVERTED}`);
  console.log(`  EXPIRED       : ${snapshot.pre.lead.EXPIRED}`);
  console.log(`  Total leads   : ${snapshot.pre.lead.total}`);
  console.log(`  Conversion rows (pre-migration): ${snapshot.pre.conversion.count}`);
  console.log(`  CONVERTED amount sum: ${snapshot.pre.amount_sum_converted ?? "N/A"}`);
  console.log(`  EXPIRED with cashier   : ${snapshot.pre.expired_with_cashier}`);
  console.log(`  EXPIRED without cashier: ${snapshot.pre.expired_without_cashier}`);
  console.log(`\nSnapshot saved to: ${outPath}`);
}

// ── Post-migration validation ────────────────────────────────────────────────

async function runValidation(
  client: Client,
  baseline: BaselineSnapshot | null
): Promise<void> {
  console.log("Running POST-MIGRATION validation...\n");

  const results: CheckResult[] = [];

  // ── Schema-level checks ─────────────────────────────────────────────────

  // Check Lead.expiresAt absent
  try {
    const r = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'Lead' AND column_name = 'expiresAt'`
    );
    results.push(
      r.rowCount === 0
        ? pass("Lead.expiresAt dropped", "column absent")
        : fail("Lead.expiresAt dropped", `column still present (${r.rowCount} row)`)
    );
  } catch (e) {
    results.push(fail("Lead.expiresAt dropped", String(e)));
  }

  // Check Lead.amount absent
  try {
    const r = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'Lead' AND column_name = 'amount'`
    );
    results.push(
      r.rowCount === 0
        ? pass("Lead.amount dropped", "column absent")
        : fail("Lead.amount dropped", `column still present (${r.rowCount} row)`)
    );
  } catch (e) {
    results.push(fail("Lead.amount dropped", String(e)));
  }

  // Check Lead.convertedAt absent
  try {
    const r = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'Lead' AND column_name = 'convertedAt'`
    );
    results.push(
      r.rowCount === 0
        ? pass("Lead.convertedAt dropped", "column absent")
        : fail("Lead.convertedAt dropped", `column still present (${r.rowCount} row)`)
    );
  } catch (e) {
    results.push(fail("Lead.convertedAt dropped", String(e)));
  }

  // Check EXPIRED removed from enum
  try {
    const r = await client.query(
      `SELECT enumlabel FROM pg_enum
       JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
       WHERE pg_type.typname = 'LeadStatus' AND enumlabel = 'EXPIRED'`
    );
    results.push(
      r.rowCount === 0
        ? pass("EXPIRED removed from LeadStatus enum", "enum value absent")
        : fail("EXPIRED removed from LeadStatus enum", "EXPIRED still in enum")
    );
  } catch (e) {
    results.push(fail("EXPIRED removed from LeadStatus enum", String(e)));
  }

  // Check Conversion table exists
  try {
    const r = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_name = 'Conversion' AND table_schema = 'public'`
    );
    results.push(
      (r.rowCount ?? 0) > 0
        ? pass("Conversion table exists", "table present")
        : fail("Conversion table exists", "table not found")
    );
  } catch (e) {
    results.push(fail("Conversion table exists", String(e)));
  }

  // Check Conversion FK has CASCADE
  try {
    const r = await client.query(
      `SELECT rc.delete_rule
       FROM information_schema.referential_constraints rc
       JOIN information_schema.table_constraints tc
         ON tc.constraint_name = rc.constraint_name
       WHERE tc.table_name = 'Conversion' AND rc.delete_rule = 'CASCADE'`
    );
    results.push(
      (r.rowCount ?? 0) > 0
        ? pass("Conversion FK ON DELETE CASCADE", "cascade present")
        : fail("Conversion FK ON DELETE CASCADE", "cascade not found")
    );
  } catch (e) {
    results.push(fail("Conversion FK ON DELETE CASCADE", String(e)));
  }

  // ── Data-level checks ──────────────────────────────────────────────────

  // No EXPIRED leads
  try {
    const r = await client.query(
      `SELECT count(*)::int AS cnt FROM "Lead" WHERE status::text = 'EXPIRED'`
    );
    const cnt = r.rows[0].cnt;
    results.push(
      cnt === 0
        ? pass("No EXPIRED leads", `count = ${cnt}`)
        : fail("No EXPIRED leads", `${cnt} EXPIRED leads remain`)
    );
  } catch (e) {
    results.push(fail("No EXPIRED leads", String(e)));
  }

  // Get current status counts
  const statusRes = await client.query(
    `SELECT status::text, count(*)::int AS cnt FROM "Lead" GROUP BY status ORDER BY status`
  );
  const postCounts: Record<string, number> = {};
  for (const row of statusRes.rows) {
    postCounts[row.status] = row.cnt;
  }

  // Get conversion count + sum
  const convRes = await client.query(
    `SELECT count(*)::int AS cnt, sum(amount)::numeric AS total FROM "Conversion"`
  );
  const convCount = convRes.rows[0].cnt;
  const convSum = convRes.rows[0].total ? String(convRes.rows[0].total) : null;

  results.push(
    pass(
      "Post-migration lead counts",
      `NOT_CONTACTED=${postCounts["NOT_CONTACTED"] ?? 0}, CONTACTED=${postCounts["CONTACTED"] ?? 0}, CONVERTED=${postCounts["CONVERTED"] ?? 0}`
    )
  );
  results.push(
    pass("Conversion rows", `count=${convCount}, sum=${convSum ?? "N/A"}`)
  );

  // ── Baseline delta checks ─────────────────────────────────────────────

  if (baseline) {
    const pre = baseline.pre;
    const expectedNotContacted = pre.lead.NOT_CONTACTED + pre.expired_without_cashier;
    const expectedContacted = pre.lead.CONTACTED + pre.expired_with_cashier;
    const expectedConverted = pre.lead.CONVERTED;
    const expectedConversionCount = pre.lead.CONVERTED;

    const actualNotContacted = postCounts["NOT_CONTACTED"] ?? 0;
    const actualContacted = postCounts["CONTACTED"] ?? 0;
    const actualConverted = postCounts["CONVERTED"] ?? 0;

    results.push(
      actualNotContacted === expectedNotContacted
        ? pass(
            "NOT_CONTACTED delta correct",
            `expected ${expectedNotContacted} (${pre.lead.NOT_CONTACTED} + ${pre.expired_without_cashier} EXPIRED-no-cashier), actual ${actualNotContacted}`
          )
        : fail(
            "NOT_CONTACTED delta correct",
            `expected ${expectedNotContacted}, actual ${actualNotContacted}`
          )
    );

    results.push(
      actualContacted === expectedContacted
        ? pass(
            "CONTACTED delta correct",
            `expected ${expectedContacted} (${pre.lead.CONTACTED} + ${pre.expired_with_cashier} EXPIRED-with-cashier), actual ${actualContacted}`
          )
        : fail(
            "CONTACTED delta correct",
            `expected ${expectedContacted}, actual ${actualContacted}`
          )
    );

    results.push(
      actualConverted === expectedConverted
        ? pass(
            "CONVERTED count unchanged",
            `expected ${expectedConverted}, actual ${actualConverted}`
          )
        : fail(
            "CONVERTED count unchanged",
            `expected ${expectedConverted}, actual ${actualConverted}`
          )
    );

    results.push(
      convCount === expectedConversionCount
        ? pass(
            "Conversion count matches CONVERTED lead count",
            `expected ${expectedConversionCount}, actual ${convCount}`
          )
        : fail(
            "Conversion count matches CONVERTED lead count",
            `expected ${expectedConversionCount}, actual ${convCount}`
          )
    );

    if (pre.amount_sum_converted !== null && convSum !== null) {
      const preSum = parseFloat(pre.amount_sum_converted);
      const postSum = parseFloat(convSum);
      const sumMatch = Math.abs(preSum - postSum) < 0.01;
      results.push(
        sumMatch
          ? pass(
              "Conversion amount sum matches pre-migration CONVERTED sum",
              `pre=${pre.amount_sum_converted}, post=${convSum}`
            )
          : fail(
              "Conversion amount sum matches pre-migration CONVERTED sum",
              `pre=${pre.amount_sum_converted}, post=${convSum}`
            )
      );
    }
  }

  printResults(results);

  const failures = results.filter((r) => !r.pass);
  if (failures.length > 0) {
    console.error(`${failures.length} check(s) FAILED.`);
    process.exit(1);
  } else {
    console.log(`All ${results.length} checks PASSED.`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const client = new Client({ connectionString: DATABASE_URL });

try {
  await client.connect();

  if (isSnapshot) {
    await runSnapshot(client);
  } else {
    let baseline: BaselineSnapshot | null = null;
    if (baselinePath) {
      const raw = await fs.readFile(baselinePath, "utf8");
      baseline = JSON.parse(raw) as BaselineSnapshot;
      console.log(`Loaded baseline from: ${baselinePath}`);
    }
    await runValidation(client, baseline);
  }
} finally {
  await client.end();
}
