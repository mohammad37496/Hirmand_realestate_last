import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("public property watermark is mounted only in the image lightbox", async () => {
  const detail = await read("src/components/hirmand/property-detail-view.tsx");
  const showcase = await read("src/components/hirmand/property-showcase.tsx");
  const adminMedia = await read("src/components/hirmand/admin-media-field.tsx");
  const watermarkSettings = await read("src/lib/property-watermark.ts");
  const publicWatermark = await read("server/routes/api/public-watermark.get.ts");
  const adminWatermark = await read("server/routes/api/admin-watermark.post.ts");
  assert.equal((detail.match(/<PropertyMediaWatermark\s*\/>/g) ?? []).length, 1);
  assert.match(detail, /isVideoUrl\(current\)\s*\?/);
  assert.match(detail, /!isPermanentlyWatermarkedMediaUrl\(current\)/);
  assert.match(detail, /className="property-lightbox-media-wrap"[\s\S]*?<PropertyMediaWatermark\s*\/>/);
  assert.doesNotMatch(showcase, /PropertyMediaWatermark/);
  assert.doesNotMatch(adminMedia, /PropertyMediaWatermark/);
  assert.match(watermarkSettings, /enabled:\s*value\?\.enabled\s*===\s*true/);
  assert.match(publicWatermark, /enabled:\s*row\.enabled\s*===\s*true/);
  assert.match(adminWatermark, /enabled:\s*row\.enabled\s*===\s*true/);
});

test("new property image uploads skip permanent watermark processing", async () => {
  const upload = await read("server/routes/api/upload.post.ts");
  assert.match(upload, /if \(contentType\.startsWith\("image\/"\)\) return null/);
  assert.doesNotMatch(upload, /applyPropertyImageWatermarkServer/);
});

test("area images use the same-origin media proxy for private Liara objects", async () => {
  const areaPage = await read("src/routes/areas.$slug.tsx");
  const adminArea = await read("src/components/hirmand/admin-area-content.tsx");
  assert.match(areaPage, /mediaPreviewSource\(content\.heroImage\)/);
  assert.match(areaPage, /href=\{mediaPreviewSource\(url\)\}/);
  assert.match(areaPage, /src=\{mediaPreviewSource\(url\)\}/);
  assert.match(adminArea, /import \{ mediaPreviewSource \} from "@\/lib\/media"/);
  assert.match(adminArea, /src=\{mediaPreviewSource\(url\)\}/);
});

test("Liara image proxy matches the 25 MiB upload cap without raising Divar's bound", async () => {
  const proxy = await read("server/routes/api/media-proxy.get.ts");
  assert.match(proxy, /MAX_LIARA_IMAGE_BYTES = 25 \* 1024 \* 1024/);
  assert.match(proxy, /MAX_DIVAR_IMAGE_BYTES = 12 \* 1024 \* 1024/);
  assert.match(proxy, /readBoundedImage\(response, MAX_LIARA_IMAGE_BYTES, TIMEOUT_MS\)/);
  assert.match(proxy, /readBoundedImage\(response, MAX_DIVAR_IMAGE_BYTES, TIMEOUT_MS\)/);
});
