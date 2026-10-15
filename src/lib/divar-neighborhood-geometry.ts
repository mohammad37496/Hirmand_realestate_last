/**
 * Lossless parsing of Divar's Isfahan neighborhood catalog.
 * Divar bbox order is [west, south, east, north]. Never manufacture a polygon
 * from bbox: expose only geometry that Divar itself returns.
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type GeoCoordinate = { latitude: number; longitude: number };
export type DivarBbox = [number, number, number, number];
export type DivarBoundaryType = "polygon" | "bbox";

export type DivarNeighborhoodItem = {
  cityId: string;
  id: string;
  name: string;
  slug: string;
  secondSlug: string | null;
  level: string | null;
  radius: number | null;
  centroid: GeoCoordinate | null;
  defaultLocation: GeoCoordinate;
  bbox: DivarBbox;
  neighbors: JsonValue[];
  tags: JsonValue[];
  polygonEncoded: string;
  multiPolygonEncoded: JsonValue[];
  multiPolygon: JsonValue[];
  boundaryType: DivarBoundaryType;
  sourcePayload: Record<string, unknown>;
};
export type DivarNeighborhoodClientItem = Omit<DivarNeighborhoodItem, "sourcePayload">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function coordinateNumber(value: unknown, max: number): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  let parsed = Number(String(value).trim());
  if (!Number.isFinite(parsed)) return null;
  if (Math.abs(parsed) > max) {
    const magnitude = Math.abs(parsed);
    if (magnitude >= 100_000_000) parsed /= 10_000_000;
    else if (magnitude >= 10_000_000) parsed /= 1_000_000;
    else return null;
  }
  return Number.isFinite(parsed) && Math.abs(parsed) <= max ? parsed : null;
}

function coordinateFrom(value: unknown): GeoCoordinate | null {
  if (!isRecord(value)) return null;
  const latitude = coordinateNumber(value.latitude ?? value.lat ?? value.latitude_e7 ?? value.lat_e7, 90);
  const longitude = coordinateNumber(value.longitude ?? value.lon ?? value.lng ?? value.longitude_e7 ?? value.lon_e7 ?? value.lng_e7, 180);
  return latitude == null || longitude == null ? null : { latitude, longitude };
}

function numericBbox(value: unknown): DivarBbox | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const values = value.map((part) =>
    typeof part === "number" || typeof part === "string" ? Number(part) : Number.NaN,
  );
  const [west, south, east, north] = values;
  if (!values.every(Number.isFinite)) return null;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) return null;
  return [west, south, east, north];
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const result = String(value).trim();
  return result || null;
}

export function normalizeDivarNeighborhoodName(value: string): string {
  return value.normalize("NFKC")
    .replace(/ي/g, "ی").replace(/ك/g, "ک")
    .replaceAll("\u200c", " ").replaceAll("\u200d", "").replaceAll("\u200e", "").replaceAll("\u200f", "").replaceAll("\u0640", "")
    .replace(/[\s\u00a0]+/g, " ").trim().toLocaleLowerCase("fa");
}

export function normalizeDivarDistrict(value: unknown, cityId = "3"): DivarNeighborhoodItem {
  if (!isRecord(value)) throw new Error("Divar district entry is not an object.");
  const id = nonEmptyString(value.id);
  const name = nonEmptyString(value.name);
  const slug = nonEmptyString(value.slug);
  const defaultLocation = coordinateFrom(value.default_location ?? value.defaultLocation);
  const bbox = numericBbox(value.bbox);
  if (!id || !name || !slug) throw new Error("Divar district is missing id, name, or slug.");
  if (!defaultLocation) throw new Error(`Divar district "${name}" has no valid default_location; refusing to invent coordinates.`);
  if (!bbox) throw new Error(`Divar district "${name}" has no valid Divar bbox; refusing to invent a boundary.`);

  const centroid = coordinateFrom(value.centroid);
  const multiPolygon = Array.isArray(value.multi_polygon) ? value.multi_polygon : [];
  const multiPolygonEncoded = Array.isArray(value.multi_polygon_encoded) ? value.multi_polygon_encoded : [];
  const polygonEncoded = typeof value.polygon_encoded === "string" ? value.polygon_encoded : "";
  const boundaryType =
    multiPolygon.length || multiPolygonEncoded.length || polygonEncoded.trim().length ? "polygon" : "bbox";

  return {
    cityId, id, name, slug, secondSlug: nonEmptyString(value.second_slug),
    level: nonEmptyString(value.level),
    radius: typeof value.radius === "number" && Number.isFinite(value.radius) ? value.radius : null,
    centroid, defaultLocation, bbox,
    neighbors: Array.isArray(value.neighbors) ? value.neighbors as JsonValue[] : [],
    tags: Array.isArray(value.tags) ? value.tags as JsonValue[] : [],
    polygonEncoded, multiPolygonEncoded: multiPolygonEncoded as JsonValue[], multiPolygon: multiPolygon as JsonValue[], boundaryType,
    sourcePayload: value,
  };
}

export function normalizeDivarDistrictCatalog(
  payload: unknown,
  options: { cityId?: string; minimumDistricts?: number } = {},
): DivarNeighborhoodItem[] {
  const cityId = options.cityId ?? "3";
  const min = options.minimumDistricts ?? 1;
  const records = Array.isArray(payload) ? payload :
    isRecord(payload) && Array.isArray(payload.districts) ? payload.districts : null;
  if (!records || records.length < min) {
    throw new Error(`Divar district catalog is incomplete: expected at least ${min} records, received ${records?.length ?? 0}.`);
  }
  const result = records.map((record) => normalizeDivarDistrict(record, cityId));
  const ids = new Set<string>();
  const slugs = new Set<string>();
  for (const item of result) {
    if (ids.has(item.id)) throw new Error(`Duplicate Divar district id: ${item.id}`);
    if (slugs.has(item.slug)) throw new Error(`Duplicate Divar district slug: ${item.slug}`);
    ids.add(item.id); slugs.add(item.slug);
  }
  return result;
}

export function divarDistrictsToClientItems(items: DivarNeighborhoodItem[]): DivarNeighborhoodClientItem[] {
  return items.map(({ sourcePayload: _sourcePayload, ...item }) => item);
}


/**
 * Fail-closed sanity check that catches city-ID mismatches.
 * These broad bounds are a source-validation fence only; they are never used
 * to compute coordinates, assign districts, or manufacture neighborhood
 * boundaries. The geometry itself always comes from Divar.
 */
export function assertIsfahanDistricts(
  items: DivarNeighborhoodItem[],
  minimumInRegionRatio = 0.95,
): void {
  if (!items.length) throw new Error("Divar Isfahan catalog is empty.");
  const inIsfahanRegion = items.filter(({ defaultLocation }) =>
    defaultLocation.latitude >= 31 &&
    defaultLocation.latitude <= 34 &&
    defaultLocation.longitude >= 49 &&
    defaultLocation.longitude <= 54
  ).length;
  const ratio = inIsfahanRegion / items.length;
  if (ratio < minimumInRegionRatio) {
    throw new Error(
      `Divar city-ID mismatch suspected: only ${Math.round(ratio * 100)}% of ${items.length} district centers fall in the broad Isfahan validation region; refusing to label this data as Isfahan.`,
    );
  }
}
