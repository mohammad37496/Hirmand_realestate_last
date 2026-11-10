import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveCompareLoad } from "../src/lib/compare-load-state.mjs";

const compare = readFileSync(new URL("../src/routes/compare.tsx", import.meta.url), "utf8");
const browserSmoke = readFileSync(new URL("./browser-smoke.mjs", import.meta.url), "utf8");

test("property comparison renders every feature row once", () => {
  const tableBody = compare.slice(compare.indexOf("<tbody>"), compare.indexOf("</tbody>"));
  const labels = [...tableBody.matchAll(/<th>([^<]+)<\/th>/g)].map((match) => match[1].trim());
  assert.ok(labels.length > 10, "comparison should retain its full feature table");
  assert.equal(new Set(labels).size, labels.length, `comparison feature labels must be unique: ${labels.join(", ")}`);
  assert.ok(labels.includes("کاغذ دیواری"));
  assert.ok(labels.includes("انباری"));
});

test("shared comparison import, removal and clearing stay synchronized with the URL", () => {
  assert.match(compare, /resolveCompareSlugs\(window\.location\.search, readCompare\(\)\)/);
  assert.match(compare, /if \(resolved\.isShared\) persistCompare\(slugs\)/);
  assert.match(compare, /if \(current\.isShared\) syncSharedCompareUrl\(next\)/);
  assert.match(compare, /syncSharedCompareUrl\(\[\]\)/);
  assert.match(compare, /if \(resolved\.isShared\) syncSharedCompareUrl\(retained\)/);
});

test("browser smoke verifies shared comparison precedence and responsive empty state", () => {
  assert.match(browserSmoke, /compareShareCheck/);
  assert.match(browserSmoke, /__hirmand_compare_smoke_missing__/);
  assert.match(browserSmoke, /hirmand-compare-properties/);
  assert.match(browserSmoke, /hasSelectedPropertyLink/);
  assert.match(browserSmoke, /widths: \[390, 768, 1280\]/);
});

test("comparison load failures preserve selected slugs and expose a retry state", () => {
  assert.match(compare, /const \[loadError, setLoadError\] = useState\(false\)/);
  assert.match(compare, /const \[retryAttempt, setRetryAttempt\] = useState\(0\)/);
  assert.match(compare, /result\.status === "error"/);
  assert.match(compare, /role="alert"/);
  assert.match(compare, /بارگذاری مقایسه ناموفق بود/);
  assert.match(compare, /setRetryAttempt\(\(current\) => current \+ 1\)/);
  assert.match(compare, /\}, \[retryAttempt\]\)/);
  assert.match(compare, /resolveCompareLoad\(\(\) => listPublishedPropertiesBySlugs/);
});

test("comparison loader distinguishes an empty success from a failed query", async () => {
  assert.deepEqual(await resolveCompareLoad(async () => []), { status: "success", rows: [] });
  assert.deepEqual(await resolveCompareLoad(async () => { throw new Error("database unavailable"); }), { status: "error" });
});
