#!/usr/bin/env node

import {
  resolveDatabaseUrl,
  resolveMigrationDatabaseUrl,
  listDbRelatedEnvKeys,
} from "./resolve-database-url.mjs";
import { customerAuthEnvironmentErrors } from "./customer-auth-env.mjs";

const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  const { ensureFfmpegBinary } = await import("./ensure-ffmpeg.mjs");
  await ensureFfmpegBinary();
}
const runtime = resolveDatabaseUrl();
const migration = resolveMigrationDatabaseUrl();

const authEnvironmentErrors = customerAuthEnvironmentErrors(process.env, Boolean(runtime.url));
if (authEnvironmentErrors.length) {
  console.error("[deploy] Customer accounts are enabled but production configuration is incomplete:");
  for (const item of authEnvironmentErrors) console.error(`[deploy]   missing or invalid: ${item}`);
  process.exit(1);
}

if (runtime.url) {
  if (!process.env.DATABASE_URL?.trim()) {
    process.env.DATABASE_URL = runtime.url;
  }
  console.log(`[deploy] Runtime DB via ${runtime.key}.`);
  if (migration.key && migration.key !== runtime.key) {
    console.log(`[deploy] Migrations will use ${migration.key} (direct/unpooled).`);
  }
} else if (isProduction) {
  const related = listDbRelatedEnvKeys();
  console.warn("[deploy] WARNING: No database URL found.");
  console.warn(
    related.length
      ? `[deploy] Related env keys: ${related.join(", ")}`
      : "[deploy] No DATABASE/POSTGRES environment keys on this build.",
  );
  console.warn(
    "[deploy] Production database-backed features will not work until DATABASE_URL is configured.",
  );
} else {
  console.log("[deploy] Non-production build: no DATABASE_URL (PGLite fallback OK).");
}

if (isProduction && !process.env.HIRMAND_ADMIN_KEY?.trim()) {
  console.warn(
    "[deploy] WARNING: HIRMAND_ADMIN_KEY not set — /admin will reject keys.",
  );
}

console.log(
  isProduction
    ? "[deploy] Production environment check finished."
    : "[deploy] Non-production environment checks finished.",
);
