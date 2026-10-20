#!/usr/bin/env node

import {
  resolveDatabaseUrl,
  resolveMigrationDatabaseUrl,
  listDbRelatedEnvKeys,
} from "./resolve-database-url.mjs";

// npm builds generate fallback images explicitly before invoking this validator.
// When Liara invokes the validator directly, generate them here because npm's
// lifecycle hooks are not involved.
if (process.env.npm_lifecycle_event !== "build") {
  await import("./generate-fallback-assets.mjs");
} else {
  console.log("[deploy] fallback images already processed by the npm build command.");
}

const isProduction = process.env.NODE_ENV === "production";
const hasConfiguredFfmpeg = Boolean(process.env.FFMPEG_BIN?.trim());
const shouldProvisionWatermarkRuntime =
  isProduction || process.platform === "linux" || hasConfiguredFfmpeg;

// Liara's direct build command executes this validator outside npm's lifecycle.
// NODE_ENV may therefore be unset even though the app is being deployed. Linux
// builds and explicit production builds must provision FFmpeg + the Persian TTF;
// local Windows/macOS development builds can continue without downloading a
// Linux-only binary.
if (shouldProvisionWatermarkRuntime) {
  const { ensureFfmpegBinary } = await import("./ensure-ffmpeg.mjs");
  const ffmpegPath = await ensureFfmpegBinary();
  if (!ffmpegPath) {
    throw new Error(
      "[deploy] Permanent media watermarking requires a compatible FFmpeg runtime. " +
        "Set FFMPEG_BIN to a compatible binary for this platform.",
    );
  }
  console.log("[deploy] Permanent media watermark runtime is ready.");
} else {
  console.log("[deploy] Skipping Linux FFmpeg provisioning on this local development platform.");
}
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
