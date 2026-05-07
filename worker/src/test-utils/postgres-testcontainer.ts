import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { Client } from "pg";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Absolute path to the migrations directory
const MIGRATIONS_DIR = path.resolve(
  __dirname,
  "../../prisma/migrations"
);

export interface TestcontainerContext {
  databaseUrl: string;
  container: StartedPostgreSqlContainer;
  stop: () => Promise<void>;
}

/**
 * Start a fresh Postgres 16 container.
 * Returns { databaseUrl, container, stop }.
 */
export async function startPostgresContainer(): Promise<TestcontainerContext> {
  const container = await new PostgreSqlContainer("postgres:16-alpine").start();

  const databaseUrl = container.getConnectionUri();

  return {
    databaseUrl,
    container,
    stop: async () => { await container.stop(); },
  };
}

/**
 * Get all migration directory names in sorted (chronological) order.
 */
async function getSortedMigrationDirs(): Promise<string[]> {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/**
 * Apply all migrations up to (but NOT including) the migration directory
 * whose name starts with `excludeFromDir`.
 *
 * If `excludeFromDir` is undefined, apply ALL migrations.
 *
 * Uses the _prisma_migrations table tracking convention so that
 * prisma migrate deploy can later detect which migrations are already applied.
 */
export async function applyMigrations(
  databaseUrl: string,
  excludeFromDir?: string
): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    // Ensure the tracking table exists (matches Prisma's schema exactly)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id"                    VARCHAR(36)  NOT NULL PRIMARY KEY,
        "checksum"              VARCHAR(64)  NOT NULL,
        "finished_at"           TIMESTAMPTZ,
        "migration_name"        VARCHAR(255) NOT NULL,
        "logs"                  TEXT,
        "rolled_back_at"        TIMESTAMPTZ,
        "started_at"            TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "applied_steps_count"   INTEGER      NOT NULL DEFAULT 0
      );
    `);

    const dirs = await getSortedMigrationDirs();

    for (const dir of dirs) {
      // Stop before the excluded migration
      if (excludeFromDir !== undefined && dir >= excludeFromDir) {
        break;
      }

      const sqlPath = path.join(MIGRATIONS_DIR, dir, "migration.sql");
      let sql: string;
      try {
        sql = await fs.readFile(sqlPath, "utf8");
      } catch {
        // No migration.sql in this dir (shouldn't happen, but be safe)
        continue;
      }

      await client.query(sql);

      // Record the migration as applied
      await client.query(
        `INSERT INTO "_prisma_migrations"
           (id, checksum, finished_at, migration_name, applied_steps_count)
         VALUES ($1, $2, now(), $3, 1)
         ON CONFLICT (id) DO NOTHING`,
        [
          crypto.randomUUID(),
          "test-checksum", // not validated in test context
          dir,
        ]
      );
    }
  } finally {
    await client.end();
  }
}

/**
 * Apply a single migration by its directory name.
 * Call this after applyMigrations(..., excludeFromDir) to apply the new migration.
 */
export async function applySingleMigration(
  databaseUrl: string,
  migrationDir: string
): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const sqlPath = path.join(MIGRATIONS_DIR, migrationDir, "migration.sql");
    const sql = await fs.readFile(sqlPath, "utf8");

    await client.query(sql);

    await client.query(
      `INSERT INTO "_prisma_migrations"
         (id, checksum, finished_at, migration_name, applied_steps_count)
       VALUES ($1, $2, now(), $3, 1)
       ON CONFLICT (id) DO NOTHING`,
      [
        crypto.randomUUID(),
        "test-checksum",
        migrationDir,
      ]
    );
  } finally {
    await client.end();
  }
}
