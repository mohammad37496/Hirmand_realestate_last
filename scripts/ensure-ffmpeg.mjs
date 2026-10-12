#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { realpathSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const RELEASE_TAG = "b6.1.1";
const TARGET_DIR = join(process.cwd(), ".runtime", "ffmpeg");
const TARGET_PATH = join(TARGET_DIR, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");

const ASSETS = {
  "linux-x64": {
    name: "ffmpeg-linux-x64.gz",
    sha256: "bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa",
  },
  "linux-arm64": {
    name: "ffmpeg-linux-arm64.gz",
    sha256: "754a678672298bc68156adff58aa7385a592c2b30b1d0ae8750c45c915c4bac0",
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

async function download(url, redirects = 0) {
  if (redirects > 5) throw new Error("Too many FFmpeg download redirects.");
  const configuredTimeout = Number(process.env.HIRMAND_FFMPEG_DOWNLOAD_TIMEOUT_MS);
  const timeoutMs = Number.isInteger(configuredTimeout) && configuredTimeout >= 1000 && configuredTimeout <= 120_000
    ? configuredTimeout
    : 45_000;
  let response;
  try {
    response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error && typeof error === "object" && error.name === "TimeoutError") {
      throw new Error(`FFmpeg download timed out after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  }
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) throw new Error(`FFmpeg download redirect has no location (${response.status}).`);
    return download(new URL(location, url).toString(), redirects + 1);
  }
  if (!response.ok) throw new Error(`FFmpeg download failed with HTTP ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

export async function ensureFfmpegBinary() {
  const configured = runtimeBinaryConfigured();
  if (configured) {
    console.log(`[ffmpeg] Using FFMPEG_BIN=${configured}`);
    return configured;
  }

  if (existsSync(TARGET_PATH)) {
    console.log(`[ffmpeg] Bundled runtime already present: ${TARGET_PATH}`);
    return TARGET_PATH;
  }

  const key = platformKey();
  const asset = ASSETS[key];
  if (!asset) {
    console.warn(`[ffmpeg] No bundled binary for ${process.platform}/${process.arch}. Set FFMPEG_BIN to a system FFmpeg binary on this platform.`);
    return "";
  }

  const baseUrl = process.env.HIRMAND_FFMPEG_BASE_URL?.trim()
    || "https://github.com/eugeneware/ffmpeg-static/releases/download";
  const url = `${baseUrl}/${RELEASE_TAG}/${asset.name}`;

  console.log(`[ffmpeg] Downloading ${asset.name}…`);
  const compressed = await download(url);
  verify(compressed, asset.sha256);
  const binary = gunzipSync(compressed);
  if (!binary.length) throw new Error("Downloaded FFmpeg binary is empty.");

  mkdirSync(dirname(TARGET_PATH), { recursive: true });
  const temp = `${TARGET_PATH}.tmp-${process.pid}`;
  try {
    writeFileSync(temp, binary, { mode: 0o755 });
    chmodSync(temp, 0o755);
    rmSync(TARGET_PATH, { force: true });
    writeFileSync(TARGET_PATH, binary, { mode: 0o755 });
    chmodSync(TARGET_PATH, 0o755);
  } finally {
    rmSync(temp, { force: true });
  }

  console.log(`[ffmpeg] Ready: ${TARGET_PATH}`);
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
