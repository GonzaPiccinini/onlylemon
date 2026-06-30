/**
 * Migration + backfill integration test for pixel-normalization-rekey (Change A, Phase 1 — Expand).
 *
 * TDD phase: RED first (migration file absent → applySingleMigration throws),
 * GREEN after tasks 1.2 (migration SQL) + 1.3 (backfill script) are implemented.
 *
 * Test plan:
 * 1. Spin up a Postgres 16 testcontainer.
 * 2. Apply all existing migrations EXCEPT the new expand one.
 * 3. Seed landings and leads in the OLD schema (before new columns exist).
 * 4. Apply the new expand migration (additive: MetaPixel table + nullable FK columns).
 * 5. Run the backfill (runBackfillSQL helper — same SQL as the production script).
 * 6. Assert:
 *    a. Schema: MetaPixel table exists with expected columns; Landing/Lead have new nullable cols.
 *    b. MetaPixel rows deduplicated: 1 row per distinct (pixelId, accessToken) pair.
 *    c. Landing.metaPixelRef populated for all landings.
 *    d. Lead.metaPixelRef + landingId + eventSourceUrl populated for ALL leads
 *       including in-flight NOT_CONTACTED.
 *    e. Idempotent re-run: MetaPixel count unchanged, FK values unchanged.
 * 7. Run backfill a second time to verify idempotency.
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
