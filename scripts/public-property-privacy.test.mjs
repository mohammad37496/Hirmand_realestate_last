import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const properties = fs.readFileSync(new URL("../src/lib/properties.ts", import.meta.url), "utf8");

test("public property mapper excludes owner details and internal notes", () => {
  const mapperStart = properties.indexOf("function mapProperty(");
  const mapperEnd = properties.indexOf("\nfunction ", mapperStart + 1);
  assert.ok(mapperStart >= 0 && mapperEnd > mapperStart, "property mapper should be discoverable");
  const mapper = properties.slice(mapperStart, mapperEnd);
  assert.match(mapper, /address:\s*isAdmin\s*\?[^:]+:\s*null/);
  assert.match(mapper, /\.\.\.\(isAdmin\s*\?\s*\{/);
  assert.match(mapper, /ownerName:/);
  assert.match(mapper, /ownerPhone:/);
  assert.match(mapper, /ownerInfo:/);
  assert.match(mapper, /internalNote:/);
  assert.match(mapper, /\}\s*:\s*\{\}\)/);
});
