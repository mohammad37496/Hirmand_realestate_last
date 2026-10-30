#!/usr/bin/env node
/**
 * Production prestart hook for Hirmand Real Estate.
 *
 * Runs before `node .output/server/index.mjs` and:
 *   - normalizes the platform-injected port into NITRO_PORT
 *   - ensures NODE_ENV is set
 *   - runs pending migrations (idempotent, transactional per file)
 *   - warns (non-fatal) when required production env vars are missing
 *
 * It is intentionally NOT a replacement for the Nitro `node-server` runtime:
 * Nitro owns HTTP binding, request handling, and shutdown. We just make sure it
 * sees the right port, a migrated database, and the right environment.
 */
import { resolveDatabaseUrl, sanitizePostgresConnectionString } from "./resolve-database-url.mjs";
import { runMigrations } from "./prestart-migrate.mjs";

const PORT = Number(process.env.PORT || process.env.NITRO_PORT || 3000);

if (!Number.isFinite(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`[prestart] Invalid PORT: ${process.env.PORT ?? process.env.NITRO_PORT ?? "unset"}`);
  process.exit(1);
}

process.env.NITRO_PORT = String(PORT);
process.env.NITRO_HOST ??= process.env.HOST ?? "0.0.0.0";
process.env.HOST ??= "0.0.0.0";
process.env.NODE_ENV ??= "production";

console.log(`[prestart] NODE_ENV=${process.env.NODE_ENV}, binding port ${PORT}`);

const resolved = resolveDatabaseUrl();
if (resolved.url) {
  const url = sanitizePostgresConnectionString(resolved.url);
  console.log("[prestart] migrations via " + resolved.key);

  const timeoutMs = Number(process.env.DB_MIGRATION_TIMEOUT_MS ?? 60_000);
  let timeout;
  let migrationError;
  try {
    await Promise.race([
      runMigrations({ connectionString: url }),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("migration timeout after " + timeoutMs + "ms")), timeoutMs);
      }),
    ]);
  } catch (error) {
    migrationError = error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  if (migrationError) {
    console.error("[prestart] ERROR: refusing to start because database migrations did not complete.");
    console.error(
      "[prestart] " + (migrationError instanceof Error ? migrationError.message : "unknown migration error"),
    );
    process.exit(1);
  }
} else if (process.env.NODE_ENV === "production") {
  console.warn("[prestart] WARNING: DATABASE_URL is not set — database-backed API routes will be unavailable.");
}

if (process.env.NODE_ENV === "production") {
  if (!process.env.HIRMAND_ADMIN_KEY?.trim()) {
    console.warn("[prestart] WARNING: HIRMAND_ADMIN_KEY is not set — the admin panel will reject all logins.");
  }
}
