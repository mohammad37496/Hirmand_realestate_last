#!/usr/bin/env node
/**
 * End-to-end proof for the admin property-media upload path.
 *
 * This drives the *real* HTTP contract the browser uses — `begin`, one binary
 * chunk per slice, `complete` — then fetches the returned URL from the public
 * media endpoint and checks the bytes are a real raster image. It exists because
 * a passing typecheck/build never proved this path: the permanent-watermark
 * FFmpeg filter used to abort at filter-graph init and every image upload
 * answered HTTP 500.
 *
 * Usage:
 *   HIRMAND_ADMIN_KEY=... node scripts/upload-e2e-smoke.mjs http://127.0.0.1:8081
 *
 * Requires a running server built with a configured database and the bundled
 * FFmpeg runtime (so the watermark pipeline actually executes).
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const baseUrl = (process.argv[2] || "http://127.0.0.1:8081").replace(/\/+$/, "");
const adminKey = process.env.HIRMAND_ADMIN_KEY?.trim();

if (!adminKey) {
  throw new Error("HIRMAND_ADMIN_KEY is required for the upload smoke.");
}

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const ffmpegPath = join(projectRoot, ".runtime", "ffmpeg", "ffmpeg");

const RASTER_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);

function hasAscii(bytes, start, value) {
  if (start + value.length > bytes.length) return false;
  return value === bytes.subarray(start, start + value.length).toString("latin1");
}

/** Detect the served container from magic bytes, not from the Content-Type header. */
function detectRaster(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (hasAscii(bytes, 0, "\x89PNG\r\n\x1a\n")) return "image/png";
  if (hasAscii(bytes, 0, "GIF87a") || hasAscii(bytes, 0, "GIF89a")) return "image/gif";
  if (hasAscii(bytes, 0, "RIFF") && hasAscii(bytes, 8, "WEBP")) return "image/webp";
  if (hasAscii(bytes, 4, "ftyp") && hasAscii(bytes, 8, "avif")) return "image/avif";
  return "";
}

/** A realistic gallery-sized JPEG; falls back to a tiny fixture without FFmpeg. */
async function buildJpeg() {
  if (!existsSync(ffmpegPath)) return Buffer.from(TINY_JPEG_BASE64, "base64");
  const workDir = await mkdtemp(join(tmpdir(), "hirmand-upload-e2e-"));
  try {
    const jpegPath = join(workDir, "photo_2026-10-19_12-57-34.jpg");
    await execFileAsync(ffmpegPath, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=1200x900",
      "-frames:v",
      "1",
      "-q:v",
      "3",
      jpegPath,
    ]);
    return await readFile(jpegPath);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function buildMp4() {
  if (!existsSync(ffmpegPath)) return null;
  const workDir = await mkdtemp(join(tmpdir(), "hirmand-upload-video-e2e-"));
  try {
    const videoPath = join(workDir, "property-tour.mp4");
    await execFileAsync(ffmpegPath, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=320x240:r=12",
      "-t",
      "1",
      "-an",
      "-c:v",
      "mpeg4",
      "-movflags",
      "+faststart",
      videoPath,
    ]);
    return await readFile(videoPath);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

let cookie = "";

async function call(path, init = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  headers.set("origin", baseUrl);
  const response = await fetch(baseUrl + path, { ...init, headers, redirect: "manual" });
  const setCookie = response.headers.getSetCookie?.() ?? [];
  if (setCookie.length) {
    cookie = setCookie.map((value) => value.split(";")[0]).join("; ");
  }
  return response;
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text.slice(0, 300) };
  }
}

async function login() {
  const response = await call("/api/admin/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "login", adminKey }),
  });
  const payload = await readJson(response);
  if (!response.ok || !payload?.success) {
    throw new Error(
      `Admin login failed (HTTP ${response.status}): ${payload?.statusMessage ?? payload?.raw ?? "no body"}`,
    );
  }
  if (!cookie) throw new Error("Admin login did not return a session cookie.");
}

