import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  isLiaraStorageHost,
  normalizeDivarImageUrl,
  mediaPreviewSource,
  mediaSourceCandidates,
  stripMediaUploadCapability,
  withMediaUploadCapability,
} from "./media.ts";
import {
  isAllowedLiaraMediaKey,
  fetchWithHeaderTimeout,
  liaraObjectKeyFromUrl,
} from "./liara-object-storage.server.ts";
import {
  hasCompletedCustomerUploadMedia,
  databaseMediaVisibility,
  hasRejectedCustomerSubmissionMedia,
  isPublishedPropertyMedia,
  createLiaraVideoResponse,
  liaraMediaCacheControl,
  shouldUseLegacyBlobFallback,
  withLiaraStreamIdleTimeout,
} from "./liara-media-access.server.ts";
import { exactMediaRangeBytes, parseMediaByteRange } from "./media-range-bytes.ts";
import {
  createRangeNotSatisfiableResponse,
  liaraRangeNotSatisfiableResponse,
} from "./music-range-response.ts";

test("Liara object URLs use the signed same-origin media proxy", () => {
  const source = "https://storage.c2.liara.space/hirmand/properties/uploads/gallery/home.webp";
  assert.equal(isLiaraStorageHost(source), true);
  assert.deepEqual(mediaSourceCandidates(source, "/images/type-apartment.jpg"), [
    "/api/media-proxy?url=" + encodeURIComponent(source),
    source,
  ]);
});

test("private Liara submission media never receives a direct bucket fallback", () => {
  const source = "https://storage.c2.liara.site/hirmand-realestate/properties/customer-submissions/photo.webp";
  assert.deepEqual(mediaSourceCandidates(source), [
    "/api/media-proxy?url=" + encodeURIComponent(source),
  ]);
  const capabilitySource = "https://storage.c2.liara.site/hirmand-realestate/properties/uploads/gallery/photo.webp#uploadId=9f4b0c2a-9d0a-4f8a-8b7e-4f2a1c6d8e90";
  assert.deepEqual(mediaSourceCandidates(capabilitySource), [
    "/api/media-proxy?url=" + encodeURIComponent(capabilitySource),
  ]);
});

test("only Liara storage hosts are classified for signed proxying", () => {
  assert.equal(isLiaraStorageHost("https://example.com/properties/home.webp"), false);
  assert.equal(isLiaraStorageHost("http://storage.c2.liara.space/bucket/image.webp"), false);
  assert.equal(isLiaraStorageHost("https://liara.space/image.webp"), true);
  assert.equal(isLiaraStorageHost("https://storage.c2.liara.site/hirmand-realestate/properties/home.webp"), true);
  assert.equal(isLiaraStorageHost("https://storage.c2.liara.site.evil.example/home.webp"), false);
});

test("Divar image normalization uses exact hosts, upgrades HTTP and rejects URL authority tricks", () => {
  assert.equal(
    normalizeDivarImageUrl("http://img.divarcdn.com/a/photo.jpg?width=800#legacy"),
    "https://img.divarcdn.com/a/photo.jpg?width=800",
  );
  assert.equal(normalizeDivarImageUrl("https://s100.divarcdn.com/a/photo.webp?x=1"), "https://s100.divarcdn.com/a/photo.webp?x=1");
  assert.equal(normalizeDivarImageUrl("http://divar.ir/images/sample.jpg"), "https://divar.ir/images/sample.jpg");
  for (const value of [
    "http://evil.divarcdn.com/a.jpg",
    "https://img.divarcdn.com.evil.example/a.jpg",
    "https://user:pass@img.divarcdn.com/a.jpg",
    "https://img.divarcdn.com:8443/a.jpg",
    "ftp://img.divarcdn.com/a.jpg",
    "not a url",
  ]) {
    assert.equal(normalizeDivarImageUrl(value), null, value);
  }
});

test("non-Liara, non-Divar media keeps its original source first", () => {
  const source = "https://cdn.example.com/properties/home.webp";
  assert.deepEqual(mediaSourceCandidates(source, "/images/type-apartment.jpg"), [source]);
});

