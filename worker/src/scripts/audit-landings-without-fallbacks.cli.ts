/**
 * audit-landings-without-fallbacks.cli.ts
 *
 * Pre-deploy gate: verifies that every ACTIVE Landing has at least one
 * LandingFallbackPhone row. This must be run (and pass) before deploying
 * the lead-phone-fallback-chain change to any environment.
 *
 * Usage:
 *   DATABASE_URL=<url> tsx src/scripts/audit-landings-without-fallbacks.cli.ts
 *
 * Exit codes:
 *   0 — all ACTIVE landings have ≥1 fallback phone (deploy gate PASSED)
 *   1 — one or more ACTIVE landings have 0 fallback phones (deploy gate BLOCKED)
 */

import { Client } from "pg";
import process from "node:process";
import { auditLandingsWithoutFallbacks } from "./audit-landings-without-fallbacks.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required.");
  process.exit(1);
}

const client = new Client({ connectionString: DATABASE_URL });

try {
  await client.connect();

  const queryFn = async () => {
    const result = await client.query<{
      id: string;
      metaPixelId: string;
      url: string;
    }>(
      `SELECT l.id, l."metaPixelId", l.url
       FROM "Landing" l
       LEFT JOIN "LandingFallbackPhone" f ON f."landingId" = l.id
       WHERE l.status = 'ACTIVE'
       GROUP BY l.id, l."metaPixelId", l.url
       HAVING COUNT(f.id) = 0
       ORDER BY l.id`
    );
    return result.rows;
  };

  const auditResult = await auditLandingsWithoutFallbacks(queryFn);

  if (auditResult.ok) {
    console.log("OK: all ACTIVE landings have ≥1 fallback phone.");
    console.log("Deploy gate: PASSED");
    process.exit(0);
  } else {
    console.error(
      `BLOCKED: ${auditResult.violatingIds.length} ACTIVE landing(s) have 0 fallback phones.`
    );
    console.error(
      "Add ≥1 E.164 fallback phone to each landing before deploying.\n"
    );
    console.error("Offending landings:");
    for (const row of auditResult.rows) {
      console.error(`  id=${row.id}  metaPixelId=${row.metaPixelId}  url=${row.url}`);
    }
    console.error("\nDeploy gate: BLOCKED");
    process.exit(1);
  }
} finally {
  await client.end();
}
