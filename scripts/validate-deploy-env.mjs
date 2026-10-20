#!/usr/bin/env node

import {
  resolveDatabaseUrl,
  resolveMigrationDatabaseUrl,
  listDbRelatedEnvKeys,
} from "./resolve-database-url.mjs";

// npm runs the "prebuild" lifecycle before this "build" script. Avoid retrying
// the same remote image downloads a second time when npm orchestrates the build.
// If a platform invokes this validator directly (outside npm run build), keep
// generating the fallbacks here so runtime assets are still prepared.
if (process.env.npm_lifecycle_event !== "build") {
  await import("./generate-fallback-assets.mjs");
} else {
  console.log("[deploy] fallback images already processed by the npm prebuild lifecycle.");
}

const isProduction = process.env.NODE_ENV === "production";

// Liara's configured command may invoke this script directly instead of
// running "npm run build". In that path npm lifecycle hooks are skipped and
// NODE_ENV may be unset, but permanent image/video watermarking still requires
// the checksum-verified FFmpeg binary and the Persian TTF font. Always provision
// them here so a deployment cannot silently start without watermark support.
const { ensureFfmpegBinary } = await import("./ensure-ffmpeg.mjs");
const ffmpegPath = await ensureFfmpegBinary();
if (!ffmpegPath) {
  throw new Error(
    "[deploy] Permanent media watermarking requires a supported FFmpeg runtime. " +
      "Set FFMPEG_BIN to a compatible FFmpeg binary for this platform.",
  );
}
console.log("[deploy] Permanent media watermark runtime is ready.");
const runtime = resolveDatabaseUrl();
const migration = resolveMigrationDatabaseUrl();

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
