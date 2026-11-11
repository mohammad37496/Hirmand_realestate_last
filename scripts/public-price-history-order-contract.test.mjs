import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/lib/properties.ts", import.meta.url),
  "utf8",
);

test("public property price history has deterministic ordering at its limit", () => {
  const start = source.indexOf("export const getPublishedPropertyPriceHistory =");
  const end = source.indexOf("export const listPublishedPropertyCardsBySlugs =", start);

  assert.notEqual(start, -1, "public price-history query should exist");
  assert.notEqual(end, -1, "public price-history query should have a clear boundary");

  const implementation = source.slice(start, end);
  assert.match(
    implementation,
    /order by changed_at desc, id desc limit 12/i,
    "rows sharing changed_at must use descending history id as a stable tie-breaker before limiting",
  );
});
