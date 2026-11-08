import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { download, extractFfmpegArchive } from "./ensure-ffmpeg.mjs";

const ffmpegDownloader = await readFile(
  new URL("./ensure-ffmpeg.mjs", import.meta.url),
  "utf8",
);
const deployEnv = await readFile(
  new URL("./validate-deploy-env.mjs", import.meta.url),
  "utf8",
);
const liveMediaSmoke = await readFile(
  new URL("./live-property-media-smoke.mjs", import.meta.url),
  "utf8",
);
const liveMediaWorkflow = await readFile(
  new URL("../.github/workflows/live-property-media-smoke.yml", import.meta.url),
  "utf8",
);
const liaraDeployWorkflow = await readFile(
  new URL("../.github/workflows/deploy-liara.yml", import.meta.url),
  "utf8",
);
const ciWorkflow = await readFile(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);
const verifyWorkflow = await readFile(
  new URL("../.github/workflows/verify.yml", import.meta.url),
  "utf8",
);
const liaraIgnore = await readFile(
  new URL("../.liaraignore", import.meta.url),
  "utf8",
);

test("FFmpeg download has a finite timeout and an actionable timeout error", () => {
  assert.match(ffmpegDownloader, /AbortSignal\.timeout\(timeoutMs\)/);
  assert.match(ffmpegDownloader, /\$\{label\} download timed out after/);
});

test("FFmpeg download retries transient gateway errors with bounded backoff", async () => {
  let calls = 0;
  const delays = [];
  const archive = await download("https://example.invalid/ffmpeg.tar.xz", 0, "FFmpeg", {
    fetchImpl: async () => {
      calls += 1;
      return calls < 3
        ? new Response("gateway timeout", { status: 504 })
        : new Response("verified archive", { status: 200 });
    },
    sleep: async (delayMs) => delays.push(delayMs),
    retryDelays: [10, 20],
  });

  assert.equal(archive.toString(), "verified archive");
  assert.equal(calls, 3);
  assert.deepEqual(delays, [10, 20]);
});

test("FFmpeg download does not retry permanent client errors", async () => {
  let calls = 0;
  await assert.rejects(
    download("https://example.invalid/missing.tar.xz", 0, "FFmpeg", {
      fetchImpl: async () => {
        calls += 1;
        return new Response("missing", { status: 404 });
      },
      sleep: async () => assert.fail("a permanent 404 must not be retried"),
    }),
    /FFmpeg download failed with HTTP 404/,
  );
  assert.equal(calls, 1);
});

test("FFmpeg GitHub API authorization is scoped to the pinned API asset endpoint", async () => {
  const requests = [];
  const archive = await download(
    "https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/assets/698334968",
    0,
    "FFmpeg",
    {
      githubToken: "workflow-token",
      headers: { Accept: "application/octet-stream", Authorization: "Bearer caller-token" },
      fetchImpl: async (url, options) => {
        requests.push({ url, headers: new Headers(options.headers) });
        if (requests.length === 1) {
          return new Response(null, {
            status: 302,
            headers: { Location: "https://release-assets.githubusercontent.com/signed/archive" },
          });
        }
        return new Response("verified archive", { status: 200 });
      },
    },
  );

  assert.equal(archive.toString(), "verified archive");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].headers.get("authorization"), "Bearer workflow-token");
  assert.equal(requests[1].headers.has("authorization"), false);
  assert.equal(requests[1].headers.get("accept"), "application/octet-stream");
});

test("FFmpeg downloader retries explicit GitHub rate-limit 403 and 429, not ordinary 403", async () => {
  for (const firstResponse of [
    new Response("API rate limit exceeded", { status: 403, headers: { "X-RateLimit-Remaining": "0" } }),
    new Response("secondary rate limit", { status: 403, headers: { "Retry-After": "1" } }),
    new Response("too many requests", { status: 429 }),
  ]) {
    let calls = 0;
    const delays = [];
    const archive = await download("https://api.github.com/example", 0, "FFmpeg", {
      fetchImpl: async () => {
        calls += 1;
        return calls === 1 ? firstResponse : new Response("verified archive", { status: 200 });
      },
      sleep: async (delayMs) => delays.push(delayMs),
      retryDelays: [10],
    });
    assert.equal(archive.toString(), "verified archive");
    assert.equal(calls, 2);
    assert.equal(delays.length, 1);
  }

  let ordinaryForbiddenCalls = 0;
  await assert.rejects(
    download("https://api.github.com/example", 0, "FFmpeg", {
      fetchImpl: async () => {
        ordinaryForbiddenCalls += 1;
        return new Response("Resource not accessible by integration", { status: 403 });
      },
      sleep: async () => assert.fail("an unrelated 403 must not be retried"),
    }),
    /FFmpeg download failed with HTTP 403/,
  );
  assert.equal(ordinaryForbiddenCalls, 1);
});

const propertyStore = (await readFile(
  new URL("../src/lib/properties.ts", import.meta.url),
  "utf8",
)).replace(/\r\n/g, "\n");
const packageManifest = await readFile(
  new URL("../package.json", import.meta.url),
  "utf8",
);

