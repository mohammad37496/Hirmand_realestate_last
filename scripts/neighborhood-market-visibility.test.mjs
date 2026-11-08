import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const neighborhoodMarket = await readFile(
  new URL("../src/lib/neighborhood-market.ts", import.meta.url),
  "utf8",
);
const neighborhoodMarketQuery = await readFile(
  new URL("../src/lib/neighborhood-market-query.ts", import.meta.url),
  "utf8",
);

test("neighborhood market aggregates and event statistics use canonical public property visibility", () => {
  assert.match(neighborhoodMarket, /loadNeighborhoodMarketSnapshot\(sql, data\.neighborhood\)/);
  assert.match(neighborhoodMarketQuery, /import \{ publicPropertyVisibilitySql \} from "\.\/public-property-visibility\.ts"/);
  assert.match(neighborhoodMarketQuery, /from properties\s+where \$\{publicPropertyVisibilitySql\(\)\}/);
  assert.doesNotMatch(neighborhoodMarketQuery, /from properties\s+where status='published'/);
  assert.match(neighborhoodMarketQuery, /join neighborhood_files p on p\.slug=e\.property_slug/);
});
