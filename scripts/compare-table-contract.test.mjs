import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveCompareLoad } from "../src/lib/compare-load-state.mjs";
import { clearCompareSlugs, readCompareSlugs, toggleCompareSlug, writeCompareSlugs } from "../src/lib/compare-storage.mjs";

const compare = readFileSync(new URL("../src/routes/compare.tsx", import.meta.url), "utf8");
const propertyActions = readFileSync(new URL("../src/components/hirmand/property-actions.tsx", import.meta.url), "utf8");
const comparePage = readFileSync(new URL("../src/routes/compare.tsx", import.meta.url), "utf8");
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
  assert.match(compare, /const storedCompare = readCompareSlugs\(localStorage, COMPARE_KEY, MAX_COMPARE\)/);
  assert.match(compare, /storedCompare\.status === "success" \? storedCompare\.slugs : \[\]/);
  assert.match(compare, /if \(resolved\.isShared && !persistCompare\(slugs\)\)/);
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

test("comparison CSV reuses the spreadsheet-formula-safe cell encoder", () => {
  assert.match(compare, /import \{ csvCell as escapeCsvCell \} from "@\/lib\/property-export"/);
  assert.match(compare, /return escapeCsvCell\(text\)/);
  assert.doesNotMatch(compare, /return \/\[",\]\/\.test\(text\)/);
});

test("comparison loader distinguishes an empty success from a failed query", async () => {
  assert.deepEqual(await resolveCompareLoad(async () => []), { status: "success", rows: [] });
  assert.deepEqual(await resolveCompareLoad(async () => { throw new Error("database unavailable"); }), { status: "error" });
});

test("compare storage write failures preserve the existing selection and never report a successful toggle", () => {
  let stored = JSON.stringify(["existing-property"]);
  const storage = {
    getItem: () => stored,
    setItem: (_key, _value) => { throw new Error("storage quota exceeded"); },
  };

  assert.deepEqual(readCompareSlugs(storage, "compare", 3), {
    status: "success",
    slugs: ["existing-property"],
  });
  assert.deepEqual(toggleCompareSlug(storage, "compare", "new-property", 3), {
    status: "error",
    next: ["existing-property"],
  });
  assert.deepEqual(toggleCompareSlug(storage, "compare", "existing-property", 3), {
    status: "error",
    next: ["existing-property"],
  });
  assert.equal(stored, JSON.stringify(["existing-property"]), "failed writes must not mutate the persisted selection");

  const handler = propertyActions.slice(propertyActions.indexOf("function onCompare("), propertyActions.indexOf("const qrTarget", propertyActions.indexOf("function onCompare(")));
  assert.match(handler, /result\.status === "error"/);
  assert.ok(handler.indexOf('result.status === "error"') < handler.indexOf("setCompared("));
  assert.ok(handler.indexOf('result.status === "error"') < handler.indexOf("toast.success("));
  assert.match(handler, /toast\.error\(/);
});

test("compare storage read failures are surfaced instead of being treated as an empty selection", () => {
  const storage = {
    getItem: () => { throw new Error("storage unavailable"); },
    setItem: () => { throw new Error("storage unavailable"); },
  };

  assert.deepEqual(readCompareSlugs(storage, "compare", 3), { status: "error" });
  assert.deepEqual(toggleCompareSlug(storage, "compare", "property", 3), { status: "error" });
});

test("compare page remove and clear actions keep the visible selection when storage writes fail", () => {
  const removeHandler = comparePage.slice(comparePage.indexOf("function removeFromCompare("), comparePage.indexOf("useEffect(() =>", comparePage.indexOf("function removeFromCompare(")));
  const clearHandler = comparePage.slice(comparePage.indexOf("function clearCompare("), comparePage.indexOf("return (", comparePage.indexOf("function clearCompare(")));
  const writeFailureStorage = {
    setItem: () => { throw new Error("storage quota exceeded"); },
    removeItem: () => { throw new Error("storage unavailable"); },
  };

  assert.deepEqual(writeCompareSlugs(writeFailureStorage, "compare", ["kept"]), { status: "error" });
  assert.deepEqual(clearCompareSlugs(writeFailureStorage, "compare"), { status: "error" });
  assert.match(removeHandler, /if \(!persistCompare\(next\)\)/);
  assert.ok(removeHandler.indexOf("toast.error(") < removeHandler.indexOf("setProperties("));
  assert.match(clearHandler, /clearCompareSlugs\(localStorage, COMPARE_KEY\)\.status === "error"/);
  assert.ok(clearHandler.indexOf("toast.error(") < clearHandler.indexOf("setProperties("));
  assert.match(removeHandler, /storedCompare\.status === "error" && !current\.isShared/);
  assert.match(comparePage, /if \(!resolved\.isShared && storedCompare\.status === "error"\)/);
  assert.match(comparePage, /setLoadError\(true\)/);
});
