import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { shouldHandleGalleryArrowKey } from "../src/lib/gallery-keyboard.mjs";

const component = readFileSync(new URL("../src/components/hirmand/property-detail-view.tsx", import.meta.url), "utf8");

test("video seek and other editable controls keep native arrow-key behavior", () => {
  for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
    assert.equal(shouldHandleGalleryArrowKey({ tagName, closest: () => null }), false, `${tagName} must keep its arrow keys`);
  }
  assert.equal(shouldHandleGalleryArrowKey({ tagName: "DIV", isContentEditable: true, closest: () => null }), false);
  assert.equal(shouldHandleGalleryArrowKey({ tagName: "SPAN", closest: () => ({ tagName: "INPUT" }) }), false, "nested editable content must keep its arrow keys");
  assert.equal(shouldHandleGalleryArrowKey({ tagName: "DIV", closest: () => null }), true, "non-editable lightbox surfaces must retain gallery navigation");
  assert.equal(shouldHandleGalleryArrowKey({ tagName: "DIV", closest: () => null }, true), false, "already-handled keys must not navigate the gallery");
});

test("lightbox arrow navigation delegates target filtering before changing media", () => {
  assert.match(component, /shouldHandleGalleryArrowKey\(event\.target, event\.defaultPrevented\)/);
  assert.match(component, /goTo\(activeRef\.current \+ \(event\.key === "ArrowLeft" \? -1 : 1\)\)/);
});
