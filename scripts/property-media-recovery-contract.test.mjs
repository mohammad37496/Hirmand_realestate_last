import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const componentPath = fileURLToPath(
  new URL("../src/components/hirmand/property-detail-view.tsx", import.meta.url),
);
const componentSource = readFileSync(componentPath, "utf8");

test("lightbox thumbnail selection uses the gallery navigation path", () => {
  const stripStart = componentSource.indexOf('className={"property-lightbox-thumb"');
  assert.notEqual(stripStart, -1);
  const strip = componentSource.slice(stripStart, stripStart + 900);
  assert.match(strip, /onClick=\{\(\) => goTo\(index\)\}/);
  assert.doesNotMatch(strip, /onClick=\{\(\) => setActive\(index\)\}/);
});

test("the primary gallery image clears recovery state after load and reports exhaustion by index", () => {
  assert.match(componentSource, /const current = images\[active\] \?\? images\[0\] \?\? fallback/);
  assert.doesNotMatch(componentSource, /const current = fallbackActive \? fallback/);
  assert.match(componentSource, /nextUnfailedMediaIndex\(images, failedImageIndexesRef\.current, failedIndex\)/);
  assert.match(componentSource, /if \(nextIndex === null\) \{\s*setFallbackActive\(true\);\s*return;\s*\}/);
  assert.match(componentSource, /activeRef\.current = nextIndex;\s*setActive\(nextIndex\);\s*setFallbackActive\(false\);/);
  assert.match(componentSource, /onLoaded=\{\(\) => \{\s*if \(activeRef\.current !== active\) return;\s*clearMediaFailure\(failedImageIndexesRef\.current, active\);\s*setFallbackActive\(false\);/);
  assert.match(componentSource, /onExhausted=\{\(\) => markImageFailed\(active\)\}/);
  assert.match(componentSource, /setImageResetToken\(\(value\) => value \+ 1\)/);
  assert.match(componentSource, /key=\{`\$\{active\}:\$\{current\}:\$\{imageResetToken\}`\}/);
});
