import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import divarIsfahanSnapshot from "../../data/divar-isfahan-neighborhoods.json";
import { cachedPropertyRead } from "@/lib/property-read-cache.server";
import { getSql } from "@/lib/db";
import {
  assertIsfahanDistricts,
  divarDistrictsToClientItems,
  normalizeDivarDistrictCatalog,
  normalizeDivarNeighborhoodName,
  type DivarNeighborhoodItem,
  type DivarNeighborhoodClientItem,
} from "@/lib/divar-neighborhood-geometry";

const CITIES_URL = "https://api.divar.ir/v8/places/cities";
const DISTRICTS_URL = "https://api.divar.ir/v8/places/cities";
const MINIMUM_DISTRICTS = 50;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type DivarCity = { id: string; slug: "isfahan"; display: string };

export type DivarNeighborhoodCatalogResult = {
  items: DivarNeighborhoodClientItem[];
  source: "live" | "database" | "snapshot";
  fetchedAt: string | null;
  cityId: string;
  boundaryAvailability: { polygonCount: number; bboxOnlyCount: number };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function faKey(value: unknown): string {
  return normalizeDivarNeighborhoodName(text(value));
}

function cityIdOf(value: Record<string, unknown>): string {
  return text(value.id ?? value.city_id ?? value.cityId ?? value.value);
}

function collectCityCandidates(payload: unknown, out: Array<{ id: string; display: string }> = [], depth = 0) {
  if (depth > 12 || payload == null) return out;
  if (Array.isArray(payload)) {
    for (const item of payload) collectCityCandidates(item, out, depth + 1);
    return out;
  }
  if (!isRecord(payload)) return out;

  const slug = text(payload.slug ?? payload.city_slug ?? payload.citySlug ?? payload.name_en);
  const display = text(payload.display ?? payload.name ?? payload.title ?? payload.city_name ?? payload.persian_name);
  const exactSlugMatch = slug.toLowerCase() === "isfahan";
  const exactPersianMatch = faKey(display) === "اصفهان";
  const exactEnglishNameMatch = display.toLowerCase() === "isfahan";
  const id = cityIdOf(payload);
  if (id && (exactSlugMatch || exactPersianMatch || exactEnglishNameMatch)) {
    out.push({ id, display: display || "اصفهان" });
  }

  for (const [key, child] of Object.entries(payload)) {
    // Avoid walking generic metadata strings as separate cities.
    if (key === "cities" || key === "items" || key === "results" || key === "data" || isRecord(child) || Array.isArray(child)) {
      collectCityCandidates(child, out, depth + 1);
    }
  }
  return out;
}

async function fetchDivarJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Mozilla/5.0 (compatible; HirmandRealEstate/1.0; neighborhood-catalog)",
      origin: "https://divar.ir",
      referer: "https://divar.ir/",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Divar API returned HTTP ${response.status} for ${url}`);
  return response.json() as Promise<unknown>;
}

async function resolveIsfahanCity(): Promise<DivarCity> {
  const payload = await fetchDivarJson(CITIES_URL);
  const unique = new Map<string, { id: string; display: string }>();
  for (const candidate of collectCityCandidates(payload)) unique.set(candidate.id, candidate);
  if (unique.size !== 1) {
    throw new Error(
      `Could not uniquely resolve Isfahan from Divar's own city directory (matches: ${[...unique.keys()].join(", ") || "none"}).`,
    );
  }
  const candidate = [...unique.values()][0];
  return { id: candidate.id, slug: "isfahan", display: candidate.display };
}

function parseCatalog(payload: unknown, cityId: string) {
  const items = normalizeDivarDistrictCatalog(payload, { cityId, minimumDistricts: MINIMUM_DISTRICTS });
  assertIsfahanDistricts(items);
  return items;
}

function polygonCounts(items: DivarNeighborhoodItem[]) {
  const polygonCount = items.filter((item) => item.boundaryType === "polygon").length;
  return { polygonCount, bboxOnlyCount: items.length - polygonCount };
}

function snapshotResult(): DivarNeighborhoodCatalogResult | null {
  try {
    const payload = divarIsfahanSnapshot as unknown;
    if (!isRecord(payload) || !isRecord(payload.city) || text(payload.city.slug).toLowerCase() !== "isfahan") return null;
    const cityId = text(payload.city.id);
    if (!cityId) return null;
    const items = parseCatalog(payload, cityId);
    const fetchedAt = typeof payload.fetchedAt === "string" ? payload.fetchedAt : null;
    return {
      items: divarDistrictsToClientItems(items),
      source: "snapshot",
      fetchedAt,
      cityId,
      boundaryAvailability: polygonCounts(items),
    };
  } catch (error) {
    console.warn("[divar-neighborhoods] bundled snapshot rejected", error);
    return null;
  }
}

