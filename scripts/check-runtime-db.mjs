#!/usr/bin/env node
/**
 * Runtime-only PostgreSQL diagnostic.
 * Never prints or exposes connection-string values.
 */
import pg from "pg";
import {
  resolveDatabaseUrl,
  resolveMigrationDatabaseUrl,
  sanitizePostgresConnectionString,
  listDbRelatedEnvKeys,
} from "./resolve-database-url.mjs";

const runtime = resolveDatabaseUrl();
const migration = resolveMigrationDatabaseUrl();

console.log(
  "[runtime-db] NODE_ENV=" + (process.env.NODE_ENV || "(unset)") + ".",
);

if (!runtime.url) {
  const related = listDbRelatedEnvKeys();
  console.warn("[runtime-db] DATABASE URL is NOT available at runtime.");
  console.warn(
    related.length
      ? "[runtime-db] Related env keys: " + related.join(", ")
      : "[runtime-db] No DATABASE/POSTGRES/NEON env keys are present.",
  );
  process.exit(0);
}

console.log(
  "[runtime-db] Runtime PostgreSQL URL is available via " + runtime.key + ".",
);
if (migration.url && migration.key !== runtime.key) {
  console.log(
    "[runtime-db] Migration PostgreSQL URL is available via " +
      migration.key +
      " (direct/unpooled).",
  );
}

const databaseUrl = sanitizePostgresConnectionString(runtime.url);
const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 1,
  connectionTimeoutMillis: Number(process.env.DB_POOL_CONNECT_MS ?? 8_000),
});

try {
  await pool.query("select 1");
  console.log("[runtime-db] PostgreSQL connectivity: OK.");
} catch (error) {
  console.error("[runtime-db] PostgreSQL connectivity: FAILED.");
  if (error && typeof error === "object") {
    for (const key of ["code", "severity", "message", "detail", "hint"]) {
      const value = error[key];
      if (value != null && key !== "message") {
        console.error("[runtime-db]   " + key + ": " + value);
      }
    }
  }
} finally {
  await pool.end().catch(() => undefined);
}
