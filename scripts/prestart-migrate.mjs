import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { pendingMigrations } from "../scripts/migration-plan.mjs";
import { acquireMigrationAdvisoryLock } from "../scripts/migration-lock.mjs";
import { resolveMigrationDatabaseUrl, sanitizePostgresConnectionString } from "./resolve-database-url.mjs";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const MIGRATION_LOCK_KEY = 741206510n;

export async function runMigrations({ connectionString }) {
  const entries = await readdir(MIGRATIONS_DIR);
  const pool = new pg.Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: Number(process.env.DB_MIGRATION_CONNECT_TIMEOUT_MS ?? 5000),
    idleTimeoutMillis: Number(process.env.DB_MIGRATION_IDLE_TIMEOUT_MS ?? 10000),
    application_name: "hirmand-migrations",
  });

  let client;
  let lockAcquired = false;
  try {
    client = await pool.connect();
    // Keep the lock and all migration bookkeeping on one PostgreSQL session.
    // Concurrent deploys/startups must re-read _migrations only after acquiring it.
    await acquireMigrationAdvisoryLock(client, MIGRATION_LOCK_KEY, {
      timeoutMs: Number(process.env.DB_MIGRATION_LOCK_TIMEOUT_MS ?? 30_000),
    });
    lockAcquired = true;

    await client.query(
      "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    const { rows } = await client.query("SELECT name FROM _migrations");
    const applied = rows.map((row) => String(row.name));
    const pending = pendingMigrations(entries, applied);

    if (pending.length === 0) {
      console.log("[migrate] database is up to date.");
      return;
    }

    for (const { name } of pending) {
      // Missing/invalid migration files are a release blocker, not a reason to
      // continue booting with a partially migrated schema.
      const source = await readFile(join(MIGRATIONS_DIR, name), "utf8");
      console.log("[migrate] applying " + name);

      await client.query("BEGIN");
      try {
        await client.query(source);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        console.error("[migrate] failed " + name);
        if (error && typeof error === "object") {
          for (const key of ["code", "severity"]) {
            const value = error[key];
            if (value != null) console.error("[migrate]   " + key + ": " + value);
          }
        }
        throw error;
      }
    }
    console.log("[migrate] database is up to date.");
  } finally {
    if (client) {
      if (lockAcquired) {
        await client
          .query("SELECT pg_advisory_unlock($1::bigint)", [MIGRATION_LOCK_KEY.toString()])
          .catch(() => undefined);
      }
      client.release();
    }
    await pool.end();
  }
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const resolved = resolveMigrationDatabaseUrl();
  if (!resolved.url) {
    console.error("[migrate] DATABASE_URL is not configured.");
    process.exit(1);
  }
  const connectionString = sanitizePostgresConnectionString(resolved.url);
  console.log("[migrate] using " + resolved.key);
  try {
    await runMigrations({ connectionString });
  } catch (error) {
    console.error(
      "[migrate] migration run failed:",
      error instanceof Error ? error.message : "unknown migration error",
    );
    process.exit(1);
  }
}
