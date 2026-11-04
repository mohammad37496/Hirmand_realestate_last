import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getPropertyFallbackImage,
  getPropertyFallbackLegacyImage,
  isPropertyFallbackImage,
} from "./property-fallback-images.ts";

test("property fallbacks use curated professional photography with a local photo emergency fallback", () => {
  const primary = getPropertyFallbackImage("apartment", "property-123");
  assert.equal(primary, "/images/type-apartment.jpg");
  assert.equal(getPropertyFallbackImage("apartment", "property-123"), primary);
  assert.equal(getPropertyFallbackLegacyImage("apartment", "property-123"), "/images/type-apartment.jpg");
  assert.equal(getPropertyFallbackImage("villa", "property-456"), "/images/type-villa.jpg");
  assert.equal(getPropertyFallbackImage("office", "property-789"), "/images/type-office.jpg");
  assert.equal(getPropertyFallbackImage("heritage", "property-321"), "/images/type-heritage.jpg");
  assert.equal(getPropertyFallbackImage("land", "property-654"), "/images/fallback/land-01.jpg");
  assert.equal(getPropertyFallbackImage("commercial", "property-987"), "/images/fallback/commercial-01.jpg");
});

test("local category and curated fallback photography are classified as UI placeholders", () => {
  assert.equal(isPropertyFallbackImage("/images/type-apartment.jpg"), true);
  assert.equal(isPropertyFallbackImage("/images/fallback/apartment-01.svg"), true);
  assert.equal(isPropertyFallbackImage("/images/fallback/commercial-04.webp?cache=1"), true);
  assert.equal(isPropertyFallbackImage("https://images.pexels.com/photos/7546596/pexels-photo-7546596.jpeg?auto=compress&dpr=1"), true);
});

test("real media URLs are preserved even when their filenames resemble placeholders", () => {
  assert.equal(isPropertyFallbackImage("https://cdn.liara.storage.example/properties/uploads/apartment-01.webp"), false);
  assert.equal(isPropertyFallbackImage("/api/media/6df8cddb-1022-4a11-8a14-4a8c5d30b1a2"), false);
  assert.equal(isPropertyFallbackImage("https://images.pexels.com/photos/1234/real-estate-interior.jpeg"), false);
});

test("query strings do not change placeholder classification", () => {
  assert.equal(isPropertyFallbackImage("https://hirmandrealestate.ir/images/fallback/villa-01.jpg?v=3"), true);
  assert.equal(isPropertyFallbackImage(""), false);
});


test("every configured photographic fallback exists as a tracked raster asset", async () => {
  const paths = [
    "../../public/images/type-apartment.jpg",
    "../../public/images/type-villa.jpg",
    "../../public/images/type-office.jpg",
    "../../public/images/type-heritage.jpg",
    "../../public/images/fallback/land-01.jpg",
    "../../public/images/fallback/commercial-01.jpg",
  ];
  for (const path of paths) {
    const bytes = await readFile(new URL(path, import.meta.url));
    assert.ok(bytes.length > 10_000, path + " should be a real photographic asset");
    assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], path + " should be JPEG");
  }
});
