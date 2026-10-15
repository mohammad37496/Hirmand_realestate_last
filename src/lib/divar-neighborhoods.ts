import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import divarIsfahanSnapshot from "../../data/divar-isfahan-neighborhoods.json";
import { cachedPropertyRead } from "@/lib/property-read-cache.server";
import { getSql } from "@/lib/db";
import {
  divarDistrictsToClientItems, normalizeDivarDistrictCatalog,
  type DivarNeighborhoodItem, type DivarNeighborhoodClientItem,
} from "@/lib/divar-neighborhood-geometry";

const CITY_ID = "3";
const SOURCE_URL = "https://api.divar.ir/v8/places/cities/3/districts";
const MINIMUM_DISTRICTS = 50;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type DivarNeighborhoodCatalogResult = {
  items: DivarNeighborhoodClientItem[];
  source: "live" | "database" | "snapshot";
  fetchedAt: string | null;
};

function parseCatalog(payload: unknown) {
  return normalizeDivarDistrictCatalog(payload, { cityId: CITY_ID, minimumDistricts: MINIMUM_DISTRICTS });
}

function snapshotResult(): DivarNeighborhoodCatalogResult | null {
  try {
    const payload = divarIsfahanSnapshot as unknown;
    const items = parseCatalog(payload);
    const fetchedAt = payload && typeof payload === "object" && "fetchedAt" in payload &&
      typeof (payload as { fetchedAt?: unknown }).fetchedAt === "string"
      ? (payload as { fetchedAt: string }).fetchedAt : null;
    return { items: divarDistrictsToClientItems(items), source: "snapshot", fetchedAt };
  } catch { return null; }
}

async function databaseResult(): Promise<DivarNeighborhoodCatalogResult | null> {
  try {
    const sql = await getSql();
    const rows = await sql.query<{ source_payload: unknown; source_updated_at: string | Date }>(
      "select source_payload, source_updated_at from divar_neighborhood_catalog where city_id = $1 and is_active = true order by name asc",
      [CITY_ID],
    );
    if (rows.length < MINIMUM_DISTRICTS) return null;
    const items = parseCatalog({ districts: rows.map((row) => row.source_payload) });
    const times = rows.map((row) => new Date(row.source_updated_at).getTime()).filter(Number.isFinite);
    return {
      items: divarDistrictsToClientItems(items),
      source: "database",
      fetchedAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
    };
  } catch (error) {
    console.warn("[divar-neighborhoods] persisted catalog unavailable", error);
    return null;
  }
}

function jsonValue(value: unknown) {
  return JSON.stringify(value === undefined ? null : value);
}

async function persistCatalog(items: DivarNeighborhoodItem[], fetchedAt: string) {
  const sql = await getSql();
  const jsonPositions = new Set([8, 9, 10, 11, 12, 14, 15, 16]);
  const params: unknown[] = [];
  const valueRows = items.map((item) => {
    const base = params.length;
    params.push(
      CITY_ID, item.id, item.name, item.slug, item.secondSlug,
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
    [CITY_ID, items.map((item) => item.id)],
  );
}

async function loadDivarCatalog(): Promise<DivarNeighborhoodCatalogResult> {
  try {
    const response = await fetch(SOURCE_URL, {
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0 (compatible; HirmandRealEstate/1.0; neighborhood-catalog)",
        origin: "https://divar.ir", referer: "https://divar.ir/",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`Divar catalog returned HTTP ${response.status}`);
    const payload: unknown = await response.json();
    const items = parseCatalog(payload);
    const fetchedAt = new Date().toISOString();
    try { await persistCatalog(items, fetchedAt); }
    catch (error) { console.warn("[divar-neighborhoods] could not persist live catalog", error); }
    return { items: divarDistrictsToClientItems(items), source: "live", fetchedAt };
  } catch (error) {
    console.warn("[divar-neighborhoods] live source unavailable; using validated snapshots if present", error);
    const persisted = await databaseResult();
    if (persisted) return persisted;
    const bundled = snapshotResult();
    if (bundled) return bundled;
    throw new Error("کاتالوگ مکانی دیوار اصفهان در دسترس نیست؛ هیچ مختصات یا مرزی حدس زده نمی‌شود.");
  }
}

export const listDivarNeighborhoodCatalog = createServerFn({ method: "GET" }).handler(
  async (): Promise<DivarNeighborhoodCatalogResult> => {
    setResponseHeader("cache-control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600");
    return cachedPropertyRead("divar-neighborhood-catalog:isfahan:v1", CACHE_TTL_MS, loadDivarCatalog);
  },
);
