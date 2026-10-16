import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { pointWithinBounds, isValidCoordinateBounds } from "../src/lib/map-geometry.ts";

const listing = await readFile(new URL("../src/routes/properties.index.tsx", import.meta.url), "utf8");
const map = await readFile(new URL("../src/components/hirmand/properties-map.tsx", import.meta.url), "utf8");
const properties = await readFile(new URL("../src/lib/properties.ts", import.meta.url), "utf8");
const seed = await readFile(new URL("./seed-browser-smoke.mjs", import.meta.url), "utf8");
const catalog = JSON.parse(
  await readFile(new URL("../data/divar-isfahan-neighborhoods.json", import.meta.url), "utf8"),
);

test("map_bbox and bbox URL aliases share strict W,S,E,N validation and one URL writer", () => {
  assert.match(listing, /parseCoordinateBounds\(params\.get\("map_bbox"\)\)\s*\?\?\s*parseCoordinateBounds\(params\.get\("bbox"\)\)/);
  assert.match(listing, /isValidCoordinateBounds\(rounded\)/);
  assert.match(listing, /if \(mapBounds\) \{[\s\S]*params\.set\("bbox", boundsValue\)[\s\S]*params\.set\("map_bbox", boundsValue\)/);
  const callbackStart = listing.indexOf("const syncMapBoundsToUrl = useCallback(");
  const callbackEnd = listing.indexOf("\n  const hasFilters", callbackStart);
  const mapBoundsCallback =
    callbackStart >= 0 && callbackEnd > callbackStart
      ? listing.slice(callbackStart, callbackEnd)
      : "";
  assert.ok(mapBoundsCallback, "map viewport callback exists");
  assert.doesNotMatch(mapBoundsCallback, /window\.history\.replaceState/, "URL writes are centralized to avoid filter/viewport races");
});

test("map viewport restore and neighborhood focus are fitted to measured screen dimensions", () => {
  assert.match(map, /zoomForCoordinateBounds\(boundsToRestore, size\.width, size\.height/);
  assert.match(map, /zoomForCoordinateBounds\(area\.divarBbox, size\.width, size\.height, 48\)/);
  assert.match(map, /setViewportMeasured\(true\)/);
});

test("invalid stored property coordinates are excluded from markers and mapped counts", () => {
  assert.match(map, /isValidGeoPoint\(latitude, longitude\)/);
  assert.match(map, /typeof latitude !== "number"/);
  assert.match(map, /typeof longitude !== "number"/);
  assert.match(map, /properties\.filter\(\(property\) => isValidGeoPoint\(property\.latitude, property\.longitude\)\)/);
});

test("viewport bounds are ANDed with neighborhood and all ordinary property filters in the SQL contract", () => {
  assert.match(listing, /mapBounds,/);
  assert.match(listing, /listPublishedPropertyCards\(\{ data \}\)/);
  assert.match(listing, /countPublishedProperties\(\{ data \}\)/);

  const where = properties.match(/function publicPropertyWhereSql\(\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.ok(where, "public property WHERE builder exists");
  assert.match(where, /neighborhood = \$3/);
  assert.match(where, /transaction_type = \$1/);
  assert.match(where, /property_type = \$2/);
  assert.match(where, /area_m2 >= \$7/);
  assert.match(where, /\$9::numeric is null/);
  assert.match(properties, /const PRICE_EXPR =/);
  assert.match(properties, /PRICE_EXPR/);
  assert.match(where, /longitude >= \$29/);
  assert.match(where, /latitude >= \$30/);
  assert.match(where, /longitude <= \$31/);
  assert.match(where, /latitude <= \$32/);
});

test("map query cache hits reject stale request generations", () => {
  assert.match(listing, /if \(requestId\.current !== currentRequest\) return;[\s\S]*setProperties\(cached\.rows\)/);
});

test("the stored Divar bounding box is the only neighborhood geometry; smoke fixture uses valid Mardavij coordinates", () => {
  assert.ok(Array.isArray(catalog.districts) && catalog.districts.length >= 250);
  const mardavij = catalog.districts.find((item) => item.name === "مرداویج");
  assert.ok(mardavij, "Mardavij exists in the Divar snapshot");
  assert.ok(isValidCoordinateBounds(mardavij.bbox));
  assert.equal(pointWithinBounds(32.610733, 51.6701584, mardavij.bbox), true);
  assert.match(seed, /'مرداویج'/);
  assert.match(seed, /32\.610733, 51\.6701584/);
  assert.match(map, /کادر تقریبی محدوده محله/);
  assert.equal(catalog.districts.some((item) => item.multi_polygon || item.multi_polygon_encoded || item.polygon_encoded), false);
});
