#!/usr/bin/env node
/**
 * Fetch Isfahan's district catalog by resolving the city ID from Divar's own
 * city directory. Hard-coded IDs are unsafe: the previous value labelled a
 * Mashhad catalog as Isfahan, so location sanity checks are mandatory.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const citiesUrl = "https://api.divar.ir/v8/places/cities";
const outputPath = resolve("data/divar-isfahan-neighborhoods.json");
const minimumDistricts = Number.parseInt(process.env.DIVAR_ISFAHAN_MIN_DISTRICTS ?? "50", 10);
const region = { minLat: 31, maxLat: 34, minLon: 49, maxLon: 54 };

function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function norm(value) {
  return String(value ?? "").normalize("NFKC")
    .replace(/ي/g, "ی").replace(/ك/g, "ک")
    .replaceAll("\u200c", " ").replaceAll("\u200d", "").replaceAll("\u200e", "").replaceAll("\u200f", "").replaceAll("\u0640", "")
    .replace(/[\s\u00a0]+/g, " ").trim().toLowerCase();
}
function cityCandidates(payload, out = [], depth = 0) {
  if (depth > 12 || payload == null) return out;
  if (Array.isArray(payload)) { for (const item of payload) cityCandidates(item, out, depth + 1); return out; }
  if (!record(payload)) return out;
  const slug = String(payload.slug ?? payload.city_slug ?? payload.citySlug ?? payload.name_en ?? "").trim().toLowerCase();
  const display = String(payload.display ?? payload.name ?? payload.title ?? payload.city_name ?? payload.persian_name ?? "").trim();
  const id = String(payload.id ?? payload.city_id ?? payload.cityId ?? payload.value ?? "").trim();
  if (id && (slug === "isfahan" || norm(display) === "اصفهان" || display.toLowerCase() === "isfahan")) {
    out.push({ id, slug, display: display || "اصفهان" });
  }
  for (const [key, value] of Object.entries(payload)) {
    if (["cities","items","results","data"].includes(key) || record(value) || Array.isArray(value)) cityCandidates(value, out, depth + 1);
  }
  return out;
}
async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Mozilla/5.0 (compatible; HirmandRealEstate/1.0; DivarCatalogSync)",
      origin: "https://divar.ir", referer: "https://divar.ir/",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Divar API HTTP ${response.status}: ${url}`);
  return response.json();
}
function coordinate(value, max) {
  let number = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(number)) return null;
  if (Math.abs(number) > max) {
    if (Math.abs(number) >= 100_000_000) number /= 10_000_000;
    else if (Math.abs(number) >= 10_000_000) number /= 1_000_000;
    else return null;
  }
  return Number.isFinite(number) && Math.abs(number) <= max ? number : null;
}
function validateDistricts(payload) {
  const districts = Array.isArray(payload) ? payload : record(payload) && Array.isArray(payload.districts) ? payload.districts : null;
  if (!districts || districts.length < minimumDistricts) {
    throw new Error(`Incomplete Divar catalog: expected >= ${minimumDistricts} districts, got ${districts?.length ?? 0}.`);
  }
  const ids = new Set(), slugs = new Set();
  let regionCount = 0;
  for (let i = 0; i < districts.length; i++) {
    const d = districts[i];
    if (!record(d)) throw new Error(`District ${i} is not an object.`);
    const id = String(d.id ?? "").trim(), name = String(d.name ?? "").trim(), slug = String(d.slug ?? "").trim();
    if (!id || !name || !slug) throw new Error(`District ${i} is missing id/name/slug.`);
    if (ids.has(id)) throw new Error(`Duplicate district id: ${id}`);
    if (slugs.has(slug)) throw new Error(`Duplicate district slug: ${slug}`);
    ids.add(id); slugs.add(slug);
    const loc = d.default_location;
    const lat = record(loc) ? coordinate(loc.latitude ?? loc.lat, 90) : null;
    const lon = record(loc) ? coordinate(loc.longitude ?? loc.lon ?? loc.lng, 180) : null;
    if (lat == null || lon == null) throw new Error(`District "${name}" has invalid default_location; refusing to invent coordinates.`);
    if (lat >= region.minLat && lat <= region.maxLat && lon >= region.minLon && lon <= region.maxLon) regionCount++;
    if (!Array.isArray(d.bbox) || d.bbox.length !== 4 || !d.bbox.every((v) => typeof v === "number" && Number.isFinite(v))) {
      throw new Error(`District "${name}" has no exact four-number Divar bbox; refusing to invent a boundary.`);
    }
    const [west, south, east, north] = d.bbox;
    if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
      throw new Error(`District "${name}" has invalid bbox bounds.`);
    }
  }
  const ratio = regionCount / districts.length;
  if (ratio < 0.95) {
    throw new Error(`City-ID mismatch suspected: only ${Math.round(ratio * 100)}% of Divar district centers are inside the broad Isfahan sanity region. Snapshot not written.`);
  }
  return districts;
}

const cityPayload = await getJson(citiesUrl);
const matches = new Map(cityCandidates(cityPayload).map((city) => [city.id, city]));
if (matches.size !== 1) {
  throw new Error(`Could not resolve Isfahan uniquely from Divar's city directory. Matches: ${JSON.stringify([...matches.values()])}. Top-level keys: ${JSON.stringify(record(cityPayload) ? Object.keys(cityPayload) : [])}`);
}
const city = [...matches.values()][0];
const cityId = city.id;
const sourceUrl = `https://api.divar.ir/v8/places/cities/${encodeURIComponent(cityId)}/districts`;
const rawDistricts = validateDistricts(await getJson(sourceUrl));
const districts = rawDistricts.map((d) => ({
  id: d.id,
  name: String(d.name),
  slug: String(d.slug),
  second_slug: d.second_slug == null ? null : String(d.second_slug),
  default_location: {
    latitude: coordinate(d.default_location.latitude ?? d.default_location.lat, 90),
    longitude: coordinate(d.default_location.longitude ?? d.default_location.lon ?? d.default_location.lng, 180),
  },
  bbox: [...d.bbox],
}));

let previous = null;
try { previous = JSON.parse(await readFile(outputPath, "utf8")); } catch { /* No prior snapshot exists on the first run. */ }
const unchanged = previous && previous.city?.slug === "isfahan" &&
  String(previous.city?.id) === cityId && previous.sourceUrl === sourceUrl &&
  Array.isArray(previous.districts) && JSON.stringify(previous.districts) === JSON.stringify(districts);
