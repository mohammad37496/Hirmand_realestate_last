import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const smoke = readFileSync(new URL("./mobile-device-profile-smoke.mjs", import.meta.url), "utf8");

test("device matrix audits every rendered property card and uses unrounded touch dimensions", () => {
  assert.match(smoke, /page\.locator\("\.pf-grid > \.pcard"\)\.evaluateAll\(\(cards\)/);
  assert.match(smoke, /hasActionContainer:\s*Boolean\(container\)/);
  assert.match(smoke, /cardAudits\.some\(\(card\) => !card\.hasActionContainer \|\| card\.actionCount < 8/);
  assert.match(smoke, /minWidth:\s*boxes\.length \? Math\.min\(\.\.\.boxes\.map\(\(box\) => box\.rawWidth\)\)/);
  assert.match(smoke, /previewWidthRaw:\s*preview\?\.width \?\? 0/);
  assert.match(smoke, /galleryAudit\.shortLandscape \? 68 : 42/);
  assert.match(smoke, /galleryAudit\.previewWidthRaw < minimumPreview/);
});
