#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..");

// Pin the complete GPL static build rather than ffmpeg-static's Linux asset:
 // drawtext has been absent from that asset, which breaks Persian text watermarks.
 // SHA-256 values are the digests published by the upstream BtbN release.
const RELEASE_TAG = "autobuild-2026-10-18-13-01";
const TARGET_DIR = join(PROJECT_ROOT, ".runtime", "ffmpeg");
const TARGET_PATH = join(TARGET_DIR, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
const FONT_VERSION = "v33.003";
const FONT_DIR = join(PROJECT_ROOT, ".runtime", "fonts");
const FONT_PATH = join(FONT_DIR, "Vazirmatn-Regular.ttf");
// Keep the exact, checksum-pinned TTF in the source tree. Liara's isolated
// build environment must not need GitHub/CDN access just to render Persian
// watermarks. The copy in .runtime is the canonical runtime location.
const BUNDLED_FONT_PATH = join(PROJECT_ROOT, "public", "fonts", "Vazirmatn-Regular.ttf");
const FONT_URLS = [
  `https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@${FONT_VERSION}/fonts/ttf/Vazirmatn-Regular.ttf`,
  `https://raw.githubusercontent.com/rastikerdar/vazirmatn/${FONT_VERSION}/fonts/ttf/Vazirmatn-Regular.ttf`,
];
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

function isTransientDownloadError(error) {
  if (error instanceof TypeError) return true; // fetch wraps socket/connect failures as TypeError
  const message = error instanceof Error ? error.message : String(error);
  return /download timed out|HTTP (?:408|429|5\d{2})\b|ECONNRESET|ECONNREFUSED|UND_ERR_(?:CONNECT_TIMEOUT|SOCKET|BODY_TIMEOUT)/i.test(message);
}

/** Retry transient transport failures, but never retry integrity/capability failures. */
async function downloadWithRetry(url, label = "FFmpeg", attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await download(url, 0, label);
    } catch (error) {
      if (attempt === attempts || !isTransientDownloadError(error)) throw error;
      const delayMs = 500 * 2 ** (attempt - 1);
      console.warn(`[${label.toLowerCase()}] Transient download error (attempt ${attempt}/${attempts}); retrying in ${delayMs}ms.`);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
    }
  }
  throw new Error(`${label} download exhausted its retry budget.`);
}

function verifyGitBlob(buffer, expected) {
  const header = Buffer.from(`blob ${buffer.length}\0`);
  const actual = createHash("sha1").update(Buffer.concat([header, buffer])).digest("hex");
  if (actual !== expected) {
    throw new Error(`Vazirmatn font blob checksum mismatch: expected ${expected}, got ${actual}`);
  }
}

/**
 * Extract the one required executable without assuming the deployment image's
 * system tar has an XZ helper installed. The archive is checksum-verified by
 * the caller before this function is reached. The fallback streams XZ to a
 * temporary plain tar file so the 140+ MB compressed asset is never expanded
 * into a single in-memory buffer.
 */
export async function extractPinnedFfmpegArchive(
  archivePath,
  extractDir,
  {
    runCommand = execFileSync,
    decoderFactory,
  } = {},
) {
  const tarOptions = { timeout: 240_000, stdio: ["ignore", "pipe", "pipe"] };
  const selectFfmpeg = ["--wildcards", "--strip-components=2", "-C", extractDir, "*/bin/ffmpeg"];

  try {
    runCommand("tar", ["-xJf", archivePath, ...selectFfmpeg], tarOptions);
    return;
  } catch (systemTarError) {
    const plainTarPath = `${archivePath}.decompressed-${process.pid}.tar`;
    try {
      // Prevent xz-compat from attempting a network install of optional native
      // acceleration in minimal/isolated builders; its JS decoder is portable.
      process.env.LZMA_NATIVE_DISABLE = "1";
      const createDecoder = decoderFactory ?? (await import("xz-compat")).createXZDecoder;
      await pipeline(createReadStream(archivePath), createDecoder(), createWriteStream(plainTarPath));
      runCommand("tar", ["-xf", plainTarPath, ...selectFfmpeg], tarOptions);
      console.warn("[ffmpeg] System tar lacks XZ support; used the bundled streaming decoder.");
    } catch (fallbackError) {
      const systemMessage = systemTarError instanceof Error
        ? String(systemTarError.stderr?.toString?.("utf8") || systemTarError.message).trim()
        : String(systemTarError);
      const fallbackMessage = fallbackError instanceof Error
        ? String(fallbackError.stderr?.toString?.("utf8") || fallbackError.message).trim()
        : String(fallbackError);
      throw new Error(
        `Could not extract the pinned FFmpeg archive. System tar failed: ${systemMessage}; streaming XZ fallback failed: ${fallbackMessage}`,
        { cause: fallbackError },
      );
    } finally {
      rmSync(plainTarPath, { force: true });
    }
  }
}

/**
 * FFmpeg drawtext needs a real TTF/OTF file; browser WOFF2 assets are not a
 * reliable font source for the FreeType filter in minimal Liara containers.
 *
 * The font is stored at the project root so the runtime path resolver can find
 * one canonical copy from Liara, the dev server and the Nitro bundle.
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
    if (existsSync(BUNDLED_FONT_PATH)) {
      const bundled = readFileSync(BUNDLED_FONT_PATH);
      verifyGitBlob(bundled, FONT_GIT_BLOB_SHA1);
      const tempPath = `${FONT_PATH}.tmp-${process.pid}`;
      try {
        writeFileSync(tempPath, bundled);
        renameSync(tempPath, FONT_PATH);
      } finally {
        rmSync(tempPath, { force: true });
      }
      console.log(`[font] Using bundled checksum-verified Vazirmatn ${FONT_VERSION} TrueType font; no build-time network access required.`);
    } else {
      console.warn(`[font] Bundled TTF is missing; attempting checksum-verified ${FONT_VERSION} fallback mirrors.`);
      let buffer = null;
      const failures = [];
      for (const url of FONT_URLS) {
        try {
          const candidate = await downloadWithRetry(url, "Vazirmatn font");
          verifyGitBlob(candidate, FONT_GIT_BLOB_SHA1);
          buffer = candidate;
          console.log(`[font] Downloaded font from ${new URL(url).host}.`);
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failures.push(`${new URL(url).host}: ${message}`);
          console.warn(`[font] Mirror failed (${new URL(url).host}): ${message}`);
        }
      }
      if (!buffer) {
        throw new Error(`Could not download checksum-verified Vazirmatn font from any mirror. ${failures.join(" | ")}`);
      }
      const tempPath = `${FONT_PATH}.tmp-${process.pid}`;
      try {
        writeFileSync(tempPath, buffer);
        renameSync(tempPath, FONT_PATH);
      } finally {
        rmSync(tempPath, { force: true });
      }
      console.log("[font] Ready with checksum-verified Persian TTF font.");
    }
  }

  return FONT_PATH;
}

/**
 * Runtime assets live in one canonical location at the project root.
 * watermark-runtime.server.ts resolves process.cwd() first (the app root on
 * Liara), then walks module ancestors for dev/test/Nitro compatibility. Do not
 * duplicate the large static FFmpeg binary under src/ and src/lib/: those
 * copies inflate every Liara build image without improving path resolution.
 */

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
  let archive = await downloadWithRetry(url, "FFmpeg");
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
    await extractPinnedFfmpegArchive(archivePath, extractDir);

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