test("private Liara image previews use the proxy and carry owner capability only when supplied", () => {
  const image = "https://storage.c2.liara.site/hirmand-realestate/properties/customer-submissions/photo.webp";
  const proxy = "/api/media-proxy?url=" + encodeURIComponent(image);
  assert.equal(mediaPreviewSource(image), proxy);
  assert.equal(mediaPreviewSource(image, "HIR-26-ABCDEF123456"), proxy + "&trackingToken=HIR-26-ABCDEF123456");
  const video = "https://storage.c2.liara.site/hirmand-realestate/properties/customer-submissions/clip.mp4?type=video";
  assert.equal(
    mediaPreviewSource(video, "HIR-26-ABCDEF123456"),
    "/api/media-proxy?url=" + encodeURIComponent(video) + "&trackingToken=HIR-26-ABCDEF123456",
  );
  const publicImage = "https://storage.c2.liara.site/hirmand-realestate/properties/uploads/published.webp";
  assert.equal(
    mediaPreviewSource(publicImage, "HIR-26-ABCDEF123456"),
    "/api/media-proxy?url=" + encodeURIComponent(publicImage),
  );
  const divarImage = "https://s100.divarcdn.com/static/photo/2026/11/07/example.jpg";
  assert.equal(
    mediaPreviewSource(divarImage, "HIR-26-ABCDEF123456"),
    "/api/media-proxy?url=" + encodeURIComponent(divarImage),
  );
});

