import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const detail = readFileSync(new URL("../src/components/hirmand/property-detail-view.tsx", import.meta.url), "utf8");
const browserSmoke = readFileSync(new URL("./responsive-layout-smoke.mjs", import.meta.url), "utf8");

test("property detail sharing prefers native share and falls back to clipboard", () => {
  assert.match(detail, /if \(navigator\.share\)\s*\{\s*await navigator\.share\(shareData\)/);
  assert.match(detail, /if \(error instanceof DOMException && error\.name === "AbortError"\) return/);
  assert.match(detail, /await navigator\.clipboard\.writeText\(url\)/);
  assert.match(detail, /trackAnalyticsEvent\("property_share", property\.slug\)/);
  assert.match(browserSmoke, /window\.__qaShareMode = "fallback"/);
  assert.match(browserSmoke, /No native share sheet/);
  assert.match(browserSmoke, /native-share rejection did not fall back to copying the exact property URL/);
  assert.match(browserSmoke, /window\.__qaShareMode = "success"/);
  assert.match(browserSmoke, /successful native share unexpectedly copied or used a different URL/);
});
