import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [route, apiRoute, trackingPage, adminLeadApi, adminLeadUi] = await Promise.all([
  readFile(new URL("../src/routes/my-hirmand.tsx", import.meta.url), "utf8"),
  readFile(new URL("../server/routes/api/public-lead-tracking.get.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/routes/request-tracking.tsx", import.meta.url), "utf8"),
  readFile(new URL("../server/routes/api/leads-admin.post.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/components/hirmand/admin-lead-manager.tsx", import.meta.url), "utf8"),
]);

test("my-hirmand preserves tracking API errors and offers a retry instead of a generic missing-code state", () => {
  assert.match(route, /loadPublicTrackingResult\(trackingCode\)/);
  assert.match(route, /setErrors\(\(prev\) => \(\{ \.\.\.prev, \[trackingCode\]: loaded\.message \}\)\)/);
  assert.match(route, /error=\{errors\[item\.trackingCode\] \?\? ""\}/);
  assert.match(route, /onRetry=\{\(\) => void loadCode\(item\.trackingCode\)\}/);
  assert.match(route, /تلاش دوباره/);
  assert.match(route, /setErrors\(\{\}\)/);
});

test("public tracking preserves exact numeric(20,0) offer amounts end to end", () => {
  assert.match(apiRoute, /toExactPublicOfferAmount\(row\.offer_amount\)/);
  assert.doesNotMatch(apiRoute, /Number\(row\.offer_amount\)/);
  assert.match(apiRoute, /formatTomanExact\(offerAmount\)/);
  assert.match(trackingPage, /offerAmount\?: string \| null/);
  assert.match(trackingPage, /formatTomanExact\(result\.offerAmount\)/);
  assert.doesNotMatch(trackingPage, /Number\(result\.offerAmount\)/);
});

test("admin lead JSON and CSV preserve exact offer amounts", () => {
  assert.match(adminLeadApi, /offerAmount:\s*row\.offer_amount == null \? null : String\(row\.offer_amount\)/);
  assert.match(adminLeadApi, /formatDecimalMoney\(String\(row\.offer_amount\)\)/);
  assert.doesNotMatch(adminLeadApi, /Number\(row\.offer_amount\)/);
  assert.match(adminLeadUi, /offerAmount: string \| null/);
  assert.match(adminLeadUi, /formatTomanExact\(lead\.offerAmount\)/);
});
