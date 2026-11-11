import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const smartSearch = readFileSync(new URL("../src/routes/smart-search.tsx", import.meta.url), "utf8");

test("smart property search exposes subsequent 48-result pages", () => {
  assert.match(smartSearch, /const SMART_SEARCH_PAGE_SIZE = 48/);
  assert.match(smartSearch, /listPublishedPropertyCards\(\{ data: \{ \.\.\.parsed\.filters, offset: 0 \} \}\)/);
  assert.match(smartSearch, /listPublishedPropertyCards\(\{ data: \{ \.\.\.result\.filters, offset \} \}\)/);
  assert.match(smartSearch, /const known = new Set\(current\.map\(\(property\) => property\.id\)\)/);
  assert.match(smartSearch, /setHasMore\(rows\.length === SMART_SEARCH_PAGE_SIZE\)/);
  assert.match(smartSearch, /نمایش فایل‌های بیشتر/);
  assert.match(smartSearch, /فایل نمایش داده شده/);
  assert.doesNotMatch(smartSearch, /\{properties\.length\.toLocaleString\("fa-IR"\)\} فایل پیدا شد/);
});

test("submitting an empty smart search invalidates pending search and pagination responses", () => {
  const emptyQueryBranch = smartSearch.match(/if \(!text\) \{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
  assert.match(emptyQueryBranch, /searchRequestId\.current\s*\+=\s*1/);
  assert.match(emptyQueryBranch, /setLoading\(false\)/);
  assert.match(emptyQueryBranch, /setLoadingMore\(false\)/);
  assert.ok(emptyQueryBranch.indexOf("searchRequestId.current += 1") < emptyQueryBranch.indexOf("return;"));
  assert.match(emptyQueryBranch, /setResult\(null\)/);
  assert.match(emptyQueryBranch, /setProperties\(\[\]\)/);
  assert.match(emptyQueryBranch, /setHasMore\(false\)/);
  assert.match(emptyQueryBranch, /setSearchError\(""\)/);
});

test("a failed new smart search cannot leave previous-query cards visible and exposes retry", () => {
  const runSearchStart = smartSearch.indexOf("async function runSearch(");
  const loadMoreStart = smartSearch.indexOf("async function loadMore()", runSearchStart);
  const runSearch = smartSearch.slice(runSearchStart, loadMoreStart);
  assert.ok(runSearch.includes("setResult(null)"));
  assert.ok(runSearch.includes("setProperties([])"));
  assert.ok(runSearch.includes('setSearchError("")'));
  assert.ok(runSearch.includes('setSearchError("جستجو انجام نشد'));
  assert.match(smartSearch, /className="property-empty smart-search-error" role="alert"/);
  assert.match(smartSearch, /onClick=\{\(\) => void runSearch\(query\)\}/);
});
