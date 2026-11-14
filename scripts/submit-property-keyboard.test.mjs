import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("property media upload can be opened with Enter and Space", () => {
  const submission = read("../src/routes/submit-property.tsx");
  const responsiveSmoke = read("./responsive-layout-smoke.mjs");
  const zone = submission.match(/<button\s+type="button"\s+className=\{[^\n]*customer-property-upload-zone[\s\S]*?<\/button>/)?.[0] ?? "";
  assert.match(zone, /disabled=\{uploading\}/);
  assert.doesNotMatch(zone, /role="button"|tabIndex|onKeyDown/);
  assert.match(zone, /inputRef\.current\?\.click\(\)/);
  assert.match(submission, /<input ref=\{inputRef\} type="file" hidden multiple[\s\S]*?<button\s+type="button"[\s\S]*?customer-property-upload-zone/);
  assert.match(responsiveSmoke, /zone\.closest\("form"\)\?\.querySelector\('input\[type="file"\]'\)/);
  assert.match(responsiveSmoke, /typeof props\?\.onClick === "function"/);
  assert.match(responsiveSmoke, /route === "\/submit-property"[\s\S]*?for \(const key of \["Enter", "Space"\]\)[\s\S]*?waitForEvent\("filechooser"[\s\S]*?uploadZone\.press\(key\)/);
  assert.match(responsiveSmoke, /if \(!chooser\.isMultiple\(\)\)[\s\S]*?await chooser\.setFiles\(\[\]\)/);
});

test("property draft autosave tracks location coordinate changes", () => {
  const submission = read("../src/routes/submit-property.tsx");
  const dependencies = submission.match(/window\.localStorage\.setItem\(CUSTOMER_DRAFT_KEY[\s\S]*?\}, \[([\s\S]*?)\]\);/)?.[1] ?? "";
  assert.match(dependencies, /\blatitude\b/);
  assert.match(dependencies, /\blongitude\b/);
});
