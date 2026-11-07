#!/usr/bin/env node
/**
 * Production prestart hook for Hirmand Real Estate.
 *
 * Runs before `node .output/server/index.mjs` and:
 *   - normalizes the platform-injected port into NITRO_PORT
 *   - ensures NODE_ENV is set
 *   - runs pending migrations (idempotent, transactional per file)
 *   - rejects incomplete production customer-auth configuration
 *
 * It is intentionally NOT a replacement for the Nitro `node-server` runtime:
 * Nitro owns HTTP binding, request handling, and shutdown. We just make sure it
 * sees the right port, a migrated database, and the right environment.
 */
import { resolveDatabaseUrl, sanitizePostgresConnectionString } from "./resolve-database-url.mjs";
import {
  customerAuthEnvironmentErrors,
  shouldAbortOnCustomerAuthMigrationError,
} from "./customer-auth-env.mjs";
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
const authEnvironmentErrors = customerAuthEnvironmentErrors(process.env, Boolean(resolved.url));
if (authEnvironmentErrors.length) {
  console.error("[prestart] Customer accounts are enabled but production configuration is incomplete:");
  for (const item of authEnvironmentErrors) console.error(`[prestart]   missing or invalid: ${item}`);
  process.exit(1);
}

if (resolved.url) {
  const url = sanitizePostgresConnectionString(resolved.url);
  console.log(`[prestart] migrations via ${resolved.key}`);
  try {
    await Promise.race([
      runMigrations({ connectionString: url }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("migration timeout")), 15_000)),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : error;
    if (shouldAbortOnCustomerAuthMigrationError(process.env)) {
      console.error("[prestart] Customer accounts are enabled; refusing to start before database migrations complete:", message);
      process.exit(1);
    }
    console.warn("[prestart] WARNING: database migrations were not completed before startup:", message);
  }
} else if (process.env.NODE_ENV === "production") {
  console.warn("[prestart] WARNING: DATABASE_URL is not set — skipping migrations.");
}

if (process.env.NODE_ENV === "production") {
  if (!process.env.HIRMAND_ADMIN_KEY?.trim()) {
    console.warn("[prestart] WARNING: HIRMAND_ADMIN_KEY is not set — the admin panel will reject all logins.");
  }
}