test("production prebuild avoids remote fallback image downloads", () => {
  const scripts = JSON.parse(packageManifest).scripts;
  assert.equal(scripts.prebuild, "node scripts/ensure-ffmpeg.mjs");
  assert.match(scripts["assets:fallback:refresh"], /generate-fallback-assets\.mjs/);
  assert.doesNotMatch(deployEnv, /generate-fallback-assets\.mjs/);
});

test("live property media smoke runs only after a successful main Liara deployment", () => {
  assert.ok(liveMediaWorkflow.includes("workflow_run:"));
  assert.ok(liveMediaWorkflow.includes("- Deploy to Liara"));
  assert.ok(liveMediaWorkflow.includes("github.event.workflow_run.conclusion == 'success'"));
  assert.ok(liveMediaWorkflow.includes("github.event.workflow_run.head_branch == 'main'"));
  assert.ok(liveMediaWorkflow.includes("ref: ${{ github.event.workflow_run.head_sha }}"));
  assert.ok(liveMediaWorkflow.includes("node scripts/live-property-media-smoke.mjs"));
  assert.ok(liveMediaSmoke.includes("hirmandrealestate.ir"));
  assert.ok(liveMediaSmoke.includes("data-property-link=\"true\""));
  assert.ok(liveMediaSmoke.includes("property-lightbox-media-wrap .property-media-watermark"));
  assert.ok(liveMediaSmoke.includes("isFallbackSource"));
});

test("Liara deploy provisions checksum-verified FFmpeg on the GitHub runner before upload", () => {
  const provisionStep = liaraDeployWorkflow.indexOf(
    "name: Provision checksum-verified FFmpeg runtime on GitHub runner",
  );
  const deployStep = liaraDeployWorkflow.indexOf("- name: Deploy", provisionStep);
  assert.ok(provisionStep >= 0 && deployStep > provisionStep);
  assert.match(liaraDeployWorkflow, /uses: actions\/setup-node@v4/);
  assert.match(liaraDeployWorkflow, /run: npm ci/);
  assert.match(liaraDeployWorkflow, /npm run prebuild/);
  assert.match(liaraDeployWorkflow, /test -x \.runtime\/ffmpeg\/ffmpeg/);
  assert.match(liaraDeployWorkflow, /test -x src\/\.runtime\/ffmpeg\/ffmpeg/);
  assert.match(liaraDeployWorkflow, /test -x src\/lib\/\.runtime\/ffmpeg\/ffmpeg/);
  assert.match(liaraDeployWorkflow, /timeout-minutes: 60/);
});

test("every CI, Verify, and Liara FFmpeg provisioning call site receives only the workflow token", () => {
  for (const [workflowName, workflow] of [
    ["CI", ciWorkflow],
    ["Verify", verifyWorkflow],
    ["Liara deploy", liaraDeployWorkflow],
  ]) {
    assert.match(workflow, /GITHUB_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}/, `${workflowName} must provide github.token`);
    assert.match(workflow, /permissions:\s*\n\s+contents:\s+read/, `${workflowName} must retain read-only repository permissions`);
  }
  assert.match(ciWorkflow, /name: Provision checksum-verified FFmpeg runtime\s+run: npm run prebuild\s+env:\s+GITHUB_TOKEN:/);
  assert.match(verifyWorkflow, /name: Provision checksum-verified FFmpeg runtime\s+run: npm run prebuild\s+env:\s+GITHUB_TOKEN:/);
  assert.match(ciWorkflow, /name: Production build\s+run: npm run build --ignore-scripts/);
  assert.match(verifyWorkflow, /name: Production build\s+run: npm run build --ignore-scripts/);
});

test("Liara upload context explicitly includes provisioned FFmpeg and watermark font files", () => {
  for (const directory of [".runtime", "src/.runtime", "src/lib/.runtime"]) {
    assert.ok(liaraIgnore.includes(`!${directory}/`), `${directory} parent must be re-included`);
    assert.ok(liaraIgnore.includes(`!${directory}/ffmpeg/**`), `${directory} FFmpeg files must be included`);
    assert.ok(liaraIgnore.includes(`!${directory}/fonts/**`), `${directory} font files must be included`);
  }
});
const ffmpegProvisioner = await readFile(
  new URL("./ensure-ffmpeg.mjs", import.meta.url),
  "utf8",
);
const bundledWatermarkFont = await readFile(
  new URL("../public/fonts/Vazirmatn-Regular.ttf", import.meta.url),
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

  const upsertClause = /\)\r?\n\s+on conflict \(id\) do update set/.exec(propertyStore.slice(valuesStart));
  assert.ok(upsertClause, "property INSERT should be followed by its upsert clause");
  const valuesEnd = valuesStart + upsertClause.index;

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
  assert.match(mediaProtocol, /where id = \$1 and kind = \$2\s+and left\(pathname, length\(\$3\)\) = \$3\s+and completion_result is not null/);
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

