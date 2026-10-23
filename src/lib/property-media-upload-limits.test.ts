import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_PROPERTY_FLOOR_PLAN_BYTES,
  MAX_PROPERTY_GALLERY_IMAGE_BYTES,
  MAX_PROPERTY_GALLERY_VIDEO_BYTES,
  MAX_PROPERTY_MEDIA_IN_MEMORY_COMPLETION_BYTES,
} from "./property-media-upload-limits.ts";

test("property gallery images and videos allow up to 1 GiB each", () => {
  assert.equal(MAX_PROPERTY_GALLERY_IMAGE_BYTES, 1024 ** 3);
  assert.equal(MAX_PROPERTY_GALLERY_VIDEO_BYTES, 1024 ** 3);
});

test("floor plans retain their 15 MiB cap", () => {
  assert.equal(MAX_PROPERTY_FLOOR_PLAN_BYTES, 15 * 1024 * 1024);
});

test("large uploads switch to disk-backed completion before reaching 1 GiB", () => {
  assert.equal(MAX_PROPERTY_MEDIA_IN_MEMORY_COMPLETION_BYTES, 100 * 1024 * 1024);
  assert.ok(MAX_PROPERTY_MEDIA_IN_MEMORY_COMPLETION_BYTES < MAX_PROPERTY_GALLERY_IMAGE_BYTES);
  assert.ok(MAX_PROPERTY_MEDIA_IN_MEMORY_COMPLETION_BYTES < MAX_PROPERTY_GALLERY_VIDEO_BYTES);
});