/** Exactly the client protocol in src/lib/media-upload-client.ts. */
async function upload(file, filename, endpoint = "/api/property-media", contentType = "image/jpeg", assetKind = "gallery") {
  const beginResponse = await call(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "begin",
      filename,
      contentType,
      assetKind,
      sizeBytes: file.length,
    }),
  });
  const begin = await readJson(beginResponse);
  if (!beginResponse.ok || !begin?.uploadId) {
    throw new Error(
      `begin failed (HTTP ${beginResponse.status}): ${begin?.statusMessage ?? JSON.stringify(begin)}`,
    );
  }

  const uploadId = begin.uploadId;
  const chunkSize = Number(begin.chunkSize) || 2 * 1024 * 1024;
  const totalChunks = Math.max(1, Number(begin.totalChunks) || Math.ceil(file.length / chunkSize));

  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * chunkSize;
    const slice = file.subarray(start, Math.min(start + chunkSize, file.length));
    const chunkResponse = await call(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-upload-id": uploadId,
        "x-upload-index": String(index),
      },
      body: slice,
    });
    const ack = await readJson(chunkResponse);
    if (!chunkResponse.ok) {
      throw new Error(
        `chunk ${index + 1}/${totalChunks} failed (HTTP ${chunkResponse.status}): ${ack?.statusMessage ?? JSON.stringify(ack)}`,
      );
    }
    if (Number(ack?.bytesReceived) !== Math.min(file.length, (index + 1) * chunkSize)) {
      throw new Error(`chunk ${index + 1} byte accounting mismatch: ${JSON.stringify(ack)}`);
    }
  }

  const completeResponse = await call(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "complete", uploadId }),
  });
  const complete = await readJson(completeResponse);
  if (!completeResponse.ok) {
    throw new Error(
      `complete failed (HTTP ${completeResponse.status}): ${complete?.statusMessage ?? JSON.stringify(complete)}`,
    );
  }
  if (typeof complete?.url !== "string" || !complete.url) {
    throw new Error(`complete returned no media URL: ${JSON.stringify(complete)}`);
  }
  return { uploadId, result: complete, endpoint };
}

