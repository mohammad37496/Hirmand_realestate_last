import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../src/routes/my-hirmand.tsx", import.meta.url), "utf8");

test("my-hirmand preserves tracking API errors and offers a retry instead of a generic missing-code state", () => {
  assert.match(route, /loadPublicTrackingResult\(trackingCode\)/);
  assert.match(route, /setErrors\(\(prev\) => \(\{ \.\.\.prev, \[trackingCode\]: loaded\.message \}\)\)/);
  assert.match(route, /error=\{errors\[item\.trackingCode\] \?\? ""\}/);
  assert.match(route, /onRetry=\{\(\) => void loadCode\(item\.trackingCode\)\}/);
  assert.match(route, /تلاش دوباره/);
  assert.match(route, /setErrors\(\{\}\)/);
});
