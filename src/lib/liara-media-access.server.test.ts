import assert from "node:assert/strict";
import test from "node:test";
import {
  databaseMediaVisibility,
  createLiaraVideoResponse,
  liaraMediaCacheControl,
  shouldRateLimitPrivateMediaRequest,
} from "./liara-media-access.server.ts";

test("only unpublished private media requires the shared rate limiter", () => {
  assert.equal(databaseMediaVisibility("properties/uploads/gallery/photo.webp"), "property-upload");
  assert.equal(databaseMediaVisibility("properties/customer-submissions/photo.webp"), "customer-submission");
  assert.equal(shouldRateLimitPrivateMediaRequest("property-upload", false, true), false);
  assert.equal(shouldRateLimitPrivateMediaRequest("customer-submission", false, true), false);
  assert.equal(shouldRateLimitPrivateMediaRequest("property-upload", false, false), true);
  assert.equal(shouldRateLimitPrivateMediaRequest("customer-submission", false, false), true);
  assert.equal(shouldRateLimitPrivateMediaRequest("property-upload", true, false), false);
  assert.equal(shouldRateLimitPrivateMediaRequest("customer-submission", true, false), false);
  assert.equal(shouldRateLimitPrivateMediaRequest("public", false, false), false);
  assert.equal(shouldRateLimitPrivateMediaRequest("unknown", false, false), false);
});

test("private Liara media namespaces are never publicly cacheable", () => {
  assert.equal(
    liaraMediaCacheControl("properties/customer-submissions/private.jpg", true),
    "private, no-store",
  );
  assert.equal(
    liaraMediaCacheControl("properties/uploads/unpublished.jpg", false),
    "private, no-store",
  );
  assert.equal(
    liaraMediaCacheControl("properties/uploads/published.jpg", true),
    "public, max-age=300, s-maxage=300",
  );
});

test("Liara video response preserves range metadata and streams chunks without buffering", async () => {
  const upstream = new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2]));
      setTimeout(() => {
        controller.enqueue(new Uint8Array([3]));
        controller.close();
      }, 5);
    },
  }), {
    status: 206,
    headers: {
      "content-type": "video/mp4",
      "content-range": "bytes 0-2/3",
      "content-length": "3",
      "accept-ranges": "bytes",
      etag: '"video-etag"',
    },
  });

  const response = createLiaraVideoResponse(
    upstream,
    "properties/uploads/sample.mp4",
    "private, no-store",
    100,
  );
  assert.ok(response);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), "bytes 0-2/3");
  assert.equal(response.headers.get("accept-ranges"), "bytes");
  assert.equal(response.headers.get("etag"), '"video-etag"');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
});

test("a stalled Liara video body is cancelled instead of holding the response open indefinitely", async () => {
  let upstreamCancelled = false;
  const upstream = new Response(new ReadableStream<Uint8Array>({
    cancel() {
      upstreamCancelled = true;
    },
  }), {
    status: 200,
    headers: { "content-type": "video/mp4" },
  });

  const response = createLiaraVideoResponse(
    upstream,
    "properties/uploads/stalled.mp4",
    "private, no-store",
    5,
  );
  assert.ok(response?.body);
  const reader = response.body.getReader();
  await assert.rejects(reader.read(), /stalled/i);
  assert.equal(upstreamCancelled, true);
});

test("downstream video cancellation propagates to the Liara upstream", async () => {
  let upstreamCancelled = false;
  const upstream = new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array([1]));
    },
    cancel() {
      upstreamCancelled = true;
    },
  }), {
    status: 200,
    headers: { "content-type": "video/mp4" },
  });

  const response = createLiaraVideoResponse(
    upstream,
    "properties/uploads/cancelled.mp4",
    "private, no-store",
    100,
  );
  assert.ok(response?.body);
  const reader = response.body.getReader();
  await reader.read();
  await reader.cancel();
  assert.equal(upstreamCancelled, true);
});
