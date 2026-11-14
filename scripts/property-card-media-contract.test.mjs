import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const propertiesSource = readFileSync(new URL("../src/lib/properties.ts", import.meta.url), "utf8");
const showcaseSource = readFileSync(new URL("../src/components/hirmand/property-showcase.tsx", import.meta.url), "utf8");

test("published card queries return a bounded multi-image list", () => {
  assert.match(propertiesSource, /const CARD_COLUMNS = `[^`]*\bimages\b/s);
  assert.match(propertiesSource, /images:\s*selectPropertyCardImages\(parseJsonArray\(row\.images\), row\.image\)/);
  assert.match(propertiesSource, /selectPropertyCardImages/);
});

test("property cards render stored image sources and advance after a stale-safe image error", () => {
  assert.match(showcaseSource, /selectPropertyCardImages\(/);
  assert.match(showcaseSource, /sources=\{images\}/);
  assert.match(showcaseSource, /advancePropertyCardImageFailure\(/);
  assert.match(showcaseSource, /getAttribute\("src"\) !== displayedSource/);
  assert.match(showcaseSource, /key=\{`\$\{property\.id\}:\$\{images\.join\("\|"\)\}`\}/);
});