async function databaseResult(cityId: string): Promise<DivarNeighborhoodCatalogResult | null> {
  try {
    const sql = await getSql();
    const rows = await sql.query<{ source_payload: unknown; source_updated_at: string | Date }>(
      "select source_payload, source_updated_at from divar_neighborhood_catalog where city_id = $1 and is_active = true order by name asc",
      [cityId],
    );
    if (rows.length < MINIMUM_DISTRICTS) return null;
    const items = parseCatalog({ districts: rows.map((row) => row.source_payload) }, cityId);
    const times = rows.map((row) => new Date(row.source_updated_at).getTime()).filter(Number.isFinite);
    return {
      items: divarDistrictsToClientItems(items),
      source: "database",
      fetchedAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
      cityId,
      boundaryAvailability: polygonCounts(items),
    };
  } catch (error) {
    console.warn("[divar-neighborhoods] persisted catalog unavailable", error);
    return null;
  }
}

function jsonValue(value: unknown) {
  return JSON.stringify(value === undefined ? null : value);
}

async function persistCatalog(items: DivarNeighborhoodItem[], cityId: string, fetchedAt: string) {
  const sql = await getSql();
  const jsonPositions = new Set([8, 9, 10, 11, 12, 14, 15, 16]);
  const params: unknown[] = [];
  const valueRows = items.map((item) => {
    const base = params.length;
    params.push(
      cityId, item.id, item.name, item.slug, item.secondSlug,
      item.defaultLocation.latitude, item.defaultLocation.longitude,
      jsonValue(item.sourcePayload.default_location ?? item.defaultLocation),
      jsonValue(item.sourcePayload.centroid ?? null),
      jsonValue(item.sourcePayload.bbox ?? item.bbox),
      jsonValue(item.neighbors), jsonValue(item.tags), item.polygonEncoded,
      jsonValue(item.multiPolygonEncoded), jsonValue(item.multiPolygon),
      jsonValue(item.sourcePayload), fetchedAt, true,
    );
    return "(" + Array.from({ length: 18 }, (_, i) => {
      const position = i + 1;
      const p = "$" + (base + position);
      return jsonPositions.has(position) ? p + "::jsonb" : p;
    }).join(", ") + ")";
  });
  await sql.query(
    `insert into divar_neighborhood_catalog (
      city_id, district_id, name, slug, second_slug, center_lat, center_lng,
      default_location, centroid, bbox, neighbors, tags, polygon_encoded,
      multi_polygon_encoded, multi_polygon, source_payload, source_updated_at, is_active
    ) values ${valueRows.join(", ")}
    on conflict (city_id, district_id) do update set
      name=excluded.name, slug=excluded.slug, second_slug=excluded.second_slug,
      center_lat=excluded.center_lat, center_lng=excluded.center_lng,
      default_location=excluded.default_location, centroid=excluded.centroid,
      bbox=excluded.bbox, neighbors=excluded.neighbors, tags=excluded.tags,
      polygon_encoded=excluded.polygon_encoded,
      multi_polygon_encoded=excluded.multi_polygon_encoded,
      multi_polygon=excluded.multi_polygon, source_payload=excluded.source_payload,
      source_updated_at=excluded.source_updated_at, is_active=true`,
    params,
  );
  await sql.query(
    "update divar_neighborhood_catalog set is_active = false where city_id = $1 and not (district_id = any($2::text[]))",
    [cityId, items.map((item) => item.id)],
  );
}

async function loadDivarCatalog(): Promise<DivarNeighborhoodCatalogResult> {
  try {
    // Never hardcode a city ID: the public directory is the source of truth.
    const city = await resolveIsfahanCity();
    const sourceUrl = `${DISTRICTS_URL}/${encodeURIComponent(city.id)}/districts`;
    const payload = await fetchDivarJson(sourceUrl);
    const items = parseCatalog(payload, city.id);
    const fetchedAt = new Date().toISOString();
    try {
      await persistCatalog(items, city.id, fetchedAt);
    } catch (error) {
      console.warn("[divar-neighborhoods] could not persist live catalog", error);
    }
    return {
      items: divarDistrictsToClientItems(items),
      source: "live",
      fetchedAt,
      cityId: city.id,
      boundaryAvailability: polygonCounts(items),
    };
  } catch (error) {
    console.warn("[divar-neighborhoods] live source unavailable; checking validated fallbacks", error);
    const bundled = snapshotResult();
    if (bundled) return bundled;
    try {
      const city = await resolveIsfahanCity();
      const persisted = await databaseResult(city.id);
      if (persisted) return persisted;
    } catch (fallbackError) {
      console.warn("[divar-neighborhoods] could not resolve Isfahan for DB fallback", fallbackError);
    }
    throw new Error("کاتالوگ مکانی دیوار اصفهان معتبر یا در دسترس نیست؛ هیچ مختصات یا مرزی حدس زده نمی‌شود.");
  }
}

export const listDivarNeighborhoodCatalog = createServerFn({ method: "GET" }).handler(
  async (): Promise<DivarNeighborhoodCatalogResult> => {
    setResponseHeader("cache-control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600");
    return cachedPropertyRead("divar-neighborhood-catalog:isfahan:v2", CACHE_TTL_MS, loadDivarCatalog);
  },
);
