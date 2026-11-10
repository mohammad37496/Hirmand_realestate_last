import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSharedCompare,
  resolveCompareSlugs,
  updateSharedCompareSearch,
} from "./compare-share.mjs";

test("a shared comparison is authoritative over the recipient's local comparison", () => {
  assert.deepEqual(
    resolveCompareSlugs("?share=shared-a,shared-b", ["recipient-a", "recipient-b"]),
    { isShared: true, slugs: ["shared-a", "shared-b"] },
  );
});

test("ordinary comparison still restores the visitor's local selection", () => {
  assert.deepEqual(
    resolveCompareSlugs("?campaign=spring", ["local-a", "local-b", "local-a"]),
    { isShared: false, slugs: ["local-a", "local-b"] },
  );
});

test("shared links normalize duplicates, whitespace and the three-property limit", () => {
  assert.deepEqual(parseSharedCompare("?share=%20a%20,b,a,c,d"), {
    hasShare: true,
    slugs: ["a", "b", "c"],
  });
});

test("removing one shared property updates the URL and preserves unrelated query parameters", () => {
  assert.equal(
    updateSharedCompareSearch("?campaign=spring&share=a,b,c", ["a", "c"]),
    "?campaign=spring&share=a%2Cc",
  );
});

test("clearing a shared comparison removes its share parameter", () => {
  assert.equal(updateSharedCompareSearch("?campaign=spring&share=a,b", []), "?campaign=spring");
  assert.equal(updateSharedCompareSearch("?share=a,b", []), "");
});

test("local-only remove and clear operations do not manufacture a share URL", () => {
  assert.equal(updateSharedCompareSearch("?campaign=spring", ["a"]), null);
});
