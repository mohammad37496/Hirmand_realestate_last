import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDivarDistrictCatalog, normalizeDivarNeighborhoodName } from "./divar-neighborhood-geometry.ts";

const sample = (overrides = {}) => ({
  id: 123, name: "شهرک ولی‌عصر", slug: "shahrak-valiasr", second_slug: "shahrak-vali-asr",
  default_location: { latitude: 32.6123456, longitude: 51.6123456 },
  bbox: [51.60, 32.60, 51.63, 32.63], neighbors: [124],
  tags: [{ title: "خیابان نمونه", type: "STREET" }],
  polygon_encoded: "", multi_polygon_encoded: [], multi_polygon: [], ...overrides,
});

test("preserves Divar center and exact bbox order", () => {
  const [item] = normalizeDivarDistrictCatalog({ districts: [sample()] });
  assert.equal(item.id, "123");
  assert.equal(item.slug, "shahrak-valiasr");
  assert.deepEqual(item.defaultLocation, { latitude: 32.6123456, longitude: 51.6123456 });
  assert.deepEqual(item.bbox, [51.60, 32.60, 51.63, 32.63]);
  assert.equal(item.boundaryType, "bbox");
  assert.deepEqual(item.neighbors, [124]);
  assert.equal(item.sourcePayload.name, "شهرک ولی‌عصر");
});

test("only Divar-supplied polygons count as polygons", () => {
  const [bboxOnly] = normalizeDivarDistrictCatalog({ districts: [sample()] });
  const [polygon] = normalizeDivarDistrictCatalog({ districts: [sample({ multi_polygon: [[[51.6, 32.6], [51.7, 32.6], [51.7, 32.7]]] })] });
  assert.equal(bboxOnly.boundaryType, "bbox");
  assert.deepEqual(bboxOnly.multiPolygon, []);
  assert.equal(polygon.boundaryType, "polygon");
});

test("missing source geometry fails closed", () => {
  assert.throws(() => normalizeDivarDistrictCatalog({ districts: [sample({ bbox: null })] }), /no valid Divar bbox/u);
  assert.throws(() => normalizeDivarDistrictCatalog({ districts: [sample({ default_location: null })] }), /no valid default_location/u);
  assert.throws(() => normalizeDivarDistrictCatalog({ districts: [] }, { minimumDistricts: 1 }), /incomplete/u);
});

test("Persian ZWNJ spelling variants match the same Divar name", () => {
  assert.equal(normalizeDivarNeighborhoodName("شهرک ولی عصر"), normalizeDivarNeighborhoodName("شهرک ولی‌عصر"));
});
