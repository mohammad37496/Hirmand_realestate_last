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
  assert.match(ffmpegDownloader, /FFmpeg download timed out after/);
});

test("npm build does not repeat fallback image downloads", () => {
  assert.match(deployEnv, /npm_lifecycle_event !== "build"/);
});


const propertyStore = await readFile(
  new URL("../src/lib/properties.ts", import.meta.url),
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

test("media upload verifies binary signatures before object-store offload", () => {
  assert.match(mediaProtocol, /readRawBody\(event, false\)/);
  const signatureCheck = mediaProtocol.indexOf("contentMatchesDeclaredType(signatureProbe");
  const storeCall = mediaProtocol.indexOf("stored = await storeAssembledUpload");
  assert.ok(signatureCheck >= 0 && storeCall > signatureCheck, "signature validation must precede persistence/offload");
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

test("upload client reuses the same ID for bounded finalization recovery", () => {
  assert.match(mediaClient, /receipt makes this idempotent/i);
  assert.match(mediaClient, /action: "complete", uploadId/);
  assert.match(mediaClient, /options\.retryCompletion/);
  assert.match(mediaClient, /attempt < maxCompletionAttempts/);
});
