import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedMediaRef, isLiaraMediaProxyUrl, mediaSourceCandidates } from "./media.ts";

const fallback = "/images/type-apartment.jpg";
const privateLiaraImage =
  "https://storage.iran.liara.space/hirmand/properties/uploads/apartment-01.jpg";
const privateLiaraVideo =
  "https://storage.iran.liara.space/hirmand/properties/uploads/tour-01.mp4";

test("private Liara property images are routed through the same-origin media proxy", () => {
  assert.deepEqual(mediaSourceCandidates(privateLiaraImage, fallback), [
    "/api/liara-media?url=" + encodeURIComponent(privateLiaraImage),
    fallback,
  ]);
});

test("private Liara videos retain the video marker through the proxy", () => {
  assert.deepEqual(mediaSourceCandidates(privateLiaraVideo, fallback), [
    "/api/liara-media?url=" + encodeURIComponent(privateLiaraVideo) + "&type=video",
    fallback,
  ]);
});

test("database media URLs keep their existing same-origin route", () => {
  assert.deepEqual(mediaSourceCandidates("/api/media/2a3bf33e-ec55-4e2d-9ff2-3d962c1e7d11", fallback), [
    "/api/media/2a3bf33e-ec55-4e2d-9ff2-3d962c1e7d11",
    fallback,
  ]);
});

test("same-origin uploaded image and video references pass property form validation", () => {
  const databaseImage = "/api/media/2a3bf33e-ec55-4e2d-9ff2-3d962c1e7d11";
  const databaseVideo = databaseImage + "?type=video";
  const liaraImage = "/api/liara-media?url=" + encodeURIComponent(privateLiaraImage);
  const liaraVideo =
    "/api/liara-media?url=" + encodeURIComponent(privateLiaraVideo) + "&type=video";

  assert.equal(isAllowedMediaRef(databaseImage), true);
  assert.equal(isAllowedMediaRef(databaseVideo), true);
  assert.equal(isAllowedMediaRef(liaraImage), true);
  assert.equal(isAllowedMediaRef(liaraVideo), true);
});

test("validated Liara proxy URLs are accepted by property media validation", () => {
  const proxyUrl =
    "/api/liara-media?url=" + encodeURIComponent(privateLiaraImage);

  assert.equal(isLiaraMediaProxyUrl(proxyUrl), true);
  assert.equal(isAllowedMediaRef(proxyUrl), true);
});

test("Liara proxy validation rejects arbitrary or malformed targets", () => {
  assert.equal(
    isLiaraMediaProxyUrl("/api/liara-media?url=" + encodeURIComponent("https://evil.example/image.jpg")),
    false,
  );
  assert.equal(
    isAllowedMediaRef("/api/liara-media?url=" + encodeURIComponent("https://evil.example/image.jpg")),
    false,
  );
  assert.equal(isAllowedMediaRef("/api/liara-media"), false);
  assert.equal(
    isLiaraMediaProxyUrl(
      "/api/liara-media?url=" + encodeURIComponent(privateLiaraImage) + "&type=audio",
    ),
    false,
  );
});
