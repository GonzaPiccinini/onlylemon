/**
 * Migration + backfill + contract integration test for pixel-normalization-rekey.
 *
 * Two describe blocks:
 *   1. Expand phase (Phase 1): additive migration + backfill assertions.
 *   2. Contract phase (Phase 5): after expand+backfill, applies contract migration and
 *      validates the tightened schema (dropped legacy cols, NOT NULL FKs, RESTRICT).
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

const NEW_MIGRATION_DIR = "20260629120000_pixel_normalization_expand";

// ── Deterministic seed IDs ──────────────────────────────────────────────────

const SEED = {
  cashier: {
    userId: "cccccccc-1111-0000-0000-000000000001",
    id: "cccccccc-0000-0000-0000-000000000001",
  },
  landing: {
    l1: "aaaaaaaa-0000-0000-0000-000000000001",
    l2: "aaaaaaaa-0000-0000-0000-000000000002",
  },
  lead: {
    notContacted1: "bbbbbbbb-0000-0000-0000-000000000001", // NOT_CONTACTED, pixel-aaa
    notContacted2: "bbbbbbbb-0000-0000-0000-000000000002", // NOT_CONTACTED, pixel-bbb
    contacted1: "bbbbbbbb-0000-0000-0000-000000000003",   // CONTACTED,     pixel-aaa
  },
};

const PIXELS = {
  l1: {
    pixelId: "pixel-aaa-111",
    accessToken: "tok-aaa-secret",
    url: "https://example.com/promo-a",
  },
  l2: {
    pixelId: "pixel-bbb-222",
    accessToken: "tok-bbb-secret",
    url: "https://example.com/promo-b",
  },
};

// ── Backfill SQL (same logic as worker/scripts/backfill-pixel-normalization.ts) ──

async function runBackfillSQL(client: Client): Promise<void> {
  // Step 1: Upsert one MetaPixel per distinct (metaPixelId, metaAccessToken) from Landing.
  //         ON CONFLICT on pixelId ensures idempotency and dedup.
  await client.query(`
    INSERT INTO "MetaPixel" (id, "pixelId", "accessToken", "createdAt", "updatedAt")
    SELECT
      gen_random_uuid()::text,
      "metaPixelId",
      "metaAccessToken",
      NOW(),
      NOW()
    FROM "Landing"
    GROUP BY "metaPixelId", "metaAccessToken"
    ON CONFLICT ("pixelId") DO NOTHING
  `);

  // Step 2: Set Landing.metaPixelRef → MetaPixel.id (skip rows already set).
  await client.query(`
    UPDATE "Landing" l
    SET "metaPixelRef" = mp.id
    FROM "MetaPixel" mp
    WHERE mp."pixelId" = l."metaPixelId"
      AND l."metaPixelRef" IS NULL
  `);

  // Step 3: Set Lead.metaPixelRef + landingId + eventSourceUrl
  //         from the Landing that owned its old pixel number.
  //         Only updates rows not yet backfilled (idempotent).
  await client.query(`
    UPDATE "Lead" ld
    SET
      "metaPixelRef"   = l."metaPixelRef",
      "landingId"      = l.id,
      "eventSourceUrl" = l.url
    FROM "Landing" l
    WHERE l."metaPixelId" = ld."metaPixelId"
      AND ld."metaPixelRef" IS NULL
  `);
}

// ── Test suite ──────────────────────────────────────────────────────────────

describe(
  "migration: pixel-normalization-rekey expand + backfill",
  { timeout: 180_000 },
  () => {
    let ctx: TestcontainerContext;
    let client: Client;

    before(async () => {
      ctx = await startPostgresContainer();

      // Apply all migrations up to (but NOT including) the new expand one
      await applyMigrations(ctx.databaseUrl, NEW_MIGRATION_DIR);

      client = new Client({ connectionString: ctx.databaseUrl });
      await client.connect();

      // ── Seed a cashier (needed for CONTACTED lead) ──────────────────────
      await client.query(
        `INSERT INTO "User" (id, name, username, password, role, "createdAt", "updatedAt")
         VALUES ($1, 'Test Cashier', 'cashier_pn', 'hashed', 'CASHIER', now(), now())`,
        [SEED.cashier.userId]
      );
      await client.query(
        `INSERT INTO "Cashier" (id, "userId", status, "createdAt", "updatedAt")
         VALUES ($1, $2, 'ACTIVE', now(), now())`,
        [SEED.cashier.id, SEED.cashier.userId]
      );

      // ── Seed 2 landings with DISTINCT pixels ───────────────────────────
      await client.query(
        `INSERT INTO "Landing" (id, url, "metaPixelId", "metaAccessToken", status, "createdAt", "updatedAt")
         VALUES
           ($1, $2, $3, $4, 'ACTIVE', now(), now()),
           ($5, $6, $7, $8, 'ACTIVE', now(), now())`,
        [
          SEED.landing.l1, PIXELS.l1.url, PIXELS.l1.pixelId, PIXELS.l1.accessToken,
          SEED.landing.l2, PIXELS.l2.url, PIXELS.l2.pixelId, PIXELS.l2.accessToken,
        ]
      );

      // ── Seed 3 leads in OLD schema (no metaPixelRef/landingId/eventSourceUrl yet) ──
      await client.query(
        `INSERT INTO "Lead" (id, code, fbc, fbp, "metaPixelId", status, "userAgent", "createdAt", "updateAt")
         VALUES
           ($1, 'PN-NC-001', 'fbc-nc1', 'fbp-nc1', $2, 'NOT_CONTACTED', 'UA/1.0', now(), now()),
           ($3, 'PN-NC-002', 'fbc-nc2', 'fbp-nc2', $4, 'NOT_CONTACTED', 'UA/1.0', now(), now()),
           ($5, 'PN-CO-001', 'fbc-co1', 'fbp-co1', $6, 'CONTACTED',     'UA/1.0', now(), now())`,
        [
          SEED.lead.notContacted1, PIXELS.l1.pixelId,
          SEED.lead.notContacted2, PIXELS.l2.pixelId,
          SEED.lead.contacted1, PIXELS.l1.pixelId,
        ]
      );
      // Set cashierId on the contacted lead
      await client.query(
        `UPDATE "Lead" SET "cashierId" = $1, "contactedAt" = now(), phone = '+5491100000001'
         WHERE id = $2`,
        [SEED.cashier.id, SEED.lead.contacted1]
      );

      // ── Apply the new expand migration ──────────────────────────────────
      await applySingleMigration(ctx.databaseUrl, NEW_MIGRATION_DIR);

      // ── Run the backfill ────────────────────────────────────────────────
      await runBackfillSQL(client);
    });

    after(async () => {
      await client.end();
      await ctx.stop();
    });

    // ── (a) Schema: MetaPixel table ──────────────────────────────────────

    it("(a) MetaPixel table exists", async () => {
      const res = await client.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'MetaPixel'`
      );
      assert.equal(res.rowCount, 1, "MetaPixel table must exist");
    });

    it("(a) MetaPixel has id, pixelId, accessToken, label, createdAt, updatedAt columns", async () => {
      const res = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'MetaPixel'
         ORDER BY column_name`
      );
      const cols = res.rows.map((r: { column_name: string }) => r.column_name);
      for (const col of ["id", "pixelId", "accessToken", "label", "createdAt", "updatedAt"]) {
        assert.ok(cols.includes(col), `MetaPixel must have column: ${col}`);
      }
    });

    it("(a) MetaPixel.pixelId has a unique index", async () => {
      const res = await client.query(
        `SELECT indexname FROM pg_indexes
         WHERE tablename = 'MetaPixel' AND indexname = 'MetaPixel_pixelId_key'`
      );
      assert.ok(
        (res.rowCount ?? 0) > 0,
        "MetaPixel_pixelId_key unique index must exist"
      );
    });

    it("(a) Landing has metaPixelRef column (nullable TEXT)", async () => {
      const res = await client.query(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_name = 'Landing' AND column_name = 'metaPixelRef'`
      );
      assert.equal(res.rowCount, 1, "Landing.metaPixelRef column must exist");
      assert.equal(res.rows[0].data_type, "text");
      assert.equal(res.rows[0].is_nullable, "YES");
    });

    it("(a) Landing has whatsappMessages column (TEXT[] NOT NULL, default empty)", async () => {
      const res = await client.query(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_name = 'Landing' AND column_name = 'whatsappMessages'`
      );
      assert.equal(res.rowCount, 1, "Landing.whatsappMessages column must exist");
      assert.equal(res.rows[0].data_type, "ARRAY");
      assert.equal(res.rows[0].is_nullable, "NO");
    });

    it("(a) Lead has metaPixelRef column (nullable TEXT)", async () => {
      const res = await client.query(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_name = 'Lead' AND column_name = 'metaPixelRef'`
      );
      assert.equal(res.rowCount, 1, "Lead.metaPixelRef column must exist");
      assert.equal(res.rows[0].data_type, "text");
      assert.equal(res.rows[0].is_nullable, "YES");
    });

    it("(a) Lead has eventSourceUrl column (nullable TEXT)", async () => {
      const res = await client.query(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_name = 'Lead' AND column_name = 'eventSourceUrl'`
      );
      assert.equal(res.rowCount, 1, "Lead.eventSourceUrl column must exist");
      assert.equal(res.rows[0].data_type, "text");
      assert.equal(res.rows[0].is_nullable, "YES");
    });

    it("(a) Lead has landingId column (nullable TEXT)", async () => {
      const res = await client.query(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_name = 'Lead' AND column_name = 'landingId'`
      );
      assert.equal(res.rowCount, 1, "Lead.landingId column must exist");
      assert.equal(res.rows[0].data_type, "text");
      assert.equal(res.rows[0].is_nullable, "YES");
    });

    // ── (b) MetaPixel deduplication ──────────────────────────────────────

    it("(b) backfill creates exactly 2 MetaPixel rows (one per distinct (pixelId,accessToken))", async () => {
      const res = await client.query(
        `SELECT count(*)::int AS cnt FROM "MetaPixel"`
      );
      assert.equal(res.rows[0].cnt, 2, "Should have exactly 2 MetaPixel rows");
    });

    it("(b) MetaPixel row for pixel-aaa exists with correct pixelId", async () => {
      const res = await client.query(
        `SELECT "pixelId" FROM "MetaPixel" WHERE "pixelId" = $1`,
        [PIXELS.l1.pixelId]
      );
      assert.equal(res.rowCount, 1, "MetaPixel for pixel-aaa must exist");
      assert.equal(res.rows[0].pixelId, PIXELS.l1.pixelId);
    });

    it("(b) MetaPixel row for pixel-bbb exists with correct pixelId", async () => {
      const res = await client.query(
        `SELECT "pixelId" FROM "MetaPixel" WHERE "pixelId" = $1`,
        [PIXELS.l2.pixelId]
      );
      assert.equal(res.rowCount, 1, "MetaPixel for pixel-bbb must exist");
      assert.equal(res.rows[0].pixelId, PIXELS.l2.pixelId);
    });

    // ── (c) Landing.metaPixelRef populated ───────────────────────────────

    it("(c) Landing L1.metaPixelRef points to the MetaPixel row for pixel-aaa", async () => {
      const res = await client.query(
        `SELECT l."metaPixelRef", mp."pixelId"
         FROM "Landing" l
         JOIN "MetaPixel" mp ON mp.id = l."metaPixelRef"
         WHERE l.id = $1`,
        [SEED.landing.l1]
      );
      assert.equal(res.rowCount, 1, "L1 must have a non-null metaPixelRef");
      assert.equal(res.rows[0].pixelId, PIXELS.l1.pixelId);
    });

    it("(c) Landing L2.metaPixelRef points to the MetaPixel row for pixel-bbb", async () => {
      const res = await client.query(
        `SELECT l."metaPixelRef", mp."pixelId"
         FROM "Landing" l
         JOIN "MetaPixel" mp ON mp.id = l."metaPixelRef"
         WHERE l.id = $1`,
        [SEED.landing.l2]
      );
      assert.equal(res.rowCount, 1, "L2 must have a non-null metaPixelRef");
      assert.equal(res.rows[0].pixelId, PIXELS.l2.pixelId);
    });

    it("(c) all landings have metaPixelRef set (no NULL remaining)", async () => {
      const res = await client.query(
        `SELECT count(*)::int AS cnt FROM "Landing" WHERE "metaPixelRef" IS NULL`
      );
      assert.equal(res.rows[0].cnt, 0, "No landing should have metaPixelRef NULL after backfill");
    });

    // ── (d) Lead backfill — all statuses including NOT_CONTACTED ─────────

    it("(d) NOT_CONTACTED lead-nc1 has metaPixelRef pointing to pixel-aaa", async () => {
      const res = await client.query(
        `SELECT ld."metaPixelRef", mp."pixelId"
         FROM "Lead" ld
         JOIN "MetaPixel" mp ON mp.id = ld."metaPixelRef"
         WHERE ld.id = $1`,
        [SEED.lead.notContacted1]
      );
      assert.equal(res.rowCount, 1, "lead-nc1 must have metaPixelRef set");
      assert.equal(res.rows[0].pixelId, PIXELS.l1.pixelId);
    });

    it("(d) NOT_CONTACTED lead-nc1 has landingId = L1.id", async () => {
      const res = await client.query(
        `SELECT "landingId" FROM "Lead" WHERE id = $1`,
        [SEED.lead.notContacted1]
      );
      assert.equal(res.rowCount, 1);
      assert.equal(res.rows[0].landingId, SEED.landing.l1);
    });

    it("(d) NOT_CONTACTED lead-nc1 has eventSourceUrl = L1.url", async () => {
      const res = await client.query(
        `SELECT "eventSourceUrl" FROM "Lead" WHERE id = $1`,
        [SEED.lead.notContacted1]
      );
      assert.equal(res.rowCount, 1);
      assert.equal(res.rows[0].eventSourceUrl, PIXELS.l1.url);
    });

    it("(d) NOT_CONTACTED lead-nc2 has metaPixelRef pointing to pixel-bbb", async () => {
      const res = await client.query(
        `SELECT ld."metaPixelRef", mp."pixelId"
         FROM "Lead" ld
         JOIN "MetaPixel" mp ON mp.id = ld."metaPixelRef"
         WHERE ld.id = $1`,
        [SEED.lead.notContacted2]
      );
      assert.equal(res.rowCount, 1, "lead-nc2 must have metaPixelRef set");
      assert.equal(res.rows[0].pixelId, PIXELS.l2.pixelId);
    });

    it("(d) NOT_CONTACTED lead-nc2 has landingId = L2.id and eventSourceUrl = L2.url", async () => {
      const res = await client.query(
        `SELECT "landingId", "eventSourceUrl" FROM "Lead" WHERE id = $1`,
        [SEED.lead.notContacted2]
      );
      assert.equal(res.rowCount, 1);
      assert.equal(res.rows[0].landingId, SEED.landing.l2);
      assert.equal(res.rows[0].eventSourceUrl, PIXELS.l2.url);
    });

    it("(d) CONTACTED lead-co1 has metaPixelRef pointing to pixel-aaa", async () => {
      const res = await client.query(
        `SELECT ld."metaPixelRef", mp."pixelId"
         FROM "Lead" ld
         JOIN "MetaPixel" mp ON mp.id = ld."metaPixelRef"
         WHERE ld.id = $1`,
        [SEED.lead.contacted1]
      );
      assert.equal(res.rowCount, 1, "lead-co1 must have metaPixelRef set");
      assert.equal(res.rows[0].pixelId, PIXELS.l1.pixelId);
    });

    it("(d) CONTACTED lead-co1 has landingId = L1.id and eventSourceUrl = L1.url", async () => {
      const res = await client.query(
        `SELECT "landingId", "eventSourceUrl" FROM "Lead" WHERE id = $1`,
        [SEED.lead.contacted1]
      );
      assert.equal(res.rowCount, 1);
      assert.equal(res.rows[0].landingId, SEED.landing.l1);
      assert.equal(res.rows[0].eventSourceUrl, PIXELS.l1.url);
    });

    it("(d) all leads have metaPixelRef set (no NULL remaining)", async () => {
      const res = await client.query(
        `SELECT count(*)::int AS cnt FROM "Lead" WHERE "metaPixelRef" IS NULL`
      );
      assert.equal(res.rows[0].cnt, 0, "No lead should have metaPixelRef NULL after backfill");
    });

    it("(d) all leads have landingId set (no NULL remaining)", async () => {
      const res = await client.query(
        `SELECT count(*)::int AS cnt FROM "Lead" WHERE "landingId" IS NULL`
      );
      assert.equal(res.rows[0].cnt, 0, "No lead should have landingId NULL after backfill");
    });

    it("(d) all leads have eventSourceUrl set (no NULL remaining)", async () => {
      const res = await client.query(
        `SELECT count(*)::int AS cnt FROM "Lead" WHERE "eventSourceUrl" IS NULL`
      );
      assert.equal(res.rows[0].cnt, 0, "No lead should have eventSourceUrl NULL after backfill");
    });

    // ── (e) Idempotency: running backfill again leaves values unchanged ───

    it("(e) re-running backfill does not create extra MetaPixel rows", async () => {
      // Run backfill a second time
      await runBackfillSQL(client);

      const res = await client.query(
        `SELECT count(*)::int AS cnt FROM "MetaPixel"`
      );
      assert.equal(
        res.rows[0].cnt,
        2,
        "Second backfill run must not create extra MetaPixel rows"
      );
    });

    it("(e) re-running backfill leaves Landing.metaPixelRef values unchanged", async () => {
      // Capture current values
      const before = await client.query(
        `SELECT id, "metaPixelRef" FROM "Landing" ORDER BY id`
      );

      await runBackfillSQL(client);

      const after = await client.query(
        `SELECT id, "metaPixelRef" FROM "Landing" ORDER BY id`
      );

      assert.deepEqual(before.rows, after.rows, "metaPixelRef values must be unchanged after idempotent run");
    });

    it("(e) re-running backfill leaves Lead.metaPixelRef + landingId + eventSourceUrl unchanged", async () => {
      const before = await client.query(
        `SELECT id, "metaPixelRef", "landingId", "eventSourceUrl" FROM "Lead" ORDER BY id`
      );

      await runBackfillSQL(client);

      const after = await client.query(
        `SELECT id, "metaPixelRef", "landingId", "eventSourceUrl" FROM "Lead" ORDER BY id`
      );

      assert.deepEqual(before.rows, after.rows, "Lead backfill values must be unchanged after idempotent run");
    });

    // ── Migration tracking ────────────────────────────────────────────────

    it("expand migration is recorded in _prisma_migrations", async () => {
      const res = await client.query(
        `SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = $1`,
        [NEW_MIGRATION_DIR]
      );
      assert.ok(
        (res.rowCount ?? 0) > 0,
        "Expand migration must be recorded in _prisma_migrations"
      );
    });
  }
);

// ── Contract phase suite ──────────────────────────────────────────────────────

const CONTRACT_MIGRATION_DIR = "20260630120001_pixel_normalization_contract";

describe(
  "migration: pixel-normalization-rekey contract (Phase 5)",
  { timeout: 240_000 },
  () => {
    let ctx: TestcontainerContext;
    let client: Client;

    before(async () => {
      ctx = await startPostgresContainer();

      // Apply all migrations up to (but NOT including) the expand one
      await applyMigrations(ctx.databaseUrl, NEW_MIGRATION_DIR);

      client = new Client({ connectionString: ctx.databaseUrl });
      await client.connect();

      // ── Seed a cashier ─────────────────────────────────────────────────────
      await client.query(
        `INSERT INTO "User" (id, name, username, password, role, "createdAt", "updatedAt")
         VALUES ($1, 'Contract Cashier', 'cashier_ct', 'hashed', 'CASHIER', now(), now())`,
        [SEED.cashier.userId]
      );
      await client.query(
        `INSERT INTO "Cashier" (id, "userId", status, "createdAt", "updatedAt")
         VALUES ($1, $2, 'ACTIVE', now(), now())`,
        [SEED.cashier.id, SEED.cashier.userId]
      );

      // ── Seed 2 landings in OLD schema ──────────────────────────────────────
      await client.query(
        `INSERT INTO "Landing" (id, url, "metaPixelId", "metaAccessToken", status, "createdAt", "updatedAt")
         VALUES
           ($1, $2, $3, $4, 'ACTIVE', now(), now()),
           ($5, $6, $7, $8, 'ACTIVE', now(), now())`,
        [
          SEED.landing.l1, PIXELS.l1.url, PIXELS.l1.pixelId, PIXELS.l1.accessToken,
          SEED.landing.l2, PIXELS.l2.url, PIXELS.l2.pixelId, PIXELS.l2.accessToken,
        ]
      );

      // ── Seed 3 leads in OLD schema ─────────────────────────────────────────
      await client.query(
        `INSERT INTO "Lead" (id, code, fbc, fbp, "metaPixelId", status, "userAgent", "createdAt", "updateAt")
         VALUES
           ($1, 'CT-NC-001', 'fbc-ct1', 'fbp-ct1', $2, 'NOT_CONTACTED', 'UA/1.0', now(), now()),
           ($3, 'CT-NC-002', 'fbc-ct2', 'fbp-ct2', $4, 'NOT_CONTACTED', 'UA/1.0', now(), now()),
           ($5, 'CT-CO-001', 'fbc-ct3', 'fbp-ct3', $6, 'CONTACTED',     'UA/1.0', now(), now())`,
        [
          SEED.lead.notContacted1, PIXELS.l1.pixelId,
          SEED.lead.notContacted2, PIXELS.l2.pixelId,
          SEED.lead.contacted1, PIXELS.l1.pixelId,
        ]
      );
      await client.query(
        `UPDATE "Lead" SET "cashierId" = $1, "contactedAt" = now(), phone = '+5491100000001'
         WHERE id = $2`,
        [SEED.cashier.id, SEED.lead.contacted1]
      );

      // ── Apply expand migration ──────────────────────────────────────────────
      await applySingleMigration(ctx.databaseUrl, NEW_MIGRATION_DIR);

      // ── Run backfill ────────────────────────────────────────────────────────
      await runBackfillSQL(client);

      // ── Apply contract migration ────────────────────────────────────────────
      await applySingleMigration(ctx.databaseUrl, CONTRACT_MIGRATION_DIR);
    });

    after(async () => {
      await client.end();
      await ctx.stop();
    });

    // ── (a) Old scalar columns no longer exist ────────────────────────────────

    it("(a) Landing.metaAccessToken column does not exist after contract", async () => {
      const res = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'Landing' AND column_name = 'metaAccessToken'`
      );
      assert.equal(res.rowCount, 0, "Landing.metaAccessToken must be dropped by Contract");
    });

    it("(a) Lead no longer has a nullable old scalar metaPixelId — column is NOT NULL FK after rename", async () => {
      // After contract: Lead.metaPixelId exists and is NOT NULL (it's the renamed FK UUID)
      const res = await client.query(
        `SELECT column_name, is_nullable
         FROM information_schema.columns
         WHERE table_name = 'Lead' AND column_name = 'metaPixelId'`
      );
      assert.equal(res.rowCount, 1, "Lead.metaPixelId must exist (renamed FK)");
      assert.equal(res.rows[0].is_nullable, "NO", "Lead.metaPixelId must be NOT NULL after Contract");
    });

    it("(a) Landing.metaPixelId is NOT NULL after contract (renamed from metaPixelRef)", async () => {
      const res = await client.query(
        `SELECT column_name, is_nullable
         FROM information_schema.columns
         WHERE table_name = 'Landing' AND column_name = 'metaPixelId'`
      );
      assert.equal(res.rowCount, 1, "Landing.metaPixelId must exist");
      assert.equal(res.rows[0].is_nullable, "NO", "Landing.metaPixelId must be NOT NULL after Contract");
    });

    it("(a) Lead.landingId is NOT NULL after contract", async () => {
      const res = await client.query(
        `SELECT column_name, is_nullable
         FROM information_schema.columns
         WHERE table_name = 'Lead' AND column_name = 'landingId'`
      );
      assert.equal(res.rowCount, 1, "Lead.landingId must exist");
      assert.equal(res.rows[0].is_nullable, "NO", "Lead.landingId must be NOT NULL after Contract");
    });

    it("(a) Lead.eventSourceUrl is NOT NULL after contract", async () => {
      const res = await client.query(
        `SELECT column_name, is_nullable
         FROM information_schema.columns
         WHERE table_name = 'Lead' AND column_name = 'eventSourceUrl'`
      );
      assert.equal(res.rowCount, 1, "Lead.eventSourceUrl must exist");
      assert.equal(res.rows[0].is_nullable, "NO", "Lead.eventSourceUrl must be NOT NULL after Contract");
    });

    // ── (b) Backfill data intact after contract ───────────────────────────────

    it("(b) MetaPixel rows still correct after contract (2 rows)", async () => {
      const res = await client.query(
        `SELECT count(*)::int AS cnt FROM "MetaPixel"`
      );
      assert.equal(res.rows[0].cnt, 2, "MetaPixel count must remain 2 after Contract");
    });

    it("(b) Landing L1 metaPixelId (FK) points to correct MetaPixel (pixel-aaa)", async () => {
      const res = await client.query(
        `SELECT l."metaPixelId", mp."pixelId"
         FROM "Landing" l
         JOIN "MetaPixel" mp ON mp.id = l."metaPixelId"
         WHERE l.id = $1`,
        [SEED.landing.l1]
      );
      assert.equal(res.rowCount, 1, "L1 must have a valid metaPixelId FK");
      assert.equal(res.rows[0].pixelId, PIXELS.l1.pixelId, "L1 FK must resolve to pixel-aaa");
    });

    it("(b) Landing L2 metaPixelId (FK) points to correct MetaPixel (pixel-bbb)", async () => {
      const res = await client.query(
        `SELECT l."metaPixelId", mp."pixelId"
         FROM "Landing" l
         JOIN "MetaPixel" mp ON mp.id = l."metaPixelId"
         WHERE l.id = $1`,
        [SEED.landing.l2]
      );
      assert.equal(res.rowCount, 1, "L2 must have a valid metaPixelId FK");
      assert.equal(res.rows[0].pixelId, PIXELS.l2.pixelId, "L2 FK must resolve to pixel-bbb");
    });

    it("(b) All leads have metaPixelId NOT NULL and pointing to MetaPixel", async () => {
      const res = await client.query(
        `SELECT count(*)::int AS cnt
         FROM "Lead" ld
         JOIN "MetaPixel" mp ON mp.id = ld."metaPixelId"`
      );
      assert.equal(res.rows[0].cnt, 3, "All 3 leads must have valid metaPixelId FK");
    });

    it("(b) All leads have landingId and eventSourceUrl NOT NULL with correct values", async () => {
      const nullRes = await client.query(
        `SELECT count(*)::int AS cnt FROM "Lead" WHERE "landingId" IS NULL OR "eventSourceUrl" IS NULL`
      );
      assert.equal(nullRes.rows[0].cnt, 0, "No lead should have NULL landingId or eventSourceUrl");

      const lead1 = await client.query(
        `SELECT "landingId", "eventSourceUrl" FROM "Lead" WHERE id = $1`,
        [SEED.lead.notContacted1]
      );
      assert.equal(lead1.rows[0].landingId, SEED.landing.l1);
      assert.equal(lead1.rows[0].eventSourceUrl, PIXELS.l1.url);
    });

    // ── (c) FK RESTRICT: cannot delete a MetaPixel that has references ────────

    it("(c) deleting a MetaPixel with referenced Landing → FK violation (RESTRICT)", async () => {
      // Get the MetaPixel id for pixel-aaa
      const mpRes = await client.query(
        `SELECT id FROM "MetaPixel" WHERE "pixelId" = $1`,
        [PIXELS.l1.pixelId]
      );
      const mpId = mpRes.rows[0].id;

      // Attempt to delete the MetaPixel — should fail due to RESTRICT on Landing.metaPixelId
      await assert.rejects(
        async () => {
          await client.query(`DELETE FROM "MetaPixel" WHERE id = $1`, [mpId]);
        },
        (err: unknown) => {
          const pgErr = err as { code?: string };
          assert.equal(pgErr.code, '23503', "Expected FK violation code 23503 (RESTRICT)");
          return true;
        },
        "DELETE of referenced MetaPixel must throw FK violation"
      );
    });

    // ── (d) Contract migration is recorded in _prisma_migrations ─────────────

    it("(d) contract migration is recorded in _prisma_migrations", async () => {
      const res = await client.query(
        `SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = $1`,
        [CONTRACT_MIGRATION_DIR]
      );
      assert.ok(
        (res.rowCount ?? 0) > 0,
        "Contract migration must be recorded in _prisma_migrations"
      );
    });
  }
);