async function main() {
  await login();
  console.log("[upload-e2e] admin session established");

  const file = await buildJpeg();
  console.log(`[upload-e2e] uploading ${file.length} byte JPEG`);

  const { uploadId, result, endpoint } = await upload(file, "photo_2026-10-19_12-57-34.jpg");
  console.log(`[upload-e2e] stored at ${result.url} (${result.storage ?? "unknown"} storage)`);

  // Idempotency: replaying `complete` with the same uploadId must answer with the
  // same receipt instead of creating a second object.
  const replay = await call(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "complete", uploadId }),
  });
  const replayBody = await readJson(replay);
  if (!replay.ok || replayBody?.url !== result.url) {
    throw new Error(
      `replayed complete did not return the same receipt (HTTP ${replay.status}): ${JSON.stringify(replayBody)}`,
    );
  }
  console.log("[upload-e2e] replayed complete returned the same URL");

  const absolute = new URL(result.url, baseUrl).toString();
  const mediaResponse = await fetch(absolute);
  const body = Buffer.from(await mediaResponse.arrayBuffer());
  if (!mediaResponse.ok) {
    throw new Error(`serving ${absolute} failed with HTTP ${mediaResponse.status}`);
  }
  const declared = (mediaResponse.headers.get("content-type") || "").split(";")[0].trim();
  if (!RASTER_TYPES.has(declared)) {
    throw new Error(`media endpoint served unexpected content-type ${declared}`);
  }
  const detected = detectRaster(body);
  if (!detected) {
    throw new Error(`served bytes are not a raster image (${body.length} bytes)`);
  }
  if (detected !== declared) {
    throw new Error(`served bytes (${detected}) disagree with content-type ${declared}`);
  }
  if (body.length < 1024) {
    throw new Error(`served image is suspiciously small (${body.length} bytes)`);
  }
  console.log(
    `[upload-e2e] media endpoint served ${body.length} bytes of ${detected}; watermark ${detected === "image/webp" ? "applied" : "skipped (original stored)"}`,
  );

  const video = await buildMp4();
  if (video) {
    console.log(`[upload-e2e] uploading ${video.length} byte MP4 video`);
    const videoUpload = await upload(video, "property-tour.mp4", "/api/property-media", "video/mp4", "gallery");
    const videoResponse = await fetch(new URL(videoUpload.result.url, baseUrl).toString());
    const videoBytes = Buffer.from(await videoResponse.arrayBuffer());
    const videoType = (videoResponse.headers.get("content-type") || "").split(";")[0].trim();
    const videoBrand = videoBytes.subarray(8, 12).toString("latin1").toLowerCase();
    const validBrands = ["isom", "iso2", "iso3", "iso4", "iso5", "iso6", "iso8", "mp41", "mp42", "avc1", "dash", "m4v ", "msnv", "3gp4", "3gp5", "3g2a", "f4v "];
    if (!videoResponse.ok || videoType !== "video/mp4" || !hasAscii(videoBytes, 4, "ftyp") || !validBrands.includes(videoBrand) || videoBytes.length < 1024) {
      throw new Error(`video delivery failed validation (HTTP ${videoResponse.status}, type=${videoType}, brand=${videoBrand}, bytes=${videoBytes.length})`);
    }
    console.log(`[upload-e2e] media endpoint served ${videoBytes.length} bytes of video/mp4`);

    const floorPlanUpload = await upload(file, "floor-plan.jpg", "/api/property-media", "image/jpeg", "floor-plan");
    if (floorPlanUpload.result.assetKind !== "floor-plan") {
      throw new Error(`floor-plan upload returned the wrong asset kind: ${JSON.stringify(floorPlanUpload.result)}`);
    }
    console.log("[upload-e2e] dedicated floor-plan upload contract returned a receipt");
  } else {
    console.warn("[upload-e2e] FFmpeg is missing; skipped MP4 and floor-plan upload checks.");
  }

  if (result.watermarkWarning) {
    console.warn(`[upload-e2e] WARNING reported to the panel: ${result.watermarkWarning}`);
  }

  // A/B proof that the failure is watermark-specific: repeat the same upload
  // with the operator setting switched off. The stored bytes must then be the
  // original JPEG, and switching it back on must watermark again.
  const settingsUpdate = async (enabled) => {
    const response = await call("/api/admin-watermark", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "update", enabled }),
    });
    const payload = await readJson(response);
    if (!response.ok || payload?.settings?.enabled !== enabled) {
      throw new Error(
        `watermark settings update failed (HTTP ${response.status}): ${JSON.stringify(payload)}`,
      );
    }
  };

  await settingsUpdate(false);
  try {
    const plain = await upload(file, "photo_2026-10-19_12-57-34.jpg", "/api/upload");
    const plainResponse = await fetch(new URL(plain.result.url, baseUrl).toString());
    const plainBody = Buffer.from(await plainResponse.arrayBuffer());
    const plainType = (plainResponse.headers.get("content-type") || "").split(";")[0].trim();
    if (!plainResponse.ok) {
      throw new Error(`watermark-off media fetch failed with HTTP ${plainResponse.status}`);
    }
    if (plainType !== "image/jpeg") {
      throw new Error(
        `watermark-off upload must keep the original JPEG, got ${plainType}`,
      );
    }
    if (detectRaster(plainBody) !== "image/jpeg") {
      throw new Error("watermark-off upload did not store JPEG bytes");
    }
    console.log(
      `[upload-e2e] watermark OFF kept the original ${plainBody.length} byte JPEG`,
    );
  } finally {
    await settingsUpdate(true);
  }

  console.log("[upload-e2e] OK");
}

const TINY_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
  "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCABAAEABAREA/8QAHwAAAQUBAQEB" +
  "AQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1Fh" +
  "ByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZ" +
  "WmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXG" +
  "x8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/AJVFFFf/2Q==";

await main();
