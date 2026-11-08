#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import xzDecompress from "xz-decompress";

const { XzReadableStream } = xzDecompress;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Pin the complete GPL static build rather than ffmpeg-static's Linux asset:
 // drawtext has been absent from that asset, which breaks Persian text watermarks.
 // SHA-256 values are the digests published by the upstream BtbN release.
const RELEASE_TAG = "autobuild-2026-11-01-12-49";
const TARGET_DIR = join(process.cwd(), ".runtime", "ffmpeg");
const TARGET_PATH = join(TARGET_DIR, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
const FONT_VERSION = "v33.003";
const FONT_DIR = join(process.cwd(), ".runtime", "fonts");
const FONT_PATH = join(FONT_DIR, "Vazirmatn-Regular.ttf");
const BUNDLED_FONT_PATH = join(__dirname, "..", "public", "fonts", "Vazirmatn-Regular.ttf");
const FONT_URL = `https://raw.githubusercontent.com/rastikerdar/vazirmatn/${FONT_VERSION}/fonts/ttf/Vazirmatn-Regular.ttf`;
const FONT_GIT_BLOB_SHA1 = "64e4a8189557a17b63fd7a77794207483e592972";

const ASSETS = {
  "linux-x64": {
    assetId: 698334968,
    name: "ffmpeg-n9.0.2-42-gd7643a0fe3-linux64-gpl-9.0.tar.xz",
    sha256: "11570b7bb1436ff432c91202ae0e7ea4be65359fd06650e18935c1ee9d005bf6",
  },
  "linux-arm64": {
    assetId: 698335088,
    name: "ffmpeg-n9.0.2-42-gd7643a0fe3-linuxarm64-gpl-9.0.tar.xz",
    sha256: "b45eb0c42d311d12f3bddcd7b3a29a3e7fcc2455076d13c79552d45b48d57c08",
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

/**
 * Stream-decompress an XZ archive to a temporary tar file before extracting
 * the one required member. Liara's minimal Node image does not include an xz
 * executable, so `tar -xJf` cannot unpack the pinned BtbN release there. The
 * intermediate file also lets tar finish reading its input independently of
 * the decoder stream while avoiding buffering the uncompressed archive.
 */
export async function extractFfmpegArchive(archivePath, extractDir, archiveRoot) {
  const tarPath = join(extractDir, "ffmpeg-release.tar");
  mkdirSync(extractDir, { recursive: true });
  try {
    const compressed = Readable.toWeb(createReadStream(archivePath));
    const decompressed = new XzReadableStream(compressed);
    await pipeline(Readable.fromWeb(decompressed), createWriteStream(tarPath));
    execFileSync(
      "tar",
      ["-xf", tarPath, "--strip-components=2", "-C", extractDir, `${archiveRoot}/bin/ffmpeg`],
      { timeout: 240_000, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    throw new Error(
      `Could not extract the pinned FFmpeg archive: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  } finally {
    rmSync(tarPath, { force: true });
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

export async function download(url, redirects = 0, label = "FFmpeg", options = {}) {
  if (redirects > 5) throw new Error(`Too many ${label} download redirects.`);
  const configuredTimeout = Number(process.env.HIRMAND_FFMPEG_DOWNLOAD_TIMEOUT_MS);
  const timeoutMs = Number.isInteger(configuredTimeout) && configuredTimeout >= 1000 && configuredTimeout <= 120_000
    ? configuredTimeout
    : 120_000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const maxAttempts = Number.isInteger(options.maxAttempts) && options.maxAttempts >= 1 && options.maxAttempts <= 5
    ? options.maxAttempts
    : 4;
  const retryDelays = options.retryDelays ?? [1_000, 3_000, 7_000];
  const retryableStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        ...(options.headers ? { headers: options.headers } : {}),
      });
    } catch (error) {
      if (attempt < maxAttempts - 1) {
        const delayMs = retryDelays[Math.min(attempt, retryDelays.length - 1)] ?? 7_000;
        console.warn(`[ffmpeg] ${label} download attempt ${attempt + 1}/${maxAttempts} failed; retrying in ${delayMs}ms.`);
        await sleep(delayMs);
        continue;
      }
      if (error && typeof error === "object" && error.name === "TimeoutError") {
        throw new Error(`${label} download timed out after ${timeoutMs}ms: ${url}`);
      }
      throw error;
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error(`${label} download redirect has no location (${response.status}).`);
      return download(new URL(location, url).toString(), redirects + 1, label, options);
    }
    if (!response.ok) {
      if (retryableStatuses.has(response.status) && attempt < maxAttempts - 1) {
        const delayMs = retryDelays[Math.min(attempt, retryDelays.length - 1)] ?? 7_000;
        console.warn(`[ffmpeg] ${label} download returned HTTP ${response.status}; retrying in ${delayMs}ms (${attempt + 1}/${maxAttempts}).`);
        await sleep(delayMs);
        continue;
      }
      throw new Error(`${label} download failed with HTTP ${response.status}.`);
    }
    try {
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt < maxAttempts - 1) {
        const delayMs = retryDelays[Math.min(attempt, retryDelays.length - 1)] ?? 7_000;
        console.warn(`[ffmpeg] ${label} response body failed; retrying in ${delayMs}ms (${attempt + 1}/${maxAttempts}).`);
        await sleep(delayMs);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`${label} download failed after ${maxAttempts} attempts.`);
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
    const buffer = existsSync(BUNDLED_FONT_PATH)
      ? readFileSync(BUNDLED_FONT_PATH)
      : await download(FONT_URL, 0, "Vazirmatn font");
    verifyGitBlob(buffer, FONT_GIT_BLOB_SHA1);
    const tempPath = `${FONT_PATH}.tmp-${process.pid}`;
    try {
      writeFileSync(tempPath, buffer);
      renameSync(tempPath, FONT_PATH);
    } finally {
      rmSync(tempPath, { force: true });
    }
    console.log(existsSync(BUNDLED_FONT_PATH)
      ? "[font] Ready with bundled checksum-verified Persian TTF font."
      : "[font] Ready with downloaded checksum-verified Persian TTF font.");
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

  // Use the GitHub Releases API asset endpoint rather than the browser
  // download page: the latter has intermittently returned HTTP 504 at GitHub's
  // edge, while the API redirects directly to the signed release-assets URL.
  const customBaseUrl = process.env.HIRMAND_FFMPEG_BASE_URL?.trim();
  const url = customBaseUrl
    ? `${customBaseUrl.replace(/\/+$/, "")}/${RELEASE_TAG}/${asset.name}`
    : `https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/assets/${asset.assetId}`;

  console.log(`[ffmpeg] Downloading verified ${asset.name}…`);
  let archive = await download(url, 0, "FFmpeg", customBaseUrl
    ? {}
    : { headers: { Accept: "application/octet-stream", "X-GitHub-Api-Version": "2022-11-28" } });
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
    const archiveRoot = asset.name.replace(/\.tar\.xz$/, "");
    await extractFfmpegArchive(archivePath, extractDir, archiveRoot);

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
