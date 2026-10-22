import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { getPropertyFallbackImages, getPropertyFallbackLegacyImages, isPropertyFallbackImage } from "./property-fallback-images.ts";

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

test("every property type uses multiple checked-in local JPEG photos in its gallery", () => {
  const types = ["apartment", "villa", "office", "heritage", "land", "commercial"] as const;

  for (const type of types) {
    const galleryImages = getPropertyFallbackImages(type);
    assert.ok(galleryImages.length >= 4, `${type} should provide multiple next/previous gallery photos`);

    for (const src of galleryImages) {
      assert.ok(src.startsWith("/images/fallback/"), `${type} should use same-origin images`);
      assert.ok(src.endsWith(".jpg"), `${type} gallery defaults must be real JPEG files, not SVG placeholders`);
      const fullPath = join(process.cwd(), "public", src.slice(1));
      assert.ok(statSync(fullPath).size > 1_024, `${src} should be checked into the project`);
      const signature = readFileSync(fullPath).subarray(0, 3);
      assert.deepEqual([...signature], [0xff, 0xd8, 0xff], `${src} must contain JPEG bytes`);
    }

    const emergencyImages = getPropertyFallbackLegacyImages(type);
    assert.ok(emergencyImages.length >= 2, `${type} legacy emergency assets should remain available for older consumers`);
  }
});
