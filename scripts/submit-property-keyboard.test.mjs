import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("property media upload can be opened with Enter and Space", () => {
  const submission = read("../src/routes/submit-property.tsx");
  const responsiveSmoke = read("./responsive-layout-smoke.mjs");
  const zone = submission.match(/<div\s+className=\{[^\n]*customer-property-upload-zone[\s\S]*?<\/div>/)?.[0] ?? "";
  assert.match(zone, /role="button"/);
  assert.match(zone, /tabIndex=\{0\}/);
  assert.match(zone, /onKeyDown=\{\(event\)\s*=>\s*\{[\s\S]*?event\.key !== "Enter" && event\.key !== " "/);
  assert.match(zone, /event\.preventDefault\(\)/);
  assert.match(zone, /inputRef\.current\?\.click\(\)/);
  assert.match(zone, /aria-disabled=\{uploading\}/);
  assert.match(responsiveSmoke, /route === "\/submit-property"[\s\S]*?for \(const key of \["Enter", "Space"\]\)[\s\S]*?waitForEvent\("filechooser"/);
});
