/**
 * Migration smoke test for auto-conversions-ocr.
 *
 * TDD phase: RED first (migration not yet applied), GREEN after migration is applied.
 *
 * This test:
 * 1. Spins up a Postgres 16 testcontainer.
 * 2. Applies all migrations EXCEPT the new auto-conversions-ocr one.
 * 3. Seeds representative data (User, Cashier, Lead, Conversion rows).
 * 4. Applies the new migration.
 * 5. Asserts all post-migration invariants:
 *    (a) Conversion.source column exists, VARCHAR, default 'MANUAL', backfilled
 *    (b) Conversion.cashierId column exists, nullable TEXT, backfilled from Lead
 *    (c) Conversion.sourceMessageId column exists, nullable VARCHAR(128)
 *    (d) Index conversion_source_msg_idx exists
 *    (e) Partial unique index conversion_cashier_source_msg_uniq exists with WHERE clause
 *    (f) Expression index lead_phone_digits exists on Lead
 *    (g) SystemSetting table exists with correct columns
 *    (h) Migration record is tracked in _prisma_migrations
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

const NEW_MIGRATION_DIR = "20260517120000_auto-conversions-ocr";

// Deterministic UUIDs for seed data
const SEED = {
  users: {
    cashier1: "aaaaaaaa-1111-0000-0000-000000000001",
    cashier2: "aaaaaaaa-1111-0000-0000-000000000002",
  },
  cashiers: {
    cashier1: "bbbbbbbb-1111-0000-0000-000000000001",
    cashier2: "bbbbbbbb-1111-0000-0000-000000000002",
  },
  landings: {
    landing1: "cccccccc-1111-0000-0000-000000000001",
  },
  sessions: {
    session1: "dddddddd-1111-0000-0000-000000000001",
  },
  leads: {
    lead1: "eeeeeeee-1111-0000-0000-000000000001",
    lead2: "eeeeeeee-1111-0000-0000-000000000002",
  },
  conversions: {
    conv1: "ffffffff-1111-0000-0000-000000000001",
    conv2: "ffffffff-1111-0000-0000-000000000002",
  },
};

describe("migration: auto-conversions-ocr", { timeout: 120_000 }, () => {
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
         ($1, 'Cashier One', 'cashier_ocr_1', 'hashed', 'CASHIER', now(), now()),
         ($2, 'Cashier Two', 'cashier_ocr_2', 'hashed', 'CASHIER', now(), now())`,
      [SEED.users.cashier1, SEED.users.cashier2]
    );

    // --- Seed Cashiers ---
    await client.query(
      `INSERT INTO "Cashier" (id, "userId", status, "createdAt", "updatedAt")
       VALUES
         ($1, $2, 'ACTIVE', now(), now()),
         ($3, $4, 'ACTIVE', now(), now())`,
      [SEED.cashiers.cashier1, SEED.users.cashier1, SEED.cashiers.cashier2, SEED.users.cashier2]
    );

    // --- Seed Landing ---
    await client.query(
      `INSERT INTO "Landing" (id, url, "metaPixelId", "metaAccessToken", status, "createdAt", "updatedAt")
       VALUES ($1, 'https://ocr.example.com', 'pixel-ocr-1', 'token-ocr-1', 'ACTIVE', now(), now())`,
      [SEED.landings.landing1]
    );

    // --- Seed WhatsappSession ---
    await client.query(
      `INSERT INTO "WhatsappSession" (id, "cashierId", "sessionName", "createdAt", "updatedAt")
       VALUES ($1, $2, 'ocr-session-1', now(), now())`,
      [SEED.sessions.session1, SEED.cashiers.cashier1]
    );

    // --- Seed Leads ---
    await client.query(
      `INSERT INTO "Lead" (id, code, fbc, fbp, "metaPixelId", status, "userAgent", phone, "cashierId", "createdAt", "updateAt")
       VALUES
         ($1, 'CODE-OCR-1', 'fbc1', 'fbp1', 'pixel-ocr-1', 'CONTACTED', 'UA', '+5491122334455', $3, now(), now()),
         ($2, 'CODE-OCR-2', 'fbc2', 'fbp2', 'pixel-ocr-1', 'CONTACTED', 'UA', '+5499887766554', $4, now(), now())`,
      [SEED.leads.lead1, SEED.leads.lead2, SEED.cashiers.cashier1, SEED.cashiers.cashier2]
    );

    // --- Seed Conversions (pre-migration — no source/cashierId/sourceMessageId columns yet) ---
    await client.query(
      `INSERT INTO "Conversion" (id, "leadId", amount, "createdAt")
       VALUES
         ($1, $3, 100.00, now()),
         ($2, $4, 200.00, now())`,
      [SEED.conversions.conv1, SEED.conversions.conv2, SEED.leads.lead1, SEED.leads.lead2]
    );

    // Apply the new migration
    await applySingleMigration(ctx.databaseUrl, NEW_MIGRATION_DIR);
  });

  after(async () => {
    await client.end();
    await ctx.stop();
  });

  // ── (a) Conversion.source column ────────────────────────────────────────────

  it("(a) Conversion.source column exists with VARCHAR type", async () => {
    const res = await client.query(
      `SELECT column_name, data_type, character_maximum_length
       FROM information_schema.columns
       WHERE table_name = 'Conversion' AND column_name = 'source'`
    );
    assert.equal(res.rowCount, 1, "Conversion.source column must exist");
    assert.equal(res.rows[0].data_type, "character varying", "source must be VARCHAR");
    assert.equal(
      res.rows[0].character_maximum_length,
      16,
      "source VARCHAR length must be 16"
    );
  });

  it("(a) Conversion.source is backfilled to MANUAL for all existing rows", async () => {
    const res = await client.query(
      `SELECT count(*)::int AS cnt FROM "Conversion" WHERE "source" != 'MANUAL' OR "source" IS NULL`
    );
    assert.equal(
      res.rows[0].cnt,
      0,
      "All pre-existing Conversion rows must have source = 'MANUAL' after backfill"
    );
  });

  it("(a) Conversion.source backfill: both seeded rows have source = MANUAL", async () => {
    const res = await client.query(
      `SELECT id, source FROM "Conversion" WHERE id IN ($1, $2) ORDER BY "createdAt"`,
      [SEED.conversions.conv1, SEED.conversions.conv2]
    );
    assert.equal(res.rowCount, 2, "Both seeded conversions must be present");
    for (const row of res.rows) {
      assert.equal(row.source, "MANUAL", `Conversion ${row.id} must have source='MANUAL'`);
    }
  });

  // ── (b) Conversion.cashierId column ─────────────────────────────────────────

  it("(b) Conversion.cashierId column exists, nullable TEXT", async () => {
    const res = await client.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'Conversion' AND column_name = 'cashierId'`
    );
    assert.equal(res.rowCount, 1, "Conversion.cashierId column must exist");
    assert.equal(res.rows[0].data_type, "text", "cashierId must be TEXT type");
    assert.equal(res.rows[0].is_nullable, "YES", "cashierId must be nullable");
  });

  it("(b) Conversion.cashierId is backfilled from Lead for conv1", async () => {
    const res = await client.query(
      `SELECT "cashierId" FROM "Conversion" WHERE id = $1`,
      [SEED.conversions.conv1]
    );
    assert.equal(res.rowCount, 1);
    assert.equal(
      res.rows[0].cashierId,
      SEED.cashiers.cashier1,
      "conv1 cashierId must match lead1's cashierId"
    );
  });

  it("(b) Conversion.cashierId is backfilled from Lead for conv2", async () => {
    const res = await client.query(
      `SELECT "cashierId" FROM "Conversion" WHERE id = $1`,
      [SEED.conversions.conv2]
    );
    assert.equal(res.rowCount, 1);
    assert.equal(
      res.rows[0].cashierId,
      SEED.cashiers.cashier2,
      "conv2 cashierId must match lead2's cashierId"
    );
  });

  // ── (c) Conversion.sourceMessageId column ───────────────────────────────────

  it("(c) Conversion.sourceMessageId column exists, nullable VARCHAR(128)", async () => {
    const res = await client.query(
      `SELECT column_name, data_type, character_maximum_length, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'Conversion' AND column_name = 'sourceMessageId'`
    );
    assert.equal(res.rowCount, 1, "Conversion.sourceMessageId column must exist");
    assert.equal(res.rows[0].data_type, "character varying");
    assert.equal(res.rows[0].character_maximum_length, 128);
    assert.equal(res.rows[0].is_nullable, "YES", "sourceMessageId must be nullable");
  });

  it("(c) Conversion.sourceMessageId is NULL for all pre-existing rows (no backfill expected)", async () => {
    const res = await client.query(
      `SELECT count(*)::int AS cnt FROM "Conversion" WHERE "sourceMessageId" IS NOT NULL`
    );
    assert.equal(
      res.rows[0].cnt,
      0,
      "Pre-existing rows must have sourceMessageId = NULL (no backfill)"
    );
  });

  // ── (d) Index conversion_source_msg_idx ─────────────────────────────────────

  it("(d) Index conversion_source_msg_idx exists on Conversion.sourceMessageId", async () => {
    const res = await client.query(
      `SELECT indexname FROM pg_indexes
       WHERE tablename = 'Conversion'
         AND indexname = 'conversion_source_msg_idx'`
    );
    assert.ok(
      (res.rowCount ?? 0) > 0,
      "Index conversion_source_msg_idx must exist on Conversion"
    );
  });

  // ── (e) Partial unique index conversion_cashier_source_msg_uniq ─────────────

  it("(e) Partial unique index conversion_cashier_source_msg_uniq exists with WHERE clause", async () => {
    const res = await client.query(
      `SELECT indexname, indexdef
       FROM pg_indexes
       WHERE tablename = 'Conversion'
         AND indexname = 'conversion_cashier_source_msg_uniq'`
    );
    assert.ok(
      (res.rowCount ?? 0) > 0,
      "Partial unique index conversion_cashier_source_msg_uniq must exist"
    );
    const def: string = res.rows[0].indexdef;
    assert.ok(
      def.toLowerCase().includes("where"),
      "The partial unique index must have a WHERE clause"
    );
    assert.ok(
      def.toLowerCase().includes("sourcemessageid"),
      "The WHERE clause must reference sourceMessageId"
    );
  });

  it("(e) Partial unique index: duplicate (cashierId, sourceMessageId) is rejected", async () => {
    const cashierId = SEED.cashiers.cashier1;
    const msgId = "test-msg-dedup-1";

    // Insert first conversion with a sourceMessageId
    await client.query(
      `INSERT INTO "Conversion" (id, "leadId", amount, "cashierId", "sourceMessageId", "createdAt")
       VALUES ($1, $2, 50.00, $3, $4, now())`,
      ["ffffffff-2222-0000-0000-000000000001", SEED.leads.lead1, cashierId, msgId]
    );

    // Attempting a second one with the same (cashierId, sourceMessageId) must fail
    await assert.rejects(
      () =>
        client.query(
          `INSERT INTO "Conversion" (id, "leadId", amount, "cashierId", "sourceMessageId", "createdAt")
           VALUES ($1, $2, 75.00, $3, $4, now())`,
          ["ffffffff-2222-0000-0000-000000000002", SEED.leads.lead1, cashierId, msgId]
        ),
      /unique/i,
      "Duplicate (cashierId, sourceMessageId) must be rejected by the partial unique index"
    );
  });

  it("(e) Partial unique: multiple NULL sourceMessageId is allowed (partial index does not apply)", async () => {
    // Two rows with same cashierId but sourceMessageId=NULL should NOT conflict
    await client.query(
      `INSERT INTO "Conversion" (id, "leadId", amount, "cashierId", "sourceMessageId", "createdAt")
       VALUES
         ($1, $2, 10.00, $3, NULL, now()),
         ($4, $2, 20.00, $3, NULL, now())`,
      [
        "ffffffff-3333-0000-0000-000000000001",
        SEED.leads.lead1,
        SEED.cashiers.cashier1,
        "ffffffff-3333-0000-0000-000000000002",
      ]
    );
    const res = await client.query(
      `SELECT count(*)::int AS cnt FROM "Conversion"
       WHERE "cashierId" = $1 AND "sourceMessageId" IS NULL`,
      [SEED.cashiers.cashier1]
    );
    // conv1 (backfilled, NULL sourceMessageId) + the two just inserted = 3
    assert.ok(
      res.rows[0].cnt >= 2,
      "Multiple NULL sourceMessageId rows for same cashier must be allowed"
    );
  });

  // ── (f) Expression index lead_phone_digits ───────────────────────────────────

  it("(f) Expression index lead_phone_digits exists on Lead", async () => {
    const res = await client.query(
      `SELECT indexname FROM pg_indexes
       WHERE tablename = 'Lead'
         AND indexname = 'lead_phone_digits'`
    );
    assert.ok(
      (res.rowCount ?? 0) > 0,
      "Expression index lead_phone_digits must exist on Lead"
    );
  });

  it("(f) lead_phone_digits index is an expression index (regexp_replace)", async () => {
    const res = await client.query(
      `SELECT indexdef FROM pg_indexes
       WHERE tablename = 'Lead'
         AND indexname = 'lead_phone_digits'`
    );
    assert.ok((res.rowCount ?? 0) > 0, "lead_phone_digits must exist");
    const def: string = res.rows[0].indexdef;
    assert.ok(
      def.toLowerCase().includes("regexp_replace"),
      "lead_phone_digits must use regexp_replace expression"
    );
  });

  // ── (g) SystemSetting table ──────────────────────────────────────────────────

  it("(g) SystemSetting table exists", async () => {
    const res = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'SystemSetting'`
    );
    assert.equal(res.rowCount, 1, "SystemSetting table must exist");
  });

  it("(g) SystemSetting has key as primary key column", async () => {
    const res = await client.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_name = 'SystemSetting' AND column_name = 'key'`
    );
    assert.equal(res.rowCount, 1, "SystemSetting.key column must exist");
    assert.equal(res.rows[0].data_type, "text");
  });

  it("(g) SystemSetting has value column (TEXT NOT NULL)", async () => {
    const res = await client.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'SystemSetting' AND column_name = 'value'`
    );
    assert.equal(res.rowCount, 1, "SystemSetting.value column must exist");
    assert.equal(res.rows[0].data_type, "text");
    assert.equal(res.rows[0].is_nullable, "NO", "SystemSetting.value must be NOT NULL");
  });

  it("(g) SystemSetting has updatedAt column (TIMESTAMPTZ)", async () => {
    const res = await client.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_name = 'SystemSetting' AND column_name = 'updatedAt'`
    );
    assert.equal(res.rowCount, 1, "SystemSetting.updatedAt column must exist");
    assert.ok(
      res.rows[0].data_type.includes("timestamp"),
      "SystemSetting.updatedAt must be a timestamp type"
    );
  });

  it("(g) SystemSetting key is the primary key", async () => {
    const res = await client.query(
      `SELECT constraint_name
       FROM information_schema.table_constraints
       WHERE table_name = 'SystemSetting'
         AND constraint_type = 'PRIMARY KEY'`
    );
    assert.ok(
      (res.rowCount ?? 0) > 0,
      "SystemSetting must have a PRIMARY KEY constraint"
    );
  });

  it("(g) SystemSetting allows insert and retrieval", async () => {
    await client.query(
      `INSERT INTO "SystemSetting" (key, value, "updatedAt")
       VALUES ('auto_conversion_trigger', 'comprobante', now())`
    );
    const res = await client.query(
      `SELECT value FROM "SystemSetting" WHERE key = 'auto_conversion_trigger'`
    );
    assert.equal(res.rowCount, 1);
    assert.equal(res.rows[0].value, "comprobante");
  });

  // ── (h) Migration tracking ───────────────────────────────────────────────────

  it("(h) Migration record exists in _prisma_migrations", async () => {
    const res = await client.query(
      `SELECT migration_name FROM "_prisma_migrations"
       WHERE migration_name = $1`,
      [NEW_MIGRATION_DIR]
    );
    assert.ok(
      (res.rowCount ?? 0) > 0,
      "Migration must be recorded in _prisma_migrations"
    );
  });
});
