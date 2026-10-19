import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ffmpegDownloader = await readFile(
  new URL("./ensure-ffmpeg.mjs", import.meta.url),
  "utf8",
);
const deployEnv = await readFile(
  new URL("./validate-deploy-env.mjs", import.meta.url),
  "utf8",
);

test("FFmpeg download has a finite timeout and an actionable timeout error", () => {
  assert.match(ffmpegDownloader, /AbortSignal\.timeout\(timeoutMs\)/);
  assert.match(ffmpegDownloader, /\$\{label\} download timed out after/);
});

test("npm build does not repeat fallback image downloads", () => {
  assert.match(deployEnv, /npm_lifecycle_event !== "build"/);
});


const propertyStore = await readFile(
  new URL("../src/lib/properties.ts", import.meta.url),
  "utf8",
);
const packageManifest = await readFile(
  new URL("../package.json", import.meta.url),
  "utf8",
);
const ffmpegProvisioner = await readFile(
  new URL("./ensure-ffmpeg.mjs", import.meta.url),
  "utf8",
);
const mediaStore = await readFile(
  new URL("../src/lib/media-store.server.ts", import.meta.url),
  "utf8",
);
const watermarkRuntime = await readFile(
  new URL("../src/lib/watermark-runtime.server.ts", import.meta.url),
  "utf8",
);

