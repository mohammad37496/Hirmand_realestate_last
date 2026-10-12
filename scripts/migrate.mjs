/**
 * Deploy-time database migrator.
 * Uses the same basename bookkeeping as the PGLite/dev path, but is plain
 * Node ESM so it can safely run from npm scripts and Vercel build hooks.
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { resolveMigrationDatabaseUrl, sanitizePostgresConnectionString } from "./resolve-database-url.mjs";
import { pendingMigrations } from "./migration-plan.mjs";

const resolved = resolveMigrationDatabaseUrl();
const databaseUrl = resolved.url ? sanitizePostgresConnectionString(resolved.url) : undefined;

if (!databaseUrl) {
  console.log("[migrate] DATABASE_URL not set — skipping (the PGLite fallback migrates itself).");
  process.exit(0);
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

async function readMigrationFiles() {
  const entries = await readdir(migrationsDir);
  const pending = pendingMigrations(entries, []);
  return Promise.all(
    pending.map(async ({ name }) => ({
      name,
      source: await readFile(join(migrationsDir, name), "utf8"),
    })),
  );
}

async function main() {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();

  try {
    await client.query(
      "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );

    const { rows } = await client.query("SELECT name FROM _migrations");
    const applied = rows.map((row) => String(row.name));
    const migrations = await readMigrationFiles();
    const pending = pendingMigrations(migrations.map((item) => item.name), applied);

    const byName = new Map(migrations.map((item) => [item.name, item.source]));

    for (const { name } of pending) {
      const source = byName.get(name);
      if (!source) continue;

      console.log("[migrate] applying " + name);
      try {
        await client.query("BEGIN");
        await client.query(source);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        console.error("[migrate] failed " + name);
        if (error && typeof error === "object") {
          for (const key of ["code", "detail", "hint", "position", "routine", "severity"]) {
            const value = error[key];
            if (value != null) console.error("[migrate]   " + key + ": " + value);
          }
        }
        throw error;
      }
    }

    console.log("[migrate] database is up to date.");
  } finally {
    client.release();
    await pool.end();
  }
}

await main();