if (unchanged) {
  console.log(`Divar Isfahan catalog unchanged: ${districts.length} districts; keeping snapshot timestamp.`);
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify({
    schemaVersion: 1,
    city: { id: cityId, slug: "isfahan", display: city.display },
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    districts,
  }, null, 2) + "\n", "utf8");
  console.log(`Stored ${districts.length} raw Divar districts for ${city.display} (city_id=${cityId}).`);
}
const withPolygon = rawDistricts.filter((d) =>
  (Array.isArray(d.multi_polygon) && d.multi_polygon.length > 0) ||
  (Array.isArray(d.multi_polygon_encoded) && d.multi_polygon_encoded.length > 0) ||
  (typeof d.polygon_encoded === "string" && d.polygon_encoded.trim().length > 0)
).length;
console.log(JSON.stringify({
  city: city.display, cityId, slug: "isfahan", districts: districts.length,
  medianLatitude: [...districts].map(d => d.default_location.latitude).sort((a,b)=>a-b)[Math.floor(districts.length/2)],
  medianLongitude: [...districts].map(d => d.default_location.longitude).sort((a,b)=>a-b)[Math.floor(districts.length/2)],
  polygonBoundariesFromDivar: withPolygon, bboxOnlyFromDivar: districts.length - withPolygon,
}, null, 2));
