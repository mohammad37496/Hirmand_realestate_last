import assert from "node:assert/strict";
import test from "node:test";
import {
  PROPERTY_CARD_IMAGE_LIMIT,
  advancePropertyCardImageFailure,
  selectPropertyCardImages,
  type PropertyCardImageState,
} from "./property-card-media.ts";

const initialState: PropertyCardImageState = {
  sourceIndex: 0,
  candidateIndex: 0,
  legacyMode: false,
  failed: false,
};

test("property cards keep unique real images, remove known placeholders and cap payload at four", () => {
  const images = selectPropertyCardImages([
    " https://cdn.example/one.webp ",
    "https://cdn.example/one.webp",
    "/images/type-apartment.jpg",
    "",
    "https://cdn.example/two.webp",
    "https://cdn.example/three.webp",
    "https://cdn.example/four.webp",
    "https://cdn.example/five.webp",
  ], "https://cdn.example/one.webp");

  assert.deepEqual(images, [
    "https://cdn.example/one.webp",
    "https://cdn.example/two.webp",
    "https://cdn.example/three.webp",
    "https://cdn.example/four.webp",
  ]);
  assert.equal(images.length, PROPERTY_CARD_IMAGE_LIMIT);
});

test("property cards fall back to the legacy primary image only when the stored list is empty", () => {
  assert.deepEqual(selectPropertyCardImages([], "https://cdn.example/primary.webp"), [
    "https://cdn.example/primary.webp",
  ]);
  assert.deepEqual(selectPropertyCardImages(["/images/type-apartment.jpg"], "/images/type-apartment.jpg"), []);
});

test("a failed card source advances through alternate URL candidates before the next image", () => {
  assert.deepEqual(advancePropertyCardImageFailure(initialState, {
    sourceCount: 2,
    candidateCount: 2,
    usingLocalFallback: false,
    hasLegacyFallback: true,
  }), { ...initialState, candidateIndex: 1 });

  assert.deepEqual(advancePropertyCardImageFailure({ ...initialState, candidateIndex: 1 }, {
    sourceCount: 2,
    candidateCount: 2,
    usingLocalFallback: false,
    hasLegacyFallback: true,
  }), { ...initialState, sourceIndex: 1 });
});

test("after all stored images fail, the card tries its local legacy fallback once", () => {
  const fallback = advancePropertyCardImageFailure({ ...initialState, sourceIndex: 2 }, {
    sourceCount: 2,
    candidateCount: 1,
    usingLocalFallback: true,
    hasLegacyFallback: true,
  });
  assert.deepEqual(fallback, { ...initialState, sourceIndex: 2, legacyMode: true });

  assert.deepEqual(advancePropertyCardImageFailure(fallback, {
    sourceCount: 2,
    candidateCount: 1,
    usingLocalFallback: true,
    hasLegacyFallback: true,
  }), { ...fallback, failed: true });
});

test("a missing legacy fallback terminates instead of retrying the same broken image", () => {
  assert.deepEqual(advancePropertyCardImageFailure(initialState, {
    sourceCount: 0,
    candidateCount: 1,
    usingLocalFallback: true,
    hasLegacyFallback: false,
  }), { ...initialState, failed: true });
});
