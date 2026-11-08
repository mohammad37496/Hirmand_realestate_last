import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import {
  assertRequiredMigrationFiles,
  assertRequiredMigrationLedger,
  CUSTOMER_AUTH_MIGRATIONS,
  pendingMigrations,
} from "../scripts/migration-plan.mjs";
import { resolveMigrationDatabaseUrl, sanitizePostgresConnectionString } from "./resolve-database-url.mjs";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const DEPLOYMENT_INFO_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "deployment.json");

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

export async function runMigrations({ connectionString }) {
  const entries = await readdir(MIGRATIONS_DIR);
  const verifyCustomerAuth = process.env.VITE_AUTH_ENABLED !== "false";
  if (verifyCustomerAuth) assertRequiredMigrationFiles(entries);
  const appliedRows = await (async () => {
    const pool = new pg.Pool({
      connectionString,
      max: 1,
      connectionTimeoutMillis: Number(process.env.DB_MIGRATION_CONNECT_TIMEOUT_MS ?? 5000),
    });
    const client = await pool.connect();
    try {
      await client.query(
        "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
      );
      const { rows } = await client.query("SELECT name FROM _migrations");
      return rows.map((row) => String(row.name));
    } finally {
      client.release();
      await pool.end();
    }
  })();

  const pending = pendingMigrations(entries, appliedRows);
  const pool = new pg.Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: Number(process.env.DB_MIGRATION_CONNECT_TIMEOUT_MS ?? 5000),
  });
  const client = await pool.connect();

  try {
    for (const { name } of pending) {
      const source = await readFile(join(MIGRATIONS_DIR, name), "utf8");

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
    if (verifyCustomerAuth) {
      const { rows } = await client.query("SELECT name FROM _migrations");
      assertRequiredMigrationLedger(rows.map((row) => String(row.name)));
      const deploymentCommit = await readDeploymentCommit();
      const deploymentLabel = deploymentCommit ? ` for deployment ${deploymentCommit}` : "";
      console.log(`[migrate] customer-auth migrations verified${deploymentLabel}: ${CUSTOMER_AUTH_MIGRATIONS.join(", ")}`);
    } else {
      console.log("[migrate] database is up to date.");
    }
  } finally {
    client.release();
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