test("property photos are not permanently watermarked and receive a configurable lightbox overlay", () => {
  assert.match(uploadRoute, /if \(contentType\.startsWith\("image\/"\)\) return null/);
  assert.doesNotMatch(uploadRoute, /applyPropertyImageWatermarkServer/);
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
  assert.match(ffmpegDownloader, /const BUNDLED_FONT_PATH = join\(__dirname, "\.\.", "public", "fonts", "Vazirmatn-Regular\.ttf"\)/);
  assert.match(ffmpegDownloader, /verifyGitBlob\(buffer, FONT_GIT_BLOB_SHA1\)/);
  const fontGitBlob = createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${bundledWatermarkFont.length}\0`), bundledWatermarkFont]))
    .digest("hex");
  assert.equal(fontGitBlob, "64e4a8189557a17b63fd7a77794207483e592972", "the bundled Persian font must match the pinned upstream Git blob");
  assert.match(ffmpegDownloader, /const RELEASE_TAG = "autobuild-2026-11-01-12-49"/);
  assert.match(ffmpegDownloader, /ffmpeg-n9\.0\.2-42-gd7643a0fe3-linux64-gpl-9\.0\.tar\.xz/);

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

test("pending public property submissions do not permanently watermark photos and retain video watermarking", () => {
  assert.match(customerUploadRoute, /getPropertyWatermarkSettingsServer/);
  assert.match(customerUploadRoute, /if \(contentType\.startsWith\("image\/"\)\) return null/);
  assert.doesNotMatch(customerUploadRoute, /applyPropertyImageWatermarkServer/);
  assert.match(customerUploadRoute, /applyPropertyVideoWatermark/);
});

test("media start-rate quota is independent for each upload pathway", () => {
  assert.match(mediaProtocol, /media-upload:begin:\$\{config\.pathPrefix\}:\$\{clientFingerprint\(event\)\}/);
});

test("production prebuild provisions the checksum-verified FFmpeg binary used for watermarking", () => {
  assert.ok(packageManifest.includes('"prebuild": "node scripts/ensure-ffmpeg.mjs"'));
  assert.ok(ffmpegProvisioner.includes("ensureWatermarkFont()"));
});

test("object-store offload never deletes the database fallback before saving the Liara URL", () => {
  const persistDbPointer = mediaStore.indexOf("set completion_state = 'assembled', stored_url = $2", mediaStore.indexOf("// Commit a usable database URL"));
  const remoteUpload = mediaStore.indexOf("remoteUrl = await putLiaraObject", persistDbPointer);
  const persistRemotePointer = mediaStore.indexOf("remoteStored.url", remoteUpload);
  const deleteDbCopy = mediaStore.indexOf('delete from media_objects where id = $1', persistRemotePointer);
  assert.ok(persistDbPointer >= 0 && remoteUpload > persistDbPointer);
  assert.ok(persistRemotePointer > remoteUpload && deleteDbCopy > persistRemotePointer);
});

test("FFmpeg downloads use pinned GitHub release asset IDs and the octet-stream API", () => {
  assert.match(ffmpegProvisioner, /api\.github\.com\/repos\/BtbN\/FFmpeg-Builds\/releases\/assets\/\$\{asset\.assetId\}/);
  assert.match(ffmpegProvisioner, /Accept:\s*"application\/octet-stream"/);
  assert.match(ffmpegProvisioner, /assetId:\s*698334968/);
  assert.match(ffmpegProvisioner, /assetId:\s*698335088/);
  assert.match(ffmpegProvisioner, /sha256:\s*"11570b7bb1436ff432c91202ae0e7ea4be65359fd06650e18935c1ee9d005bf6"/);
  assert.match(ffmpegProvisioner, /sha256:\s*"b45eb0c42d311d12f3bddcd7b3a29a3e7fcc2455076d13c79552d45b48d57c08"/);
  assert.match(ffmpegProvisioner, /ffmpeg-n9\.0\.2-42-gd7643a0fe3-linux64-gpl-9\.0\.tar\.xz/);
  assert.match(ffmpegProvisioner, /FFmpeg lacks required media watermark capabilities/);
});

test("FFmpeg XZ archive extraction does not depend on host tar XZ support", async () => {
  const fixture = Buffer.from(
    "/Td6WFoAAATm1rRGAgAhARYAAAB0L+Wj4Cf/AHddADkZSdrpOaPtMnZApgrcMXHNVwb4wZoseqRlVlE+dTw86dpadDuBBpFq1Go1mB17+IiIi3xaD9ow1hS/VkEmYkMN1HOMD2MLvMf+f/gFR/qymiajCNa6gRQE87Yj5KxHcNiUYo8m51j9UUBL5g09iY4W8+/sM4wAAABiBvbkC1MGOAABkwGAUAAACwEi5LHEZ/sCAAAAAARZWg==",
    "base64",
  );
  const temporaryRoot = await mkdtemp(join(tmpdir(), "hirmand-ffmpeg-xz-"));
  const archivePath = join(temporaryRoot, "fixture.tar.xz");
  const extractDir = join(temporaryRoot, "extract");

  try {
    await mkdir(extractDir, { recursive: true });
    await writeFile(archivePath, fixture);
    await extractFfmpegArchive(archivePath, extractDir, "release");
    assert.equal(await readFile(join(extractDir, "ffmpeg"), "utf8"), "fixture-ffmpeg-binary");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
