import assert from "node:assert/strict";
import { test } from "node:test";
import { assertIsfahanDistricts, normalizeDivarDistrictCatalog, normalizeDivarNeighborhoodName } from "./divar-neighborhood-geometry.ts";
import { mergeAreaDirectory } from "./area-directory-merge.ts";

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

test("a city-ID mismatch is rejected before coordinates are advertised as Isfahan", () => {
  const [mashhadLike] = normalizeDivarDistrictCatalog({
    districts: [sample({ default_location: { latitude: 36.3, longitude: 59.5 }, bbox: [59.4, 36.2, 59.6, 36.4] })],
  });
  assert.throws(() => assertIsfahanDistricts([mashhadLike]), /city-ID mismatch/u);
});


function directoryDistrict(id: string, name: string, slug: string, latitude: number, longitude: number) {
  return {
    cityId: "4",
    id,
    name,
    slug,
    secondSlug: null,
    level: "district",
    radius: null,
    centroid: null,
    defaultLocation: { latitude, longitude },
    bbox: [longitude - 0.01, latitude - 0.01, longitude + 0.01, latitude + 0.01] as [number, number, number, number],
    neighbors: [],
    tags: [],
    polygonEncoded: "",
    multiPolygonEncoded: [],
    multiPolygon: [],
    boundaryType: "bbox" as const,
  };
}

test("area directory attaches Divar geometry to exact names and vetted Persian spelling aliases", () => {
  const curated = [
    { name: "درچه", slug: "درچه", groupTitle: "غرب" },
    { name: "شهرک ولی‌عصر", slug: "شهرک-ولیعصر", groupTitle: "غرب" },
    { name: "درب‌کوش", slug: "دربکوش", groupTitle: "مرکز" },
    { name: "پوزوه", slug: "پوزوه", groupTitle: "شرق" },
    { name: "گل‌نرگس", slug: "گل-نرگس", groupTitle: "جنوب" },
    { name: "جوان", slug: "جوان", groupTitle: "غرب" },
    { name: "قلعه تبرک", slug: "قلعه-تبرک", groupTitle: "مرکز" },
  ];
  const catalog = [
    directoryDistrict("1547", "درچه", "dorcheh", 32.613102, 51.5545082),
    directoryDistrict("1441", "شهرک ولیعصر", "valiasr-town", 32.7392426, 51.6611),
    directoryDistrict("1459", "درب کوشک", "mahale-now", 32.67, 51.68),
    directoryDistrict("1509", "پزوه", "pozveh", 32.7, 51.75),
    directoryDistrict("2408", "شهرک گل نرگس", "shahrak-gol-narges", 32.61, 51.63),
    directoryDistrict("1549", "جاوان", "javan", 32.65, 51.61),
    directoryDistrict("1473", "قلعه طبره", "ghale-tabre", 32.67, 51.69),
    directoryDistrict("9999", "محدوده تازه دیوار", "new-divar-area", 32.71, 51.77),
  ];

  const merged = mergeAreaDirectory(curated, catalog, "محدوده‌های دیگر دیوار");
  const dorcheh = merged.find((area) => area.slug === "درچه");
  const valiasr = merged.find((area) => area.slug === "شهرک-ولیعصر");
  const darbKoosh = merged.find((area) => area.slug === "دربکوش");
  const pozveh = merged.find((area) => area.slug === "پوزوه");
  const golNarges = merged.find((area) => area.slug === "گل-نرگس");
  const javan = merged.find((area) => area.slug === "جوان");
  const tabarak = merged.find((area) => area.slug === "قلعه-تبرک");

  assert.equal(dorcheh?.divarDistrictId, "1547");
  assert.equal(dorcheh?.divarSlug, "dorcheh");
  assert.deepEqual([dorcheh?.lat, dorcheh?.lng], [32.613102, 51.5545082]);
  assert.deepEqual(valiasr?.divarBbox?.map((value) => Number(value.toFixed(7))), [51.6511, 32.7292426, 51.6711, 32.7492426]);
  assert.equal(darbKoosh?.divarDistrictId, "1459");
  assert.equal(pozveh?.divarDistrictId, "1509");
  assert.equal(golNarges?.divarDistrictId, "2408");
  assert.equal(javan?.divarDistrictId, "1549");
  assert.equal(tabarak?.divarDistrictId, "1473");

  const assignedIds = merged.map((area) => area.divarDistrictId).filter((id): id is string => Boolean(id));
  assert.equal(new Set(assignedIds).size, catalog.length, "each Divar record must appear exactly once");
  assert.deepEqual([...assignedIds].sort(), catalog.map((item) => item.id).sort());
  assert.ok(merged.every((area) =>
    !area.divarDistrictId || (area.lat != null && area.lng != null && area.divarBbox != null)
  ));
});

test("an exact Divar name wins over a different curated alias", () => {
  const curated = [
    { name: "شهید کشوری", slug: "شهید-کشوری", groupTitle: "غرب" },
    { name: "کوی شهید کشوری", slug: "کوی-شهید-کشوری", groupTitle: "غرب" },
  ];
  const catalog = [directoryDistrict("1518", "کوی شهید کشوری", "kuy-shahid-keshvari", 32.6, 51.6)];
  const merged = mergeAreaDirectory(curated, catalog, "محدوده‌های دیگر دیوار");

  assert.equal(merged.find((area) => area.slug === "کوی-شهید-کشوری")?.divarDistrictId, "1518");
  assert.equal(merged.filter((area) => area.divarDistrictId === "1518").length, 1);
});
