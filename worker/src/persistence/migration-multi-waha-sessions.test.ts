/**
 * Migration smoke test for multi-waha-sessions.
 *
 * TDD phase: RED first (migration file not yet applied), GREEN after migration
 * exists at 20260516120000_multi-waha-sessions/migration.sql.
 *
 * This test:
 * 1. Spins up a Postgres 16 testcontainer.
 * 2. Applies all migrations EXCEPT the new multi-waha-sessions one.
 * 3. Seeds data representing all pre-migration states:
 *    - Cashiers with sessionName + CashierLanding rows (the realistic case)
 *    - Cashier with no sessionName (no session backfill expected)
 * 4. Applies the new migration.
 * 5. Asserts post-migration invariants (task A9 acceptance criteria):
 *    (a) One WhatsappSession per pre-existing Cashier.sessionName (non-null)
 *    (b) WhatsappSessionLanding count equals pre-migration CashierLanding count
 *    (c) Dropped columns are gone from Cashier
 *    (d) CashierLanding table no longer exists
 *    (e) WhatsappSession fields are correctly backfilled
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

const NEW_MIGRATION_DIR = "20260516120000_multi-waha-sessions";

// Deterministic UUIDs for seed data
const SEED = {
  users: {
    cashier1: "aaaaaaaa-0000-0000-0000-000000000001",
    cashier2: "aaaaaaaa-0000-0000-0000-000000000002",
    cashier3: "aaaaaaaa-0000-0000-0000-000000000003", // no sessionName
  },
  cashiers: {
    withSession1: "bbbbbbbb-0000-0000-0000-000000000001",
    withSession2: "bbbbbbbb-0000-0000-0000-000000000002",
    noSession:    "bbbbbbbb-0000-0000-0000-000000000003",
  },
  landings: {
    landing1: "cccccccc-0000-0000-0000-000000000001",
    landing2: "cccccccc-0000-0000-0000-000000000002",
    landing3: "cccccccc-0000-0000-0000-000000000003",
  },
};

// How many CashierLanding rows we seed (used for assertion (b))
// cashier1 → landing1, landing2  (2 rows)
// cashier2 → landing2, landing3  (2 rows)
// cashier3 has no session → no CashierLanding (to test that case too)
const SEEDED_CASHIER_LANDING_COUNT = 4;
// Cashiers WITH a sessionName (used for assertion (a))
const CASHIERS_WITH_SESSION_COUNT = 2;

describe("migration: multi-waha-sessions", { timeout: 120_000 }, () => {
  let ctx: TestcontainerContext;
  let client: Client;

  before(async () => {
    ctx = await startPostgresContainer();

    // Apply all existing migrations EXCEPT the new one
    await applyMigrations(ctx.databaseUrl, NEW_MIGRATION_DIR);

    client = new Client({ connectionString: ctx.databaseUrl });
    await client.connect();

    // --- Seed Users ---
    await client.query(
      `INSERT INTO "User" (id, name, username, password, role, "createdAt", "updatedAt")
       VALUES
         ($1, 'Cashier One',   'cashier1', 'hashed', 'CASHIER', now(), now()),
         ($2, 'Cashier Two',   'cashier2', 'hashed', 'CASHIER', now(), now()),
         ($3, 'Cashier Three', 'cashier3', 'hashed', 'CASHIER', now(), now())`,
      [SEED.users.cashier1, SEED.users.cashier2, SEED.users.cashier3]
    );

    // --- Seed Cashiers ---
    // cashier1: has sessionName + whatsapp fields
    await client.query(
      `INSERT INTO "Cashier" (id, "userId", "sessionName", "whatsappPhoneNumber",
                              "whatsappLinkRefreshCount", "whatsappLinkUpdatedAt",
                              status, "createdAt", "updatedAt")
       VALUES ($1, $2, 'session-cashier-1', '+5491111111111', 2, now(), 'ACTIVE', now(), now())`,
      [SEED.cashiers.withSession1, SEED.users.cashier1]
    );
    // cashier2: has sessionName but no phone
    await client.query(
      `INSERT INTO "Cashier" (id, "userId", "sessionName", "whatsappPhoneNumber",
                              "whatsappLinkRefreshCount", "whatsappLinkUpdatedAt",
                              status, "createdAt", "updatedAt")
       VALUES ($1, $2, 'session-cashier-2', NULL, 0, NULL, 'ACTIVE', now(), now())`,
      [SEED.cashiers.withSession2, SEED.users.cashier2]
    );
    // cashier3: no sessionName (NULL)
    await client.query(
      `INSERT INTO "Cashier" (id, "userId", "sessionName", "whatsappPhoneNumber",
                              "whatsappLinkRefreshCount", "whatsappLinkUpdatedAt",
                              status, "createdAt", "updatedAt")
       VALUES ($1, $2, NULL, NULL, 0, NULL, 'ACTIVE', now(), now())`,
      [SEED.cashiers.noSession, SEED.users.cashier3]
    );

    // --- Seed Landings ---
    await client.query(
      `INSERT INTO "Landing" (id, url, "metaPixelId", "metaAccessToken", status, "createdAt", "updatedAt")
       VALUES
         ($1, 'https://l1.example.com', 'pixel-001', 'token-001', 'ACTIVE', now(), now()),
         ($2, 'https://l2.example.com', 'pixel-002', 'token-002', 'ACTIVE', now(), now()),
         ($3, 'https://l3.example.com', 'pixel-003', 'token-003', 'ACTIVE', now(), now())`,
      [SEED.landings.landing1, SEED.landings.landing2, SEED.landings.landing3]
    );

    // --- Seed CashierLanding rows ---
    // cashier1 → landing1, landing2
    await client.query(
      `INSERT INTO "CashierLanding" ("cashierId", "landingId")
       VALUES ($1, $2), ($1, $3)`,
      [SEED.cashiers.withSession1, SEED.landings.landing1, SEED.landings.landing2]
    );
    // cashier2 → landing2, landing3
    await client.query(
      `INSERT INTO "CashierLanding" ("cashierId", "landingId")
       VALUES ($1, $2), ($1, $3)`,
      [SEED.cashiers.withSession2, SEED.landings.landing2, SEED.landings.landing3]
    );
    // cashier3 → no CashierLanding rows (intentional)

    // Apply the new migration
    await applySingleMigration(ctx.databaseUrl, NEW_MIGRATION_DIR);
  });

  after(async () => {
    await client.end();
    await ctx.stop();
  });

  // ── (a) WhatsappSession count == cashiers with sessionName ──────────────

  it("(a) WhatsappSession count equals cashiers that had a sessionName", async () => {
    const res = await client.query(
      `SELECT count(*)::int AS cnt FROM "WhatsappSession"`
    );
    assert.equal(
      res.rows[0].cnt,
      CASHIERS_WITH_SESSION_COUNT,
      `Expected ${CASHIERS_WITH_SESSION_COUNT} WhatsappSession rows`
    );
  });

  it("(a) Cashier with no sessionName has no WhatsappSession", async () => {
    const res = await client.query(
      `SELECT count(*)::int AS cnt FROM "WhatsappSession" WHERE "cashierId" = $1`,
      [SEED.cashiers.noSession]
    );
    assert.equal(res.rows[0].cnt, 0, "No-session cashier must not have a WhatsappSession");
  });

  it("(a) WhatsappSession.sessionName backfilled correctly for cashier1", async () => {
    const res = await client.query(
      `SELECT "sessionName", "whatsappPhoneNumber", "refreshCount"
       FROM "WhatsappSession"
       WHERE "cashierId" = $1`,
      [SEED.cashiers.withSession1]
    );
    assert.equal(res.rowCount, 1, "cashier1 must have exactly one session");
    assert.equal(res.rows[0].sessionName, "session-cashier-1");
    assert.equal(res.rows[0].whatsappPhoneNumber, "+5491111111111");
    assert.equal(res.rows[0].refreshCount, 2, "refreshCount must be backfilled from whatsappLinkRefreshCount");
  });

  it("(a) WhatsappSession.sessionName backfilled correctly for cashier2 (no phone)", async () => {
    const res = await client.query(
      `SELECT "sessionName", "whatsappPhoneNumber", "refreshCount"
       FROM "WhatsappSession"
       WHERE "cashierId" = $1`,
      [SEED.cashiers.withSession2]
    );
    assert.equal(res.rowCount, 1, "cashier2 must have exactly one session");
    assert.equal(res.rows[0].sessionName, "session-cashier-2");
    assert.equal(res.rows[0].whatsappPhoneNumber, null);
    assert.equal(res.rows[0].refreshCount, 0);
  });

  // ── (b) WhatsappSessionLanding count == pre-migration CashierLanding count ──

  it("(b) WhatsappSessionLanding count equals pre-migration CashierLanding count", async () => {
    const res = await client.query(
      `SELECT count(*)::int AS cnt FROM "WhatsappSessionLanding"`
    );
    assert.equal(
      res.rows[0].cnt,
      SEEDED_CASHIER_LANDING_COUNT,
      `Expected ${SEEDED_CASHIER_LANDING_COUNT} WhatsappSessionLanding rows`
    );
  });

  it("(b) WhatsappSessionLanding correctly maps cashier1 sessions to landing1 and landing2", async () => {
    const res = await client.query(
      `SELECT wsl."landingId"
       FROM "WhatsappSessionLanding" wsl
       JOIN "WhatsappSession" ws ON ws.id = wsl."sessionId"
       WHERE ws."cashierId" = $1
       ORDER BY wsl."landingId"`,
      [SEED.cashiers.withSession1]
    );
    assert.equal(res.rowCount, 2, "cashier1 session must be bound to 2 landings");
    const landingIds = res.rows.map((r: { landingId: string }) => r.landingId).sort();
    assert.deepEqual(landingIds, [SEED.landings.landing1, SEED.landings.landing2].sort());
  });

  it("(b) WhatsappSessionLanding correctly maps cashier2 sessions to landing2 and landing3", async () => {
    const res = await client.query(
      `SELECT wsl."landingId"
       FROM "WhatsappSessionLanding" wsl
       JOIN "WhatsappSession" ws ON ws.id = wsl."sessionId"
       WHERE ws."cashierId" = $1
       ORDER BY wsl."landingId"`,
      [SEED.cashiers.withSession2]
    );
    assert.equal(res.rowCount, 2, "cashier2 session must be bound to 2 landings");
    const landingIds = res.rows.map((r: { landingId: string }) => r.landingId).sort();
    assert.deepEqual(landingIds, [SEED.landings.landing2, SEED.landings.landing3].sort());
  });

  // ── (c) Dropped Cashier columns are gone ─────────────────────────────────

  it("(c) Cashier.sessionName column no longer exists", async () => {
    const res = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'Cashier' AND column_name = 'sessionName'`
    );
    assert.equal(res.rowCount, 0, "Cashier.sessionName should not exist after migration");
  });

  it("(c) Cashier.whatsappPhoneNumber column no longer exists", async () => {
    const res = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'Cashier' AND column_name = 'whatsappPhoneNumber'`
    );
    assert.equal(res.rowCount, 0, "Cashier.whatsappPhoneNumber should not exist after migration");
  });

  it("(c) Cashier.whatsappLinkRefreshCount column no longer exists", async () => {
    const res = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'Cashier' AND column_name = 'whatsappLinkRefreshCount'`
    );
    assert.equal(res.rowCount, 0, "Cashier.whatsappLinkRefreshCount should not exist after migration");
  });

  it("(c) Cashier.whatsappLinkUpdatedAt column no longer exists", async () => {
    const res = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'Cashier' AND column_name = 'whatsappLinkUpdatedAt'`
    );
    assert.equal(res.rowCount, 0, "Cashier.whatsappLinkUpdatedAt should not exist after migration");
  });

  it("(c) Cashier.maxSessions column exists with default 1", async () => {
    const res = await client.query(
      `SELECT column_name, column_default
       FROM information_schema.columns
       WHERE table_name = 'Cashier' AND column_name = 'maxSessions'`
    );
    assert.equal(res.rowCount, 1, "Cashier.maxSessions must exist");
    assert.ok(
      res.rows[0].column_default?.includes("1"),
      "Cashier.maxSessions default must be 1"
    );
  });

  // ── (d) CashierLanding table no longer exists ────────────────────────────

  it("(d) CashierLanding table no longer exists", async () => {
    const res = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'CashierLanding'`
    );
    assert.equal(res.rowCount, 0, "CashierLanding table must be dropped after migration");
  });

  // ── Schema integrity ──────────────────────────────────────────────────────

  it("WhatsappSession table has expected columns", async () => {
    const res = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'WhatsappSession'
       ORDER BY column_name`
    );
    const cols = res.rows.map((r: { column_name: string }) => r.column_name);
    const expected = ["cashierId", "createdAt", "id", "lastRefreshAt", "refreshCount", "sessionName", "updatedAt", "whatsappPhoneNumber"];
    for (const col of expected) {
      assert.ok(cols.includes(col), `WhatsappSession must have column: ${col}`);
    }
  });

  it("WhatsappSession.sessionName is unique (constraint exists)", async () => {
    const res = await client.query(
      `SELECT indexname FROM pg_indexes
       WHERE tablename = 'WhatsappSession'
         AND indexname = 'WhatsappSession_sessionName_key'`
    );
    assert.ok(
      (res.rowCount ?? 0) > 0,
      "WhatsappSession_sessionName_key unique index must exist"
    );
  });

  it("WhatsappSession has FK to Cashier", async () => {
    const res = await client.query(
      `SELECT rc.constraint_name
       FROM information_schema.referential_constraints rc
       JOIN information_schema.table_constraints tc
         ON tc.constraint_name = rc.constraint_name
       WHERE tc.table_name = 'WhatsappSession'`
    );
    assert.ok(
      (res.rowCount ?? 0) > 0,
      "WhatsappSession must have at least one FK (to Cashier)"
    );
  });

  it("WhatsappSessionLanding has ON DELETE CASCADE for sessionId FK", async () => {
    const res = await client.query(
      `SELECT rc.delete_rule
       FROM information_schema.referential_constraints rc
       JOIN information_schema.table_constraints tc
         ON tc.constraint_name = rc.constraint_name
       WHERE tc.table_name = 'WhatsappSessionLanding'
         AND rc.delete_rule = 'CASCADE'`
    );
    assert.ok(
      (res.rowCount ?? 0) > 0,
      "WhatsappSessionLanding must have at least one CASCADE FK"
    );
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
});
