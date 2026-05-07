/**
 * Migration test for meta-conversions-refactor.
 *
 * TDD phase: RED first (migration doesn't exist), GREEN after M1.2.
 *
 * This test:
 * 1. Spins up a Postgres 16 testcontainer.
 * 2. Applies all migrations EXCEPT the new meta-conversions one.
 * 3. Seeds leads representing all spec-relevant states.
 * 4. Applies the new migration.
 * 5. Asserts post-migration invariants.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import {
  startPostgresContainer,
  applyMigrations,
  applySingleMigration,
  type TestcontainerContext,
} from "../test-utils/postgres-testcontainer.js";

// Directory name of the new migration (must match the actual directory created in M1.2)
const NEW_MIGRATION_DIR = "20260506120000_meta_conversions_refactor";

// Amounts for CONVERTED leads — used in sum assertion
const CONVERTED_AMOUNT_1 = "5000.00";
const CONVERTED_AMOUNT_2 = "3000.00";
const EXPECTED_SUM = "8000.00";

// UUIDs for seed data (deterministic, easier to assert)
const SEED = {
  user: {
    notContacted1: "11111111-0000-0000-0000-000000000001",
    notContacted2: "11111111-0000-0000-0000-000000000002",
    contacted1: "22222222-0000-0000-0000-000000000001",
    contacted2: "22222222-0000-0000-0000-000000000002",
    expiredWithCashier1: "33333333-0000-0000-0000-000000000001",
    expiredWithCashier2: "33333333-0000-0000-0000-000000000002",
    expiredNoCashier1: "44444444-0000-0000-0000-000000000001",
    expiredNoCashier2: "44444444-0000-0000-0000-000000000002",
    converted1: "55555555-0000-0000-0000-000000000001",
    converted2: "55555555-0000-0000-0000-000000000002",
  },
  cashier: {
    id: "cccccccc-0000-0000-0000-000000000001",
    userId: "cccccccc-1111-0000-0000-000000000001",
  },
};

describe("migration: meta-conversions-refactor", { timeout: 120_000 }, () => {
  let ctx: TestcontainerContext;
  let client: Client;

  before(async () => {
    ctx = await startPostgresContainer();

    // Apply all existing migrations EXCEPT the new one
    await applyMigrations(ctx.databaseUrl, NEW_MIGRATION_DIR);

    client = new Client({ connectionString: ctx.databaseUrl });
    await client.connect();

    // Seed prerequisite: a cashier user + cashier record
    await client.query(`
      INSERT INTO "User" (id, name, username, password, role, "createdAt", "updatedAt")
      VALUES ($1, 'Test Cashier', 'cashier1', 'hashed', 'CASHIER', now(), now())
    `, [SEED.cashier.userId]);

    await client.query(`
      INSERT INTO "Cashier" (id, "userId", "status", "createdAt", "updatedAt")
      VALUES ($1, $2, 'ACTIVE', now(), now())
    `, [SEED.cashier.id, SEED.cashier.userId]);

    // Helper: insert a lead in pre-migration schema
    // Pre-migration Lead has: id, code, fbc, fbp, metaPixelId, amount(nullable),
    //   status, userAgent, phone, cashierId, expiresAt(NOT NULL), contactedAt,
    //   convertedAt, createdAt, updateAt, adCode
    const insertLead = async (
      id: string,
      code: string,
      status: "NOT_CONTACTED" | "CONTACTED" | "EXPIRED" | "CONVERTED",
      opts: {
        cashierId?: string;
        amount?: string;
        contactedAt?: string;
        convertedAt?: string;
      } = {}
    ) => {
      await client.query(
        `INSERT INTO "Lead"
           (id, code, fbc, fbp, "metaPixelId", status, "userAgent",
            phone, "cashierId", "expiresAt", "contactedAt", "convertedAt",
            "createdAt", "updateAt")
         VALUES
           ($1, $2, 'fbc-test', 'fbp-test', 'pixel-123', $3::\"LeadStatus\",
            'Mozilla/5.0', '+54911' || $2, $4,
            now() + interval '1 day',
            $5, $6,
            now(), now())`,
        [
          id,
          code,
          status,
          opts.cashierId ?? null,
          opts.contactedAt ?? null,
          opts.convertedAt ?? null,
        ]
      );
    };

    // 2 NOT_CONTACTED (cashierId NULL)
    await insertLead(SEED.user.notContacted1, "NC001", "NOT_CONTACTED");
    await insertLead(SEED.user.notContacted2, "NC002", "NOT_CONTACTED");

    // 2 CONTACTED (cashierId set, contactedAt set)
    await insertLead(SEED.user.contacted1, "CO001", "CONTACTED", {
      cashierId: SEED.cashier.id,
      contactedAt: "2026-01-10T10:00:00Z",
    });
    await insertLead(SEED.user.contacted2, "CO002", "CONTACTED", {
      cashierId: SEED.cashier.id,
      contactedAt: "2026-01-11T10:00:00Z",
    });

    // 2 EXPIRED with cashierId set (the prod-realistic case: 191 on prod, all with cashierId)
    await insertLead(SEED.user.expiredWithCashier1, "EX001", "EXPIRED", {
      cashierId: SEED.cashier.id,
      contactedAt: "2026-01-05T10:00:00Z",
    });
    await insertLead(SEED.user.expiredWithCashier2, "EX002", "EXPIRED", {
      cashierId: SEED.cashier.id,
      contactedAt: "2026-01-06T10:00:00Z",
    });

    // 2 EXPIRED with cashierId NULL (synthetic — 0 on prod, but covers the spec branch)
    await insertLead(SEED.user.expiredNoCashier1, "EX003", "EXPIRED");
    await insertLead(SEED.user.expiredNoCashier2, "EX004", "EXPIRED");

    // 2 CONVERTED (cashierId set, amount set, convertedAt set)
    await insertLead(SEED.user.converted1, "CV001", "CONVERTED", {
      cashierId: SEED.cashier.id,
      contactedAt: "2026-02-01T10:00:00Z",
      convertedAt: "2026-02-15T12:00:00Z",
      amount: CONVERTED_AMOUNT_1,
    });
    // Use raw UPDATE for amount since insertLead casts $3 as LeadStatus
    await client.query(
      `UPDATE "Lead" SET amount = $1 WHERE id = $2`,
      [CONVERTED_AMOUNT_1, SEED.user.converted1]
    );

    await insertLead(SEED.user.converted2, "CV002", "CONVERTED", {
      cashierId: SEED.cashier.id,
      contactedAt: "2026-02-05T10:00:00Z",
      convertedAt: "2026-02-20T12:00:00Z",
      amount: CONVERTED_AMOUNT_2,
    });
    await client.query(
      `UPDATE "Lead" SET amount = $1 WHERE id = $2`,
      [CONVERTED_AMOUNT_2, SEED.user.converted2]
    );

    // Apply the new migration (this is what makes the test GREEN after M1.2 exists)
    await applySingleMigration(ctx.databaseUrl, NEW_MIGRATION_DIR);
  });

  after(async () => {
    await client.end();
    await ctx.stop();
  });

  // ── Schema-level assertions ──────────────────────────────────────────────

  it("Lead.expiresAt column no longer exists", async () => {
    const res = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'Lead' AND column_name = 'expiresAt'`
    );
    assert.equal(res.rowCount, 0, "Lead.expiresAt should not exist");
  });

  it("Lead.amount column no longer exists", async () => {
    const res = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'Lead' AND column_name = 'amount'`
    );
    assert.equal(res.rowCount, 0, "Lead.amount should not exist");
  });

  it("Lead.convertedAt column no longer exists", async () => {
    const res = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'Lead' AND column_name = 'convertedAt'`
    );
    assert.equal(res.rowCount, 0, "Lead.convertedAt should not exist");
  });

  it("LeadStatus enum does not contain EXPIRED", async () => {
    const res = await client.query(
      `SELECT enumlabel FROM pg_enum
       JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
       WHERE pg_type.typname = 'LeadStatus' AND enumlabel = 'EXPIRED'`
    );
    assert.equal(res.rowCount, 0, "EXPIRED should not be in LeadStatus enum");
  });

  it("Conversion table exists with expected columns", async () => {
    const res = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'Conversion'
       ORDER BY column_name`
    );
    const cols = res.rows.map((r: { column_name: string }) => r.column_name);
    assert.ok(cols.includes("id"), "Conversion must have id");
    assert.ok(cols.includes("amount"), "Conversion must have amount");
    assert.ok(cols.includes("leadId"), "Conversion must have leadId");
    assert.ok(cols.includes("createdAt"), "Conversion must have createdAt");
  });

  it("Conversion has FK to Lead with ON DELETE CASCADE", async () => {
    const res = await client.query(
      `SELECT rc.delete_rule
       FROM information_schema.referential_constraints rc
       JOIN information_schema.table_constraints tc
         ON tc.constraint_name = rc.constraint_name
       WHERE tc.table_name = 'Conversion'
         AND rc.delete_rule = 'CASCADE'`
    );
    assert.ok(
      (res.rowCount ?? 0) > 0,
      "Conversion FK must have ON DELETE CASCADE"
    );
  });

  it("Conversion_leadId_createdAt_idx index exists", async () => {
    const res = await client.query(
      `SELECT indexname FROM pg_indexes
       WHERE tablename = 'Conversion'
         AND indexname = 'Conversion_leadId_createdAt_idx'`
    );
    assert.ok(
      (res.rowCount ?? 0) > 0,
      "Composite index Conversion_leadId_createdAt_idx must exist"
    );
  });

  // ── Data-level assertions ────────────────────────────────────────────────

  it("Conversion count equals seeded CONVERTED lead count (2)", async () => {
    const res = await client.query(`SELECT count(*)::int AS cnt FROM "Conversion"`);
    assert.equal(res.rows[0].cnt, 2, "Should have exactly 2 Conversion rows");
  });

  it("Conversion.amount sum matches seeded CONVERTED Lead.amount sum", async () => {
    const res = await client.query(
      `SELECT sum(amount)::numeric AS total FROM "Conversion"`
    );
    const actual = parseFloat(res.rows[0].total);
    const expected = parseFloat(EXPECTED_SUM);
    assert.equal(actual, expected, `Sum should be ${EXPECTED_SUM}`);
  });

  it("Each Conversion.createdAt matches originating Lead.convertedAt", async () => {
    // For converted1: convertedAt = '2026-02-15T12:00:00Z'
    const res = await client.query(
      `SELECT c."createdAt" AT TIME ZONE 'UTC' AS ts
       FROM "Conversion" c
       WHERE c."leadId" = $1`,
      [SEED.user.converted1]
    );
    assert.equal(res.rowCount, 1, "Should find Conversion for converted1");
    const actual = new Date(res.rows[0].ts).toISOString();
    assert.equal(
      actual,
      "2026-02-15T12:00:00.000Z",
      "createdAt must match convertedAt"
    );
  });

  it("No Lead has status=EXPIRED after migration", async () => {
    // EXPIRED no longer exists in enum, so we query by text cast
    const res = await client.query(
      `SELECT count(*)::int AS cnt FROM "Lead" WHERE status::text = 'EXPIRED'`
    );
    assert.equal(res.rows[0].cnt, 0, "No EXPIRED leads should remain");
  });

  it("CONTACTED count = 4 (2 original + 2 EXPIRED-with-cashier reclassified)", async () => {
    const res = await client.query(
      `SELECT count(*)::int AS cnt FROM "Lead" WHERE status = 'CONTACTED'`
    );
    assert.equal(res.rows[0].cnt, 4, "Expected 4 CONTACTED leads");
  });

  it("NOT_CONTACTED count = 4 (2 original + 2 EXPIRED-no-cashier reclassified)", async () => {
    const res = await client.query(
      `SELECT count(*)::int AS cnt FROM "Lead" WHERE status = 'NOT_CONTACTED'`
    );
    assert.equal(res.rows[0].cnt, 4, "Expected 4 NOT_CONTACTED leads");
  });

  it("CONVERTED count = 2 (unchanged)", async () => {
    const res = await client.query(
      `SELECT count(*)::int AS cnt FROM "Lead" WHERE status = 'CONVERTED'`
    );
    assert.equal(res.rows[0].cnt, 2, "Expected 2 CONVERTED leads");
  });

  it("Migration record exists in _prisma_migrations", async () => {
    const res = await client.query(
      `SELECT migration_name FROM "_prisma_migrations"
       WHERE migration_name = $1`,
      [NEW_MIGRATION_DIR]
    );
    assert.ok(
      (res.rowCount ?? 0) > 0,
      "Migration should be recorded in _prisma_migrations"
    );
  });

  it("Cascade delete: deleting a Lead removes its Conversions", async () => {
    // Insert a temp lead and conversion, then delete the lead
    const tempLeadId = "ffffffff-0000-0000-0000-000000000099";
    const tempUserId = "ffffffff-1111-0000-0000-000000000099";

    await client.query(`
      INSERT INTO "User" (id, name, username, password, role, "createdAt", "updatedAt")
      VALUES ($1, 'Temp', 'temp_user_cascade', 'pw', 'CASHIER', now(), now())
    `, [tempUserId]);

    await client.query(
      `INSERT INTO "Lead"
         (id, code, fbc, fbp, "metaPixelId", status, "userAgent",
          "cashierId", "contactedAt", "createdAt", "updateAt")
       VALUES ($1, 'TEMP999', 'f', 'f', 'p', 'CONVERTED', 'ua', null, null, now(), now())`,
      [tempLeadId]
    );
    await client.query(
      `INSERT INTO "Conversion" (id, "leadId", amount, "createdAt")
       VALUES (gen_random_uuid()::text, $1, 5000.00, now())`,
      [tempLeadId]
    );

    // Confirm conversion exists
    const before = await client.query(
      `SELECT count(*)::int AS cnt FROM "Conversion" WHERE "leadId" = $1`,
      [tempLeadId]
    );
    assert.equal(before.rows[0].cnt, 1, "Conversion should exist before delete");

    // Delete lead
    await client.query(`DELETE FROM "Lead" WHERE id = $1`, [tempLeadId]);

    // Conversion should be gone
    const after = await client.query(
      `SELECT count(*)::int AS cnt FROM "Conversion" WHERE "leadId" = $1`,
      [tempLeadId]
    );
    assert.equal(after.rows[0].cnt, 0, "Conversion should cascade-delete");
  });
});
