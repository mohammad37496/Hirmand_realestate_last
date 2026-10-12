import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const middleware = await readFile(
  new URL("../server/middleware/security-headers.ts", import.meta.url),
  "utf8",
);

test("same-origin geolocation remains available for explicit property features", () => {
  assert.match(middleware, /geolocation=\(self\)/);
});

test("camera and microphone remain blocked by the site-wide policy", () => {
  assert.match(middleware, /camera=\(\), microphone=\(\)/);
});
