import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import {
  assertRequiredMigrationFiles,
  assertRequiredMigrationLedger,
  CUSTOMER_AUTH_MIGRATIONS,
  PROPERTY_CONSULTANT_RELATION_MIGRATIONS,
  pendingMigrations,
} from "../scripts/migration-plan.mjs";
import { resolveMigrationDatabaseUrl, sanitizePostgresConnectionString } from "./resolve-database-url.mjs";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const DEPLOYMENT_INFO_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "deployment.json");
// Stable two-int advisory key shared by every Liara app instance.
const MIGRATION_LOCK_KEY = [1212760653, 1296643922];

export async function readDeploymentCommit(path = DEPLOYMENT_INFO_FILE) {
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  const deployment = JSON.parse(source);
  if (typeof deployment.commit !== "string" || !deployment.commit.trim()) {
    throw new Error("public/deployment.json must contain a non-empty commit field.");
  }
  return deployment.commit.trim();
}

export async function runMigrations({
  connectionString,
  migrationsDir = MIGRATIONS_DIR,
  poolFactory = (options) => new pg.Pool(options),
  verifyCustomerAuth = process.env.VITE_AUTH_ENABLED !== "false",
  verifyPropertyConsultantMigration = true,
}) {
  const entries = await readdir(migrationsDir);
  if (verifyPropertyConsultantMigration) assertRequiredMigrationFiles(entries, PROPERTY_CONSULTANT_RELATION_MIGRATIONS);
  if (verifyCustomerAuth) assertRequiredMigrationFiles(entries);
  const pool = poolFactory({
    connectionString,
    max: 1,
    connectionTimeoutMillis: Number(process.env.DB_MIGRATION_CONNECT_TIMEOUT_MS ?? 5000),
  });
  let client;
  let lockAcquired = false;
  try {
    client = await pool.connect();
    // Lock before reading the ledger. All migrations are then planned and
    // applied on this same session, so another Liara instance cannot race the
    // same pending migration between the ledger read and its insert.
    await client.query("SELECT pg_advisory_lock($1, $2)", MIGRATION_LOCK_KEY);
    lockAcquired = true;
    await client.query(
      "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    const { rows: appliedRows } = await client.query("SELECT name FROM _migrations");
    const pending = pendingMigrations(entries, appliedRows.map((row) => String(row.name)));

    for (const { name } of pending) {
      const source = await readFile(join(migrationsDir, name), "utf8");

      console.log(`[migrate] applying ${name}`);
      await client.query("BEGIN");
      try {
        await client.query(source);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        console.error(`[migrate] failed ${name}`);
        if (error && typeof error === "object") {
          for (const key of ["code", "detail", "hint", "position", "routine", "severity"]) {
            const value = error[key];
            if (value != null) console.error(`[migrate]   ${key}: ${value}`);
          }
        }
        throw error;
      }
    }
    const { rows } = await client.query("SELECT name FROM _migrations");
    const appliedNames = rows.map((row) => String(row.name));
    const deploymentCommit = await readDeploymentCommit();
    const deploymentLabel = deploymentCommit ? ` for deployment ${deploymentCommit}` : "";
    if (verifyPropertyConsultantMigration) {
      assertRequiredMigrationLedger(appliedNames, PROPERTY_CONSULTANT_RELATION_MIGRATIONS);
      console.log(`[migrate] property consultant migrations verified${deploymentLabel}: ${PROPERTY_CONSULTANT_RELATION_MIGRATIONS.join(", ")}`);
    }
    if (verifyCustomerAuth) {
      assertRequiredMigrationLedger(appliedNames);
      console.log(`[migrate] customer-auth migrations verified${deploymentLabel}: ${CUSTOMER_AUTH_MIGRATIONS.join(", ")}`);
    } else {
      console.log("[migrate] database is up to date.");
    }
  } finally {
    if (client) {
      if (lockAcquired) {
        await client.query("SELECT pg_advisory_unlock($1, $2)", MIGRATION_LOCK_KEY).catch(() => {});
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
  console.log(`[migrate] using ${resolved.key}`);
  try {
    await runMigrations({ connectionString });
  } catch (error) {
    console.error("[migrate] migration run failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
