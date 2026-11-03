import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const nearby = readFileSync(new URL("../src/routes/nearby.tsx", import.meta.url), "utf8");

test("nearby search loads one page first and exposes incremental pagination", () => {
  const loader = nearby.slice(nearby.indexOf("loader: async () =>"), nearby.indexOf("head: () =>"));
  assert.equal((loader.match(/listPublishedPropertyCards\(/g) ?? []).length, 1, "initial loader must fetch only one page");
  assert.match(loader, /hasLocationOnly:\s*true,\s*sort:\s*"newest",\s*offset:\s*0/);
  assert.match(loader, /hasMore:\s*properties\.length\s*===\s*48/);
  assert.doesNotMatch(loader, /Promise\.all|\[0,\s*48,\s*96,\s*144\]/);

  const loadMore = nearby.slice(nearby.indexOf("async function loadMore()"), nearby.indexOf("function locate()"));
  assert.match(loadMore, /hasLocationOnly:\s*true,\s*sort:\s*"newest",\s*offset:\s*nextOffset/);
  assert.match(loadMore, /new Map\(current\.map\(\(property\) => \[property\.id, property\]\)\)/);
  assert.match(loadMore, /for \(const property of rows\) byId\.set\(property\.id, property\)/);
  assert.match(loadMore, /setNextOffset\(\(current\) => current \+ 48\)/);
  assert.match(loadMore, /setHasMore\(rows\.length === 48\)/);

  assert.match(nearby, /disabled=\{loadingMore\} aria-busy=\{loadingMore\}/);
  assert.match(nearby, /بارگذاری فایل‌های بیشتر/);
  assert.match(nearby, /فایل بارگذاری‌شده/);
  assert.match(nearby, /item\.distance <= radius/);
  assert.match(nearby, /\.sort\(\(a, b\) => \(a\.distance \?\? Infinity\) - \(b\.distance \?\? Infinity\)\)/);
});
