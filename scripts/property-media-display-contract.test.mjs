import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("public property watermark is mounted only in the image lightbox", async () => {
  const detail = await read("src/components/hirmand/property-detail-view.tsx");
  const showcase = await read("src/components/hirmand/property-showcase.tsx");
  const adminMedia = await read("src/components/hirmand/admin-media-field.tsx");
  assert.equal((detail.match(/<PropertyMediaWatermark\s*\/>/g) ?? []).length, 1);
  assert.match(detail, /isVideoUrl\(current\)\s*\?/);
  assert.match(detail, /!isPermanentlyWatermarkedMediaUrl\(current\)/);
  assert.match(detail, /className="property-lightbox-media-wrap"[\s\S]*?<PropertyMediaWatermark\s*\/>/);
  assert.doesNotMatch(showcase, /PropertyMediaWatermark/);
  assert.doesNotMatch(adminMedia, /PropertyMediaWatermark/);
});

test("new property image uploads skip permanent watermark processing", async () => {
  const upload = await read("server/routes/api/upload.post.ts");
  assert.match(upload, /if \(contentType\.startsWith\("image\/"\)\) return null/);
  assert.doesNotMatch(upload, /applyPropertyImageWatermarkServer/);
});
