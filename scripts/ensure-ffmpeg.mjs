#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Pin the complete GPL static build rather than ffmpeg-static's Linux asset:
 // drawtext has been absent from that asset, which breaks Persian text watermarks.
 // SHA-256 values are the digests published by the upstream BtbN release.
const RELEASE_TAG = "autobuild-2026-10-18-13-01";
const TARGET_DIR = join(process.cwd(), ".runtime", "ffmpeg");
const TARGET_PATH = join(TARGET_DIR, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
const FONT_VERSION = "v33.003";
const FONT_DIR = join(process.cwd(), ".runtime", "fonts");
const FONT_PATH = join(FONT_DIR, "Vazirmatn-Regular.ttf");
const FONT_URL = `https://raw.githubusercontent.com/rastikerdar/vazirmatn/${FONT_VERSION}/fonts/ttf/Vazirmatn-Regular.ttf`;
const FONT_GIT_BLOB_SHA1 = "64e4a8189557a17b63fd7a77794207483e592972";

const ASSETS = {
  "linux-x64": {
    name: "ffmpeg-n9.0.2-28-g669f5ab083-linux64-gpl-9.0.tar.xz",
    sha256: "d2cc2d5446f14ff32b411e4fee488005b472023fb6554bed0ea80b7110f0b3a6",
  },
  "linux-arm64": {
    name: "ffmpeg-n9.0.2-28-g669f5ab083-linuxarm64-gpl-9.0.tar.xz",
    sha256: "623cf029917f0740580ca6f57875ced4cef923238247af73220b6098634c256f",
  },
};

function platformKey() {
  if (process.platform === "linux" && process.arch === "x64") return "linux-x64";
  if (process.platform === "linux" && process.arch === "arm64") return "linux-arm64";
  return "";
}

function runtimeBinaryConfigured() {
  const configured = process.env.FFMPEG_BIN?.trim();
  return configured && existsSync(configured) ? configured : "";
}

function verify(buffer, expected) {
  const actual = createHash("sha256").update(buffer).digest("hex");
  if (actual !== expected) {
    throw new Error(`FFmpeg checksum mismatch: expected ${expected}, got ${actual}`);
  }
}

/** Fail the build early if the binary cannot perform configured media watermarks. */
function verifyWatermarkCapabilities(binaryPath) {
  const options = { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15_000 };
  let filters;
  let encoders;
  try {
    filters = execFileSync(binaryPath, ["-hide_banner", "-filters"], options);
    encoders = execFileSync(binaryPath, ["-hide_banner", "-encoders"], options);
  } catch {
    throw new Error("FFmpeg is present but could not run its capability check.");
  }

  const missing = [];
  for (const name of ["drawtext", "overlay", "scale"]) {
    if (!new RegExp("\\b" + name + "\\b").test(filters)) missing.push("filter " + name);
  }
  for (const name of ["libwebp", "libx264"]) {
    if (!new RegExp("\\b" + name + "\\b").test(encoders)) missing.push("encoder " + name);
  }
  if (missing.length) {
    throw new Error("FFmpeg lacks required media watermark capabilities: " + missing.join(", "));
  }
}

async function download(url, redirects = 0, label = "FFmpeg") {
  if (redirects > 5) throw new Error(`Too many ${label} download redirects.`);
  const configuredTimeout = Number(process.env.HIRMAND_FFMPEG_DOWNLOAD_TIMEOUT_MS);
  const timeoutMs = Number.isInteger(configuredTimeout) && configuredTimeout >= 1000 && configuredTimeout <= 120_000
    ? configuredTimeout
    : 120_000;
  let response;
  try {
    response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error && typeof error === "object" && error.name === "TimeoutError") {
      throw new Error(`${label} download timed out after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  }
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) throw new Error(`${label} download redirect has no location (${response.status}).`);
    return download(new URL(location, url).toString(), redirects + 1, label);
  }
  if (!response.ok) throw new Error(`${label} download failed with HTTP ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

function verifyGitBlob(buffer, expected) {
  const header = Buffer.from(`blob ${buffer.length}\0`);
  const actual = createHash("sha1").update(Buffer.concat([header, buffer])).digest("hex");
  if (actual !== expected) {
    throw new Error(`Vazirmatn font blob checksum mismatch: expected ${expected}, got ${actual}`);
  }
}

/**
 * FFmpeg drawtext needs a real TTF/OTF file; browser WOFF2 assets are not a
 * reliable font source for the FreeType filter in minimal Liara containers.
 *
 * The font is written to the repo-root `.runtime/fonts/` and also mirrored into
 * `src/.runtime/fonts/` (when that layout exists) so both path resolutions used
 * by the watermark modules can find it at runtime.
 */
async function ensureWatermarkFont() {
  mkdirSync(FONT_DIR, { recursive: true });
  if (existsSync(FONT_PATH)) {
    try {
      verifyGitBlob(readFileSync(FONT_PATH), FONT_GIT_BLOB_SHA1);
    } catch {
      rmSync(FONT_PATH, { force: true });
    }
  }

  if (!existsSync(FONT_PATH)) {
    console.log(`[font] Downloading verified Vazirmatn ${FONT_VERSION} TrueType font…`);
    const buffer = await download(FONT_URL, 0, "Vazirmatn font");
    verifyGitBlob(buffer, FONT_GIT_BLOB_SHA1);
    const tempPath = `${FONT_PATH}.tmp-${process.pid}`;
    try {
      writeFileSync(tempPath, buffer);
      renameSync(tempPath, FONT_PATH);
    } finally {
      rmSync(tempPath, { force: true });
    }
    console.log("[font] Ready with checksum-verified Persian TTF font.");
  }

  // Mirror into src/.runtime/fonts so the __dirname-relative path in the
  // watermark modules can also find it when cwd is not the repo root.
  mirrorRuntimeDir(__dirname);

  return FONT_PATH;
}

/**
 * Copy .runtime artifacts into locations that the watermark modules can resolve
 * via __dirname-relative paths at runtime.
 *
 * The watermark modules live in src/lib/ and resolve:
 *   - .runtime/fonts/Vazirmatn-Regular.ttf  (relative to src/lib/.. = src/)
 *   - .runtime/ffmpeg/ffmpeg              (relative to src/lib/.. = src/)
 *
 * So we mirror into repo-root/src/.runtime and also into repo-root/src/lib/.runtime
 * as fallbacks.
 */
function mirrorRuntimeDir(_scriptDir) {
  // Compute repo root: scripts/.. = repo root
  const repoRoot = resolve(__dirname, "..");
  // Mirror into src/.runtime and src/lib/.runtime
  for (const sub of ["src", "src/lib"]) {
    try {
      const runtimeDir = join(repoRoot, sub, ".runtime");
      mkdirSync(runtimeDir, { recursive: true });
      mkdirSync(join(runtimeDir, "fonts"), { recursive: true });
      mkdirSync(join(runtimeDir, "ffmpeg"), { recursive: true });

      if (existsSync(FONT_PATH)) {
        copyFileSync(
          FONT_PATH,
          join(runtimeDir, "fonts", "Vazirmatn-Regular.ttf")
        );
      }
      if (existsSync(TARGET_PATH)) {
        const dest = join(
          runtimeDir,
          "ffmpeg",
          process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
        );
        copyFileSync(TARGET_PATH, dest);
        try {
          chmodSync(dest, 0o755);
        } catch {
          // ignore permission errors on non-Unix hosts
        }
      }
    } catch (error) {
      console.warn(
        "[ffmpeg] Could not mirror .runtime into " + sub + "/.runtime:",
        error instanceof Error ? error.message : error
      );
    }
  }
}

export async function ensureFfmpegBinary() {
  await ensureWatermarkFont();
  const configured = runtimeBinaryConfigured();
  if (configured) {
    verifyWatermarkCapabilities(configured);
    console.log(`[ffmpeg] Using configured FFmpeg with required watermark filters/encoders.`);
    return configured;
  }

  if (existsSync(TARGET_PATH)) {
    try {
      verifyWatermarkCapabilities(TARGET_PATH);
      console.log("[ffmpeg] Bundled runtime has the required watermark filters/encoders.");
      return TARGET_PATH;
    } catch {
      // A cache from an older build may contain the upstream binary without
      // drawtext. Replace it instead of making all later builds fail repeatedly.
      console.warn("[ffmpeg] Cached runtime lacks required watermark capabilities; replacing it.");
      rmSync(TARGET_PATH, { force: true });
    }
  }

  const key = platformKey();
  const asset = ASSETS[key];
  if (!asset) {
    console.warn(`[ffmpeg] No bundled binary for ${process.platform}/${process.arch}. Set FFMPEG_BIN to a system FFmpeg binary on this platform.`);
    return "";
  }

  // The pinned asset names/digests above belong to BtbN/FFmpeg-Builds,
  // not eugeneware/ffmpeg-static. Keeping the repositories mismatched caused
  // HTTP 404 during Liara's prebuild and prevented the entire deployment.
  const baseUrl = process.env.HIRMAND_FFMPEG_BASE_URL?.trim()
    || "https://github.com/BtbN/FFmpeg-Builds/releases/download";
  const url = `${baseUrl}/${RELEASE_TAG}/${asset.name}`;

  console.log(`[ffmpeg] Downloading verified ${asset.name}…`);
  let archive = await download(url);
  verify(archive, asset.sha256);

  mkdirSync(TARGET_DIR, { recursive: true });
  const archivePath = join(TARGET_DIR, asset.name);
  const extractDir = join(TARGET_DIR, `extract-${process.pid}`);
  const tempBinary = `${TARGET_PATH}.tmp-${process.pid}`;
  try {
    writeFileSync(archivePath, archive);
    // Release the large compressed archive buffer before extracting the static
    // binary; the archive itself is also removed in the finally block.
    archive = Buffer.alloc(0);
    mkdirSync(extractDir, { recursive: true });
    try {
      execFileSync(
        "tar",
        ["-xJf", archivePath, "--wildcards", "--strip-components=2", "-C", extractDir, "*/bin/ffmpeg"],
        { timeout: 240_000, stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch {
      throw new Error("Could not extract the pinned FFmpeg archive. Ensure tar supports xz archives.");
    }

    const extractedBinary = join(extractDir, "ffmpeg");
    if (!existsSync(extractedBinary)) {
      throw new Error("Pinned FFmpeg archive did not contain the expected bin/ffmpeg executable.");
    }
    copyFileSync(extractedBinary, tempBinary);
    chmodSync(tempBinary, 0o755);
    rmSync(TARGET_PATH, { force: true });
    renameSync(tempBinary, TARGET_PATH);
  } finally {
    rmSync(archivePath, { force: true });
    rmSync(extractDir, { recursive: true, force: true });
    rmSync(tempBinary, { force: true });
  }

  verifyWatermarkCapabilities(TARGET_PATH);
  console.log("[ffmpeg] Ready with the required watermark filters/encoders.");
  mirrorRuntimeDir(__dirname);
  return TARGET_PATH;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
const isMain = Boolean(invokedPath) && (() => {
  try {
    return realpathSync(invokedPath) === realpathSync(new URL(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) {
  try {
    await ensureFfmpegBinary();
  } catch (error) {
    console.error("[ffmpeg] Failed to provision FFmpeg:", error);
    process.exit(1);
  }
}