test("customer upload previews carry the full upload session capability and remove it from the storage URL", () => {
  const uploadId = "9f4b0c2a-9d0a-4f8a-8b7e-4f2a1c6d8e90";
  const image = "https://storage.c2.liara.site/hirmand-realestate/properties/customer-submissions/photo.webp";
  const privateImage = withMediaUploadCapability(image, uploadId);
  assert.match(privateImage, /#uploadId=9f4b0c2a-9d0a-4f8a-8b7e-4f2a1c6d8e90$/);
  assert.equal(stripMediaUploadCapability(privateImage), image);

  const preview = new URL(mediaPreviewSource(privateImage), "https://hirmandrealestate.ir");
  assert.equal(preview.searchParams.get("uploadId"), uploadId);
  assert.equal(preview.searchParams.get("url"), image);
  assert.equal(preview.searchParams.has("trackingToken"), false);

  const ownerPreview = new URL(mediaPreviewSource(privateImage, "HIR-26-ABCDEF123456"), "https://hirmandrealestate.ir");
  assert.equal(ownerPreview.searchParams.get("uploadId"), uploadId);
  assert.equal(ownerPreview.searchParams.get("trackingToken"), "HIR-26-ABCDEF123456");
  assert.equal(withMediaUploadCapability(image, "invalid-upload-id"), image);

  const databaseUrl = "/api/media/db-fallback-id";
  const privateDatabaseUrl = withMediaUploadCapability(databaseUrl, uploadId);
  assert.equal(privateDatabaseUrl, databaseUrl + "#uploadId=" + uploadId);
  assert.equal(stripMediaUploadCapability(privateDatabaseUrl), databaseUrl);
  const databasePreview = new URL(
    mediaPreviewSource(privateDatabaseUrl, "HIR-26-ABCDEF123456"),
    "https://hirmandrealestate.ir",
  );
  assert.equal(databasePreview.pathname, databaseUrl);
  assert.equal(databasePreview.searchParams.get("uploadId"), uploadId);
  assert.equal(databasePreview.searchParams.get("trackingToken"), "HIR-26-ABCDEF123456");
});

test("database media visibility keeps known public producers and hides unknown namespaces", () => {
  assert.equal(databaseMediaVisibility("properties/customer-submissions/photo.webp"), "customer-submission");
  assert.equal(databaseMediaVisibility("properties/uploads/photo.webp"), "property-upload");
  assert.equal(databaseMediaVisibility("properties/divar/photo.webp"), "public");
  assert.equal(databaseMediaVisibility("areas/uploads/photo.webp"), "public");
  assert.equal(databaseMediaVisibility("music/track.mp3"), "public");
  assert.equal(databaseMediaVisibility("admin-deal-documents/private.pdf"), "unknown");
});

test("legacy public Blob fallback is disabled for private property media even when configured", () => {
  const keys = ["BLOB_READ_WRITE_TOKEN", "LIARA_ENDPOINT", "LIARA_BUCKET_NAME", "LIARA_ACCESS_KEY", "LIARA_SECRET_KEY"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.BLOB_READ_WRITE_TOKEN = "legacy-blob-test-token";
  for (const key of keys.slice(1)) delete process.env[key];
  try {
    const blobAvailable = Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
    assert.equal(blobAvailable, true);
    assert.equal(shouldUseLegacyBlobFallback("properties/customer-submissions/photo.webp", blobAvailable), false);
    assert.equal(shouldUseLegacyBlobFallback("properties/uploads/draft.webp", blobAvailable), false);
    assert.equal(shouldUseLegacyBlobFallback("private-deal-documents/contract.pdf", blobAvailable), false);
    assert.equal(shouldUseLegacyBlobFallback("music/track.mp3", blobAvailable), true);
    assert.equal(shouldUseLegacyBlobFallback("areas/uploads/area.webp", blobAvailable), true);
    assert.equal(shouldUseLegacyBlobFallback("properties/divar/photo.webp", blobAvailable), true);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("media cache policy keeps private uploads uncached and bounds revocable published media to five minutes", () => {
  assert.equal(liaraMediaCacheControl("properties/customer-submissions/photo.webp", true), "private, no-store");
  assert.equal(liaraMediaCacheControl("properties/uploads/photo.webp", false), "private, no-store");
  assert.equal(liaraMediaCacheControl("properties/uploads/photo.webp", true), "public, max-age=300, s-maxage=300");
  assert.equal(liaraMediaCacheControl("music/track.mp3", false), "public, max-age=31536000, immutable");
  assert.equal(liaraMediaCacheControl("areas/uploads/area.webp", false), "public, max-age=31536000, immutable");
  assert.equal(liaraMediaCacheControl("properties/divar/photo.webp", false), "public, max-age=31536000, immutable");
});

test("Liara fetch timeout ends at response headers so long media streams are not aborted", async () => {
  const signals: AbortSignal[] = [];
  const response = await fetchWithHeaderTimeout(
    async (_url, init) => {
      if (init?.signal) signals.push(init.signal);
      return new Response("streaming media");
    },
    new URL("https://storage.example/video.mp4"),
    {},
    5,
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(signals[0]?.aborted, false);
  assert.equal(await response.text(), "streaming media");
});

test("Liara fetch timeout still aborts requests that never receive response headers", async () => {
  const signals: AbortSignal[] = [];
  const fetcher = (_url: URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      if (init?.signal) {
        signals.push(init.signal);
        init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }
    });
  await assert.rejects(
    fetchWithHeaderTimeout(fetcher as typeof fetch, new URL("https://storage.example/video.mp4"), {}, 5),
    /aborted/,
  );
  assert.equal(signals[0]?.aborted, true);
});

test("Liara media streams may run longer than the idle timeout while bytes keep arriving", async () => {
  const encoder = new TextEncoder();
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      setTimeout(() => controller.enqueue(encoder.encode("one")), 0);
      setTimeout(() => controller.enqueue(encoder.encode("two")), 10);
      setTimeout(() => controller.enqueue(encoder.encode("three")), 20);
      setTimeout(() => controller.close(), 30);
    },
  });

  const response = createLiaraVideoResponse(
    new Response(source, { headers: { "content-type": "video/mp4" } }),
    "properties/uploads/published/clip.mp4",
    "private, no-store",
    15,
  );
  assert.ok(response);
  assert.equal(await response.text(), "onetwothree");
});

test("Liara media stream idle timeout cancels the upstream body", async () => {
  let upstreamCancelled = false;
  const source = new ReadableStream<Uint8Array>({
    cancel() {
      upstreamCancelled = true;
    },
  });

  const stream = withLiaraStreamIdleTimeout(source, 10);
  assert.ok(stream);
  await assert.rejects(new Response(stream).text(), /Upstream Liara media stream stalled/);
  assert.equal(upstreamCancelled, true);
});

test("downstream cancellation is propagated to the Liara response body", async () => {
  let cancelReason: unknown;
  const source = new ReadableStream<Uint8Array>({
    cancel(reason) {
      cancelReason = reason;
    },
  });
  const stream = withLiaraStreamIdleTimeout(source, 1_000);
  assert.ok(stream);
  await stream.cancel("client disconnected");
  assert.equal(cancelReason, "client disconnected");
});

test("stored media ranges reject incomplete database byte slices", () => {
  assert.deepEqual(exactMediaRangeBytes(new Uint8Array([1, 2, 3]), 3), new Uint8Array([1, 2, 3]));
  assert.equal(exactMediaRangeBytes(new Uint8Array([1, 2]), 3), null);
  assert.equal(exactMediaRangeBytes(undefined, 3), null);
  assert.equal(exactMediaRangeBytes(new Uint8Array(), Number.NaN), null);

  const mediaStore = readFileSync("src/lib/media-store.server.ts", "utf8");
  assert.match(mediaStore, /exactMediaRangeBytes\(rows\[0\]\?\.data,\s*length\)/);
  assert.match(mediaStore, /throw new IncompleteMediaRangeError\(\)/);

  const mediaRoute = readFileSync("server/routes/api/media/[id].get.ts", "utf8");
  assert.match(
    mediaRoute,
    /catch \(error\)[\s\S]*?error instanceof IncompleteMediaRangeError[\s\S]*?statusCode: 404[\s\S]*?throw error/,
  );
});

test("database media ranges reject suffix requests against empty objects", () => {
  assert.equal(parseMediaByteRange("bytes=-1", 0), "unsatisfiable");
  assert.equal(parseMediaByteRange("bytes=-500", 0), "unsatisfiable");
  assert.equal(parseMediaByteRange("bytes=0-0", 0), "unsatisfiable");
  assert.deepEqual(parseMediaByteRange("bytes=-2", 5), { start: 3, end: 4 });
  assert.deepEqual(parseMediaByteRange("bytes=1-", 5), { start: 1, end: 4 });
});

test("Liara video and audio routes apply the shared upstream idle timeout", () => {
  const mediaProxy = readFileSync("server/routes/api/media-proxy.get.ts", "utf8");
  const musicRoute = readFileSync("server/routes/api/music/file/[id].get.ts", "utf8");
  assert.match(
    mediaProxy,
    /const videoResponse = createLiaraVideoResponse\(\s*response,\s*liaraKey,\s*cacheControl,\s*LIARA_MEDIA_STREAM_IDLE_TIMEOUT_MS,\s*\)/,
  );
  assert.match(
    musicRoute,
    /new Response\(\s*withLiaraStreamIdleTimeout\(upstream\.body,\s*LIARA_MEDIA_STREAM_IDLE_TIMEOUT_MS\)/,
  );
});


test("legacy .liara.site property URLs resolve to the configured bucket key", () => {
  const keys = ["LIARA_ENDPOINT", "LIARA_BUCKET_NAME", "LIARA_ACCESS_KEY", "LIARA_SECRET_KEY"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.LIARA_ENDPOINT = "https://storage.c2.liara.space";
  process.env.LIARA_BUCKET_NAME = "hirmand-realestate";
  process.env.LIARA_ACCESS_KEY = "test-access-key";
  process.env.LIARA_SECRET_KEY = "test-secret-key";
  try {
    assert.equal(
      liaraObjectKeyFromUrl("https://storage.c2.liara.site/hirmand-realestate/properties/uploads/gallery/photo.webp"),
      "properties/uploads/gallery/photo.webp",
    );
    assert.equal(
      liaraObjectKeyFromUrl("https://storage.c2.liara.site/another-bucket/photo.webp"),
      null,
    );
    assert.equal(
      liaraObjectKeyFromUrl("https://storage.c2.liara.site.evil.example/hirmand-realestate/photo.webp"),
      null,
    );
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("Liara object URLs reject encoded path separators and bucket traversal", () => {
  const keys = ["LIARA_ENDPOINT", "LIARA_BUCKET_NAME", "LIARA_ACCESS_KEY", "LIARA_SECRET_KEY"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.LIARA_ENDPOINT = "https://storage.c2.liara.space";
  process.env.LIARA_BUCKET_NAME = "hirmand-realestate";
  process.env.LIARA_ACCESS_KEY = "test-access-key";
  process.env.LIARA_SECRET_KEY = "test-secret-key";
  try {
    const maliciousSegments = [
      "%2e%2e%2fother-bucket%2fsecret.webp",
      "..%2fother-bucket%2fsecret.webp",
      "%2fother-bucket%2fsecret.webp",
      "%5c..%5cother-bucket%5csecret.webp",
    ];

    for (const segment of maliciousSegments) {
      assert.equal(
        liaraObjectKeyFromUrl(
          `https://storage.c2.liara.site/hirmand-realestate/${segment}`,
        ),
        null,
        `expected encoded traversal to be rejected: ${segment}`,
      );
    }

    assert.equal(
      liaraObjectKeyFromUrl(
        "https://storage.c2.liara.site/hirmand-realestate/properties/uploads/gallery/photo.webp",
      ),
      "properties/uploads/gallery/photo.webp",
      "valid nested object keys must remain supported",
    );
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});


test("legacy stored Liara proxy paths are normalized to the current same-origin route", () => {
  const target = "https://storage.c2.liara.site/hirmand-realestate/properties/uploads/legacy.webp";
  const expected = ["/api/media-proxy?url=" + encodeURIComponent(target)];
  assert.deepEqual(
    mediaSourceCandidates("/api/liara-media?url=" + encodeURIComponent(target), "/images/type-apartment.jpg"),
    expected,
  );
  assert.deepEqual(
    mediaSourceCandidates("/api/media-proxy?url=" + encodeURIComponent(target), "/images/type-apartment.jpg"),
    expected,
  );
  for (const origin of ["https://hirmandrealestate.ir", "https://www.hirmandrealestate.ir"]) {
    assert.deepEqual(
      mediaSourceCandidates(origin + "/api/liara-media?url=" + encodeURIComponent(target), "/images/type-apartment.jpg"),
      expected,
    );
    assert.deepEqual(
      mediaSourceCandidates(origin + "/api/media-proxy?url=" + encodeURIComponent(target), "/images/type-apartment.jpg"),
      expected,
    );
  }
  const hostile = "https://evil.example/api/liara-media?url=" + encodeURIComponent(target);
  assert.deepEqual(
    mediaSourceCandidates(hostile, "/images/type-apartment.jpg"),
    [hostile],
  );
  const invalidTarget = "/api/liara-media?url=" + encodeURIComponent("https://evil.example/photo.webp");
  assert.deepEqual(
    mediaSourceCandidates(invalidTarget, "/images/type-apartment.jpg"),
    [invalidTarget],
  );
});

test("legacy Divar proxy targets are normalized only for exact approved image hosts", () => {
  const legacy = "http://img.divarcdn.com/photo.jpg?width=800";
  const secure = "https://img.divarcdn.com/photo.jpg?width=800";
  assert.deepEqual(mediaSourceCandidates("/api/media-proxy?url=" + encodeURIComponent(legacy)), [
    "/api/media-proxy?url=" + encodeURIComponent(secure),
  ]);
  const unapproved = "http://evil.divarcdn.com/photo.jpg";
  const stored = "/api/media-proxy?url=" + encodeURIComponent(unapproved);
  assert.deepEqual(mediaSourceCandidates(stored), [stored]);
});

test("public Liara media keys are limited to intentional site media prefixes", () => {
  for (const key of [
    "properties/uploads/gallery/home.webp",
    "properties/divar/imported/photo.webp",
    "properties/customer-submissions/owner/photo.webp",
    "areas/uploads/neighborhood/cover.webp",
  ]) {
    assert.equal(isAllowedLiaraMediaKey(key), true, key);
  }

  for (const key of [
    "music/track.mp3",
    "admin-deal-documents/private.pdf",
    "properties/uploads/../admin/private.webp",
    "properties/uploads//empty-segment.webp",
    "properties/uploads\\private.webp",
    "properties/uploads/",
  ]) {
    assert.equal(isAllowedLiaraMediaKey(key), false, key);
  }
});

test("published property references are the only public path for private property uploads", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table properties (
        id text primary key,
        images jsonb not null default '[]'::jsonb,
        floor_plan_url text,
        virtual_tour_url text,
        status text not null,
        deleted_at timestamptz,
        publish_at timestamptz,
        unpublish_at timestamptz
      );
    `);
    const publishedUrl = "https://storage.c2.liara.site/hirmand-realestate/properties/uploads/published.webp";
    const draftUrl = "https://storage.c2.liara.site/hirmand-realestate/properties/uploads/draft.webp";
    const deletedUrl = "https://storage.c2.liara.site/hirmand-realestate/properties/uploads/deleted.webp";
    const floorPlanUrl = "https://storage.c2.liara.site/hirmand-realestate/properties/uploads/floor-plan.webp";
    const virtualTourUrl = "https://storage.c2.liara.site/hirmand-realestate/properties/uploads/tour.mp4?type=video";
    const legacyUrl = "https://storage.c2.liara.site/hirmand-realestate/properties/uploads/legacy.webp";
    await db.query(
      "insert into properties (id, images, status) values ($1, $2::jsonb, 'published')",
      ["published", JSON.stringify([publishedUrl])],
    );
    await db.query(
      "insert into properties (id, images, status) values ($1, $2::jsonb, 'draft')",
      ["draft", JSON.stringify([draftUrl])],
    );
    await db.query(
      "insert into properties (id, images, status, deleted_at) values ($1, $2::jsonb, 'published', current_timestamp)",
      ["deleted", JSON.stringify([deletedUrl])],
    );
    await db.query(
      "insert into properties (id, floor_plan_url, status) values ($1, $2, 'published')",
      ["floor-plan", floorPlanUrl],
    );
    await db.query(
      "insert into properties (id, virtual_tour_url, status) values ($1, $2, 'published')",
      ["virtual-tour", virtualTourUrl],
    );
    await db.query(
      "insert into properties (id, images, status) values ($1, $2::jsonb, 'published')",
      ["legacy", JSON.stringify(["/api/liara-media?url=" + encodeURIComponent(legacyUrl)])],
    );
    await db.query(
      "insert into properties (id, images, status) values ($1, $2::jsonb, 'published')",
      ["database-media", JSON.stringify(["/api/media/db-published-id"])],
    );
    await db.query(
      "insert into properties (id, images, status) values ($1, $2::jsonb, 'published')",
      ["database-video", JSON.stringify(["/api/media/db-published-video-id?type=video"])],
    );
    const sql = {
      query: async <T>(statement: string, parameters?: unknown[]) =>
        (await db.query(statement, parameters as never)).rows as T[],
    };

    assert.equal(await isPublishedPropertyMedia(sql, publishedUrl), true);
    assert.equal(await isPublishedPropertyMedia(sql, draftUrl), false);
    assert.equal(await isPublishedPropertyMedia(sql, deletedUrl), false);
    assert.equal(await isPublishedPropertyMedia(sql, floorPlanUrl), true);
    assert.equal(await isPublishedPropertyMedia(sql, virtualTourUrl), true);
    assert.equal(await isPublishedPropertyMedia(sql, legacyUrl), true);
    assert.equal(await isPublishedPropertyMedia(sql, "/api/media/db-published-id"), true);
    assert.equal(await isPublishedPropertyMedia(sql, "/api/media/db-published-video-id?type=video"), true);
  } finally {
    await db.close();
  }
});

test("customer-submission media requires the exact rejected tracking capability or a recent completed upload", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table customer_property_submissions (
        public_tracking_token text not null,
        status text not null,
        property_data jsonb not null
      );
      create table media_upload_sessions (
        id text primary key,
        pathname text not null,
        kind text not null,
        stored_url text,
        stored_storage text,
        completion_state text,
        completion_result jsonb,
        created_at timestamptz not null default current_timestamp
      );
    `);
    const rejectedUrl = "https://storage.c2.liara.site/hirmand-realestate/properties/customer-submissions/rejected/photo.webp";
    const rejectedStoredUrl = rejectedUrl + "#uploadId=9f4b0c2a-9d0a-4f8a-8b7e-4f2a1c6d8e92";
    const pendingUrl = "https://storage.c2.liara.site/hirmand-realestate/properties/customer-submissions/pending/photo.webp";
    const uploadedUrl = "https://storage.c2.liara.site/hirmand-realestate/properties/customer-submissions/new/photo.webp";
    const uploadedVideoUrl = "https://storage.c2.liara.site/hirmand-realestate/properties/customer-submissions/new/clip.mp4?type=video";
    const key = "properties/customer-submissions/new/photo.webp";
    const videoKey = "properties/customer-submissions/new/clip.mp4";
    const token = "HIR-26-ABCDEF123456";
    const newToken = "HIR-26-0123456789ABCDEF0123456789ABCDEF";
    await db.query(
      "insert into customer_property_submissions values ($1, 'rejected', $2::jsonb)",
      [token, JSON.stringify({ images: [rejectedStoredUrl] })],
    );
    await db.query(
      "insert into customer_property_submissions values ($1, 'rejected', $2::jsonb)",
      [newToken, JSON.stringify({ images: [rejectedUrl] })],
    );
    await db.query(
      "insert into customer_property_submissions values ($1, 'pending', $2::jsonb)",
      ["HIR-26-123456ABCDEF", JSON.stringify({ images: [pendingUrl] })],
    );
    await db.query(
      "insert into customer_property_submissions values ($1, 'rejected', $2::jsonb)",
      ["HIR-26-987654ABCDEF", JSON.stringify({ images: ["/api/media/db-rejected-id#uploadId=9f4b0c2a-9d0a-4f8a-8b7e-4f2a1c6d8e95"] })],
    );
    await db.query(
      "insert into customer_property_submissions values ($1, 'rejected', $2::jsonb)",
      ["HIR-26-987654ABCDE0", JSON.stringify({ images: ["/api/media/db-rejected-video-id?type=video#uploadId=9f4b0c2a-9d0a-4f8a-8b7e-4f2a1c6d8e96"] })],
    );
    await db.query(
      `insert into media_upload_sessions
       (id, pathname, kind, stored_url, stored_storage, completion_state, completion_result)
       values ('9f4b0c2a-9d0a-4f8a-8b7e-4f2a1c6d8e90', $1, 'customer-property-media', $2, 'object-store', 'assembled', $3::jsonb)`,
      [key, uploadedUrl, JSON.stringify({ url: uploadedUrl })],
    );
    await db.query(
      `insert into media_upload_sessions
       (id, pathname, kind, stored_url, stored_storage, completion_state, completion_result)
       values ('9f4b0c2a-9d0a-4f8a-8b7e-4f2a1c6d8e91', $1, 'customer-property-media', $2, 'object-store', 'assembled', $3::jsonb)`,
      [videoKey, uploadedVideoUrl.replace("?type=video", ""), JSON.stringify({ url: uploadedVideoUrl })],
    );
    await db.query(
      `insert into media_upload_sessions
       (id, pathname, kind, stored_url, stored_storage, completion_state, completion_result)
       values ('9f4b0c2a-9d0a-4f8a-8b7e-4f2a1c6d8e94', $1, 'customer-property-media', $2, 'database', 'assembled', $3::jsonb)`,
      ["properties/customer-submissions/db-fallback/photo.webp", "/api/media/db-fallback-id", JSON.stringify({ url: "/api/media/db-fallback-id" })],
    );
    await db.query(
      `insert into media_upload_sessions
       (id, pathname, kind, stored_url, stored_storage, completion_state, completion_result)
       values ('9f4b0c2a-9d0a-4f8a-8b7e-4f2a1c6d8e97', $1, 'customer-property-media', $2, 'database', 'assembled', $3::jsonb)`,
      ["properties/customer-submissions/db-fallback/clip.mp4", "/api/media/db-fallback-video-id", JSON.stringify({ url: "/api/media/db-fallback-video-id?type=video" })],
    );
    await db.query(
      `insert into media_upload_sessions
       (id, pathname, kind, stored_url, stored_storage, completion_state, completion_result, created_at)
       values ('9f4b0c2a-9d0a-4f8a-8b7e-4f2a1c6d8e93', $1, 'customer-property-media', $2, 'object-store', 'assembled', $3::jsonb, current_timestamp - interval '3 hours')`,
      ["properties/customer-submissions/stale/photo.webp", uploadedUrl, JSON.stringify({ url: uploadedUrl })],
    );
    const sql = {
      query: async <T>(statement: string, parameters?: unknown[]) =>
        (await db.query(statement, parameters as never)).rows as T[],
    };

    assert.equal(await hasRejectedCustomerSubmissionMedia(sql, token, rejectedUrl), true);
    assert.equal(await hasRejectedCustomerSubmissionMedia(sql, newToken, rejectedUrl), true);
    assert.equal(await hasRejectedCustomerSubmissionMedia(sql, token, pendingUrl), false);
    assert.equal(await hasRejectedCustomerSubmissionMedia(sql, "HIR-26-000000000000", rejectedUrl), false);
    assert.equal(await hasRejectedCustomerSubmissionMedia(sql, "HIR-26-987654ABCDEF", "/api/media/db-rejected-id"), true);
    assert.equal(await hasRejectedCustomerSubmissionMedia(sql, "HIR-26-987654ABCDE0", "/api/media/db-rejected-video-id?type=video"), true);
    assert.equal(await hasCompletedCustomerUploadMedia(sql, key, uploadedUrl, "9f4b0c2a-9d0a-4f8a-8b7e-4f2a1c6d8e90"), true);
    assert.equal(await hasCompletedCustomerUploadMedia(sql, videoKey, uploadedVideoUrl, "9f4b0c2a-9d0a-4f8a-8b7e-4f2a1c6d8e91"), true);
    assert.equal(await hasCompletedCustomerUploadMedia(sql, "properties/customer-submissions/db-fallback/photo.webp", "/api/media/db-fallback-id", "9f4b0c2a-9d0a-4f8a-8b7e-4f2a1c6d8e94"), true);
    assert.equal(await hasCompletedCustomerUploadMedia(sql, "properties/customer-submissions/db-fallback/photo.webp", "/api/media/db-fallback-id", "9f4b0c2a-9d0a-4f8a-8b7e-4f2a1c6d8e90"), false);
    assert.equal(await hasCompletedCustomerUploadMedia(sql, "properties/customer-submissions/db-fallback/clip.mp4", "/api/media/db-fallback-video-id?type=video", "9f4b0c2a-9d0a-4f8a-8b7e-4f2a1c6d8e97"), true);
    assert.equal(await hasCompletedCustomerUploadMedia(sql, "properties/customer-submissions/db-fallback/clip.mp4", "/api/media/db-fallback-video-id?type=video", ""), false);
    assert.equal(await hasCompletedCustomerUploadMedia(sql, key, uploadedUrl, ""), false);
    assert.equal(await hasCompletedCustomerUploadMedia(sql, key, uploadedUrl, "9f4b0c2a-9d0a-4f8a-8b7e-4f2a1c6d8e91"), false);
    assert.equal(await hasCompletedCustomerUploadMedia(sql, key + "/other", uploadedUrl, "9f4b0c2a-9d0a-4f8a-8b7e-4f2a1c6d8e90"), false);
    assert.equal(await hasCompletedCustomerUploadMedia(sql, key, uploadedUrl + "&other=1", "9f4b0c2a-9d0a-4f8a-8b7e-4f2a1c6d8e90"), false);
    assert.equal(await hasCompletedCustomerUploadMedia(sql, "properties/customer-submissions/stale/photo.webp", uploadedUrl, "9f4b0c2a-9d0a-4f8a-8b7e-4f2a1c6d8e93"), false);
  } finally {
    await db.close();
  }
});

test("Liara media access helpers fail closed when database queries fail", async () => {
  const failingSql = {
    query: async () => {
      throw new Error("database unavailable");
    },
  };
  assert.equal(
    await isPublishedPropertyMedia(failingSql, "https://storage.c2.liara.site/hirmand-realestate/properties/uploads/draft.webp"),
    false,
  );
  assert.equal(
    await hasRejectedCustomerSubmissionMedia(failingSql, "HIR-26-ABCDEF123456", "https://storage.c2.liara.site/hirmand-realestate/properties/customer-submissions/rejected.webp"),
    false,
  );
  assert.equal(
    await hasCompletedCustomerUploadMedia(
      failingSql,
      "properties/customer-submissions/photo.webp",
      "https://storage.c2.liara.site/hirmand-realestate/properties/customer-submissions/photo.webp",
      "9f4b0c2a-9d0a-4f8a-8b7e-4f2a1c6d8e90",
    ),
    false,
  );
});

test("Liara video proxy preserves 206 range metadata and returns uncached 416 responses", () => {
  const partial = createLiaraVideoResponse(
    new Response("abc", {
      status: 206,
      headers: {
        "content-type": "video/mp4",
        "content-length": "3",
        "content-range": "bytes 0-2/10",
        "accept-ranges": "bytes",
      },
    }),
    "properties/uploads/published/clip.mp4",
    "public, max-age=86400",
  );
  assert.ok(partial);
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("content-type"), "video/mp4");
  assert.equal(partial.headers.get("content-range"), "bytes 0-2/10");
  assert.equal(partial.headers.get("content-length"), "3");
  assert.equal(partial.headers.get("accept-ranges"), "bytes");
  assert.equal(partial.headers.get("cache-control"), "public, max-age=86400");
  assert.equal(partial.headers.get("vary"), "Range");
  assert.equal(partial.headers.get("cross-origin-resource-policy"), "same-origin");

  const unsatisfied = createLiaraVideoResponse(
    new Response(null, {
      status: 416,
      headers: { "content-range": "bytes */10", "accept-ranges": "bytes" },
    }),
    "properties/customer-submissions/private/clip.mp4",
    "private, no-store",
  );
  assert.ok(unsatisfied);
  assert.equal(unsatisfied.status, 416);
  assert.equal(unsatisfied.headers.get("content-range"), "bytes */10");
  assert.equal(unsatisfied.headers.get("cache-control"), "no-store");
  assert.equal(unsatisfied.headers.get("cross-origin-resource-policy"), "same-origin");

  assert.equal(
    createLiaraVideoResponse(
      new Response("not a video", { status: 200, headers: { "content-type": "text/html" } }),
      "properties/uploads/published/clip.mp4",
      "public, max-age=86400",
    ),
    null,
  );
});

test("Liara music 416 responses preserve Content-Range and bypass shared caches", () => {
  const response = liaraRangeNotSatisfiableResponse(
    new Response(null, {
      status: 416,
      headers: {
        "accept-ranges": "bytes",
        "content-range": "bytes */12345",
      },
    }),
  );

  assert.ok(response);
  assert.equal(response.status, 416);
  assert.equal(response.headers.get("accept-ranges"), "bytes");
  assert.equal(response.headers.get("content-range"), "bytes */12345");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("content-disposition"), "inline");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(
    liaraRangeNotSatisfiableResponse(new Response(null, { status: 404 })),
    null,
  );
});

test("unpublished customer media and draft property uploads are never cached publicly", () => {
  assert.equal(liaraMediaCacheControl("properties/customer-submissions/photo.webp", true), "private, no-store");
  assert.equal(liaraMediaCacheControl("properties/uploads/draft/photo.webp", false), "private, no-store");
  assert.match(liaraMediaCacheControl("properties/uploads/published/photo.webp", true), /^public,/);
  assert.match(liaraMediaCacheControl("properties/divar/photo.webp", false), /^public,/);
});

test("database media 416 responses return Content-Range directly instead of throwing", () => {
  const response = createRangeNotSatisfiableResponse("bytes */6201453");
  assert.equal(response.status, 416);
  assert.equal(response.headers.get("content-range"), "bytes */6201453");
  assert.equal(response.headers.get("accept-ranges"), "bytes");
  assert.equal(response.headers.get("cache-control"), "no-store");
});