test("property save SQL assigns every INSERT placeholder and types floor_label", () => {
  const queryStart = propertyStore.indexOf("`insert into properties (");
  assert.notEqual(queryStart, -1, "saveProperty should contain its properties INSERT");

  const valuesStart = propertyStore.indexOf(") values (", queryStart);
  assert.notEqual(valuesStart, -1, "property INSERT should include a VALUES block");

  const valuesEnd = propertyStore.indexOf(")\n      on conflict (id) do update set", valuesStart);
  assert.notEqual(valuesEnd, -1, "property INSERT should be followed by its upsert clause");

  const valuesSql = propertyStore.slice(valuesStart, valuesEnd);
  const placeholders = [...valuesSql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
  const uniquePlaceholders = [...new Set(placeholders)].sort((a, b) => a - b);

  assert.deepEqual(
    uniquePlaceholders,
    Array.from({ length: 49 }, (_, index) => index + 1),
    "property INSERT placeholders must be contiguous from $1 through $49",
  );
  assert.match(
    valuesSql,
    /\$35::double precision,\s*\$36::double precision,\s*\$37::text,\s*\$38::text,\s*\$39::boolean/,
    "latitude, longitude, virtual tour, floor label, and painted values must map to their respective typed parameters",
  );
});

const mediaProtocol = await readFile(
  new URL("../src/lib/chunked-upload.server.ts", import.meta.url),
  "utf8",
);
const mediaClient = await readFile(
  new URL("../src/lib/media-upload-client.ts", import.meta.url),
  "utf8",
);
const mediaField = await readFile(
  new URL("../src/components/hirmand/admin-media-field.tsx", import.meta.url),
  "utf8",
);
const imageWatermark = await readFile(
  new URL("../src/lib/property-image-watermark.ts", import.meta.url),
  "utf8",
);
const serverImageWatermark = await readFile(
  new URL("../src/lib/property-image-watermark.server.ts", import.meta.url),
  "utf8",
);
const serverVideoWatermark = await readFile(
  new URL("../src/lib/property-video-watermark.server.ts", import.meta.url),
  "utf8",
);
const uploadRoute = await readFile(
  new URL("../server/routes/api/upload.post.ts", import.meta.url),
  "utf8",
);
const customerUploadRoute = await readFile(
  new URL("../server/routes/api/customer-property-upload.post.ts", import.meta.url),
  "utf8",
);

test("media upload verifies binary signatures before object-store offload", () => {
  assert.match(mediaProtocol, /readRawBody\(event, false\)/);
  const signatureCheck = mediaProtocol.indexOf("contentMatchesDeclaredType(signatureProbe");
  const storeCall = mediaProtocol.indexOf("stored = await storeAssembledUpload");
  assert.ok(signatureCheck >= 0 && storeCall > signatureCheck, "signature validation must precede persistence/offload");
});

test("media uploads retain server diagnostics for finalization failures", () => {
  assert.ok(mediaProtocol.includes("[upload] finalization failed for"));
  assert.ok(mediaClient.includes("HTTP ${completeResponse.status}"));
  assert.ok(
    mediaProtocol.includes('if (stored.storage !== "database" || !stored.id) return;'),
    "offloaded objects must not be re-read from the database-only media table",
  );
});

test("successful finalization keeps a replay receipt but releases chunk payloads", () => {
  assert.match(mediaProtocol, /completion_result is not null/);
  assert.match(mediaProtocol, /where id = \$1 and kind = \$2 and completion_result is not null/);
  const resultWrite = mediaProtocol.indexOf("set completion_result = $2::jsonb");
  const resultReturn = mediaProtocol.indexOf("return { ...resultObject, storage: stored.storage }", resultWrite);
  assert.ok(resultWrite >= 0 && resultReturn > resultWrite);
  const committedSection = mediaProtocol.slice(resultWrite, resultReturn);
  assert.match(committedSection, /delete from media_upload_chunks where session_id = \$1/);
  assert.doesNotMatch(committedSection, /delete from media_upload_sessions/);
});

test("placeholder gallery values are stripped before strict URL validation", () => {
  const imagesSchema = propertyStore.indexOf("images: z");
  const stripFallbacks = propertyStore.indexOf(".transform((images) => images.filter((src) => !isPropertyFallbackImage(src)))", imagesSchema);
  const strictPipe = propertyStore.indexOf(".pipe(", stripFallbacks);
  assert.ok(imagesSchema >= 0 && stripFallbacks > imagesSchema && strictPipe > stripFallbacks);
});

test("admin media uploads are single-flight and append to the latest form value", () => {
  assert.match(mediaField, /const uploadingRef = useRef\(false\)/);
  assert.match(mediaField, /valueRef\.current/);
  assert.match(mediaField, /if \(uploadingRef\.current\) return/);
  assert.match(mediaField, /retryCompletion: true/);
});

test("active image watermarking fails closed instead of silently uploading originals", () => {
  assert.match(imageWatermark, /واترمارک خودکار برای GIF متحرک پشتیبانی نمی‌شود/);
  assert.match(imageWatermark, /if \(!context\) throw new Error/);
  assert.match(imageWatermark, /if \(!blob\) throw new Error/);
  assert.doesNotMatch(imageWatermark, /if \(!blob\) return file/);
});

test("opaque upload failures expose sanitized HTTP and proxy diagnostics", () => {
  assert.match(mediaClient, /سرور پاسخ غیرقابل‌خواندن برگرداند/);
  assert.match(mediaClient, /response\.status/);
  assert.ok(uploadRoute.includes("[upload] API request failed:"));
});

test("upload client reuses the same ID for bounded finalization recovery", () => {
  assert.match(mediaClient, /recover the same receipt/i);
  assert.match(mediaClient, /action: "complete", uploadId/);
  assert.match(mediaClient, /options\.retryCompletion/);
  assert.match(mediaClient, /attempt < maxCompletionAttempts/);
});

test("property images are permanently watermarked on the server before storage", () => {
  assert.match(uploadRoute, /applyPropertyImageWatermarkServer/);
  assert.match(uploadRoute, /applyPropertyVideoWatermark/);
  assert.match(serverImageWatermark, /contentMatchesDeclaredType\(output, "image\/webp"\)/);
  assert.match(serverImageWatermark, /واترمارک دائمی برای GIF متحرک پشتیبانی نمی‌شود/);
  assert.match(serverImageWatermark, /timeout: 90_000/);
  // The font must be the provisioned real TTF, resolved by the shared helper.
  // A fixed `join(__dirname, "..", ...)` misses `.runtime/` once Nitro bundles
  // the module into `.output/server/_chunks/`, which is what produced HTTP 500
  // with "font not found" in production.
  assert.match(
    serverImageWatermark,
    /resolveWatermarkFont\(\)/,
    "image watermarking must resolve the provisioned Vazirmatn TTF through the shared runtime helper",
  );
  assert.match(
    serverImageWatermark,
    /from "\.\/watermark-runtime\.server\.ts"/,
    "image watermarking must use the shared runtime asset resolver",
  );
  assert.match(
    watermarkRuntime,
    /"Vazirmatn-Regular\.ttf"/,
    "the shared resolver must reference the provisioned Vazirmatn TTF font",
  );
  // The resolver must search the app root (production cwd), not only the
  // module directory, and stay overridable for unusual deployments.
  assert.match(watermarkRuntime, /process\.cwd\(\)/);
  assert.match(watermarkRuntime, /HIRMAND_PROJECT_ROOT/);
  assert.match(watermarkRuntime, /join\(root, \.\.\.segments\)/);
  assert.match(watermarkRuntime, /resolveFromProject\("\.runtime", "fonts", "Vazirmatn-Regular\.ttf"\)/);
  // It must also check that ffmpeg is available before attempting watermarking.
  assert.match(
    serverImageWatermark,
    /if \(!resolveBundledFfmpeg\(\)\)/,
    "image watermarking must verify ffmpeg runtime availability before processing",
  );
  assert.match(ffmpegDownloader, /FONT_GIT_BLOB_SHA1 = "64e4a8189557a17b63fd7a77794207483e592972"/);
  assert.match(ffmpegDownloader, /await ensureWatermarkFont\(\)/);
  assert.match(ffmpegDownloader, /download\(FONT_URL, 0, "Vazirmatn font"\)/);

  // The video watermark module must use the same robust path resolution.
  assert.match(serverVideoWatermark, /resolveWatermarkFont\(\)/);
  assert.match(serverVideoWatermark, /from "\.\/watermark-runtime\.server\.ts"/);
  assert.match(
    serverVideoWatermark,
    /if \(!resolveBundledFfmpeg\(\)\)/,
    "video watermarking must verify ffmpeg runtime availability before processing",
  );
  assert.match(serverVideoWatermark, /applyPropertyVideoWatermark/);
  assert.match(serverVideoWatermark, /libx264/);
});

test("pending public property submissions cannot bypass permanent media watermark settings", () => {
  assert.match(customerUploadRoute, /getPropertyWatermarkSettingsServer/);
  assert.match(customerUploadRoute, /applyPropertyImageWatermarkServer/);
  assert.match(customerUploadRoute, /applyPropertyVideoWatermark/);
});

test("media start-rate quota is independent for each upload pathway", () => {
  assert.match(mediaProtocol, /media-upload:begin:\$\{config\.pathPrefix\}:\$\{clientFingerprint\(event\)\}/);
});

test("production prebuild provisions the checksum-verified FFmpeg binary used for watermarking", () => {
  assert.match(packageManifest, /"prebuild": "node scripts\/ensure-ffmpeg\.mjs && node scripts\/generate-fallback-assets\.mjs"/);
});

test("object-store offload never deletes the database fallback before saving the Liara URL", () => {
  const persistDbPointer = mediaStore.indexOf("set completion_state = 'assembled', stored_url = $2", mediaStore.indexOf("// Commit a usable database URL"));
  const remoteUpload = mediaStore.indexOf("remoteUrl = await putLiaraObject", persistDbPointer);
  const persistRemotePointer = mediaStore.indexOf("remoteStored.url", remoteUpload);
  const deleteDbCopy = mediaStore.indexOf('delete from media_objects where id = $1', persistRemotePointer);
  assert.ok(persistDbPointer >= 0 && remoteUpload > persistDbPointer);
  assert.ok(persistRemotePointer > remoteUpload && deleteDbCopy > persistRemotePointer);
});

test("FFmpeg release URL uses the same repository as its pinned release assets", () => {
  assert.match(ffmpegProvisioner, /https:\/\/github\.com\/BtbN\/FFmpeg-Builds\/releases\/download/);
  assert.doesNotMatch(ffmpegProvisioner, /\|\| "https:\/\/github\.com\/eugeneware\/ffmpeg-static\/releases\/download"/);
  assert.match(ffmpegProvisioner, /ffmpeg-n9\.0\.2-28-g669f5ab083-linux64-gpl-9\.0\.tar\.xz/);
  assert.match(ffmpegProvisioner, /FFmpeg lacks required media watermark capabilities/);
});
