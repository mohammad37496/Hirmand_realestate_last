#!/usr/bin/env node
/**
 * Pull the raw Divar Isfahan catalog. Invalid/partial responses fail closed
 * and never overwrite the most recent validated snapshot.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const cityId = "3";
const sourceUrl = "https://api.divar.ir/v8/places/cities/3/districts";
const outputPath = resolve("data/divar-isfahan-neighborhoods.json");
const minimumDistricts = Number.parseInt(process.env.DIVAR_ISFAHAN_MIN_DISTRICTS ?? "50", 10);

function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function validCoordinate(value, max) {
  let n = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return false;
  if (Math.abs(n) > max) {
    if (Math.abs(n) >= 100_000_000) n /= 10_000_000;
    else if (Math.abs(n) >= 10_000_000) n /= 1_000_000;
    else return false;
  }
  return Number.isFinite(n) && Math.abs(n) <= max;
}
function validate(payload) {
  const districts = Array.isArray(payload) ? payload : record(payload) && Array.isArray(payload.districts) ? payload.districts : null;
  if (!districts || districts.length < minimumDistricts) {
    throw new Error(`Incomplete Divar catalog: expected >= ${minimumDistricts} districts, got ${districts?.length ?? 0}.`);
  }
  const ids = new Set(), slugs = new Set();
  for (let i = 0; i < districts.length; i++) {
    const d = districts[i];
    if (!record(d)) throw new Error(`District ${i} is not an object.`);
    const id = String(d.id ?? "").trim(), name = String(d.name ?? "").trim(), slug = String(d.slug ?? "").trim();
    if (!id || !name || !slug) throw new Error(`District ${i} is missing id/name/slug.`);
    if (ids.has(id)) throw new Error(`Duplicate district id: ${id}`);
    if (slugs.has(slug)) throw new Error(`Duplicate district slug: ${slug}`);
    ids.add(id); slugs.add(slug);
    const loc = d.default_location;
    if (!record(loc) || !validCoordinate(loc.latitude ?? loc.lat, 90) ||
      !validCoordinate(loc.longitude ?? loc.lon ?? loc.lng, 180)) {
      throw new Error(`District "${name}" has invalid default_location; refusing to invent coordinates.`);
    }
    if (!Array.isArray(d.bbox) || d.bbox.length !== 4 ||
      !d.bbox.every((v) => typeof v === "number" && Number.isFinite(v))) {
      throw new Error(`District "${name}" has no exact four-number Divar bbox; refusing to invent a boundary.`);
    }
    const [west, south, east, north] = d.bbox;
    if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
      throw new Error(`District "${name}" has invalid bbox bounds.`);
    }
  }
  return districts;
}

const response = await fetch(sourceUrl, {
  headers: {
    accept: "application/json",
    "user-agent": "Mozilla/5.0 (compatible; HirmandRealEstate/1.0; DivarCatalogSync)",
    origin: "https://divar.ir", referer: "https://divar.ir/",
  },
  signal: AbortSignal.timeout(15_000),
});
if (!response.ok) throw new Error(`Divar catalog request failed: HTTP ${response.status}`);
const districts = validate(await response.json());

let previous = null;
try { previous = JSON.parse(await readFile(outputPath, "utf8")); } catch {}
const unchanged = previous && Array.isArray(previous.districts) &&
  JSON.stringify(previous.districts) === JSON.stringify(districts);
if (unchanged) {
  console.log(`Divar Isfahan catalog unchanged (${districts.length} districts); keeping old snapshot timestamp.`);
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify({
    schemaVersion: 1, city: { id: cityId, slug: "isfahan" }, sourceUrl,
    fetchedAt: new Date().toISOString(), districts,
  }, null, 2) + "\\n", "utf8");
  console.log(`Stored ${districts.length} raw Divar district records at ${outputPath}.`);
}
const withPolygon = districts.filter((d) =>
  (Array.isArray(d.multi_polygon) && d.multi_polygon.length > 0) ||
  (Array.isArray(d.multi_polygon_encoded) && d.multi_polygon_encoded.length > 0) ||
  (typeof d.polygon_encoded === "string" && d.polygon_encoded.trim().length > 0)
).length;
console.log(JSON.stringify({ cityId, districts: districts.length, polygonBoundariesFromDivar: withPolygon, bboxOnlyFromDivar: districts.length - withPolygon }, null, 2));
