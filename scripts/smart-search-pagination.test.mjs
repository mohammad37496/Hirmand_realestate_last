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
});
