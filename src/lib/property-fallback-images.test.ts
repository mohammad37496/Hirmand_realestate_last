import assert from "node:assert/strict";
import test from "node:test";
import { isPropertyFallbackImage } from "./property-fallback-images.ts";

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
