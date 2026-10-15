import { DIVAR_ISFAHAN_CATALOG, type DivarDistrictRecord, type DivarBbox } from "@/lib/divar-neighborhoods-isfahan.generated";

export type AreaGeography = {
  lat: number;
  lng: number;
  zoom: number;
  source: "Divar" | "OpenStreetMap";
  sourceUrl: string;
  precision: "catalog-center" | "reference-point";
  boundaryStatus: "polygon-available" | "bbox-only" | "reference-point-only";
  divarId?: number;
  divarSlug?: string;
  bbox?: DivarBbox;
  radius?: number;
  tags?: Array<{ title: string; type: string }>;
};

/** Normalize punctuation, spacing and Persian/Arabic letter variants before matching names. */
export function normalizeNeighborhoodKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("fa-IR")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[\u200c\u200d\sـ]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function usablePoint(point: { latitude: number; longitude: number } | null | undefined) {
  if (!point) return null;
  const { latitude, longitude } = point;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < 30 || latitude > 35 || longitude < 49 || longitude > 54) return null;
  return { latitude, longitude };
}

function usableBbox(value: DivarBbox | null | undefined): DivarBbox | null {
  if (!value || value.length !== 4 || value.some((part) => !Number.isFinite(part))) return null;
  const [west, south, east, north] = value;
  if (west < 49 || east > 54 || south < 30 || north > 35 || west >= east || south >= north) return null;
  return value;
}

function pointFromDistrict(district: DivarDistrictRecord) {
  const point = usablePoint(district.default_location) ?? usablePoint(district.centroid);
  const bbox = usableBbox(district.bbox);
  if (point) return point;
  if (bbox) {
    return {
      latitude: (bbox[1] + bbox[3]) / 2,
      longitude: (bbox[0] + bbox[2]) / 2,
    };
  }
  return null;
}

function geographyFromDistrict(district: DivarDistrictRecord): AreaGeography | null {
  const point = pointFromDistrict(district);
  if (!point) return null;
  const bbox = usableBbox(district.bbox) ?? undefined;
  const hasPolygon = Boolean(district.multi_polygon?.length || district.multi_polygon_encoded?.length || district.polygon_encoded);
  return {
    lat: point.latitude,
    lng: point.longitude,
    zoom: 14,
    source: DIVAR_ISFAHAN_CATALOG.source === "Divar" && district.id != null ? "Divar" : "OpenStreetMap",
    sourceUrl: DIVAR_ISFAHAN_CATALOG.source === "Divar" && district.id != null
      ? "https://divar.ir/s/isfahan"
      : "https://www.openstreetmap.org",
    precision: "catalog-center",
    boundaryStatus: hasPolygon ? "polygon-available" : bbox ? "bbox-only" : "reference-point-only",
    ...(district.id != null && DIVAR_ISFAHAN_CATALOG.source === "Divar" ? { divarId: district.id } : {}),
    ...(district.slug ? { divarSlug: district.slug } : {}),
    ...(bbox ? { bbox } : {}),
    ...(district.radius != null ? { radius: district.radius } : {}),
    ...(district.tags ? { tags: district.tags } : {}),
  };
}

const FALLBACK: DivarDistrictRecord[] = DIVAR_ISFAHAN_CATALOG.districts;

export function listDivarNeighborhoods(): DivarDistrictRecord[] {
  return DIVAR_ISFAHAN_CATALOG.source === "Divar" ? DIVAR_ISFAHAN_CATALOG.districts : [];
}

export function getAreaGeography(slug: string, name?: string): AreaGeography | null {
  const targetName = normalizeNeighborhoodKey(name ?? slug);
  const targetSlug = normalizeNeighborhoodKey(slug);
  const district = FALLBACK.find((item) => {
    const nameKey = normalizeNeighborhoodKey(item.name);
    if (targetName && nameKey === targetName) return true;
    if (targetSlug && (
      normalizeNeighborhoodKey(item.slug) === targetSlug ||
      normalizeNeighborhoodKey(item.second_slug ?? "") === targetSlug
    )) return true;
    return false;
  });
  if (district) return geographyFromDistrict(district);

  // Known OpenStreetMap reference point remains a safe fallback until the Divar
  // catalog returns a matching row; it is explicitly not a neighborhood boundary.
  if (
    targetSlug === normalizeNeighborhoodKey("شهرک-ولیعصر") ||
    targetName === normalizeNeighborhoodKey("شهرک ولی‌عصر")
  ) {
    return {
      lat: 32.73888,
      lng: 51.66175,
      zoom: 14,
      source: "OpenStreetMap",
      sourceUrl: "https://www.openstreetmap.org/node/4414536430",
      precision: "reference-point",
      boundaryStatus: "reference-point-only",
    };
  }
  return null;
}
