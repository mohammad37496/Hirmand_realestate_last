import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const neighborhoodMarket = await readFile(
  new URL("../src/lib/neighborhood-market.ts", import.meta.url),
  "utf8",
);

test("neighborhood market aggregates and event statistics use canonical public property visibility", () => {
  assert.match(neighborhoodMarket, /import \{ publicPropertyVisibilitySql \} from "@\/lib\/public-property-visibility"/);
  assert.match(neighborhoodMarket, /from properties\s+where \$\{publicPropertyVisibilitySql\(\)\}/);
  assert.doesNotMatch(neighborhoodMarket, /from properties\s+where status='published'/);
  assert.match(neighborhoodMarket, /join neighborhood_files p on p\.slug=e\.property_slug/);
});
