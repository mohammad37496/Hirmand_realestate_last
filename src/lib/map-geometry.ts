/**
 * Shared geographic contracts used by map rendering, query-string parsing,
 * Divar neighborhood metadata, and the public property query.
 *
 * Bounds are always [west longitude, south latitude, east longitude, north latitude]
 * in WGS84 degrees. Map tiles are projected separately to Web Mercator (EPSG:3857).
 */
export type CoordinateBounds = [west: number, south: number, east: number, north: number];

const MAX_MERCATOR_LATITUDE = 85.05112878;

export function isValidGeoPoint(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function isValidCoordinateBounds(value: unknown): value is CoordinateBounds {
  if (!Array.isArray(value) || value.length !== 4) return false;
  if (!value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))) return false;

  const [west, south, east, north] = value as number[];
  return (
    west >= -180 &&
    west <= 180 &&
    east >= -180 &&
    east <= 180 &&
    south >= -90 &&
    south <= 90 &&
    north >= -90 &&
    north <= 90 &&
    west < east &&
    south < north
  );
}

/** Parses a comma-separated W,S,E,N URL parameter. Malformed values fail closed. */
export function parseCoordinateBounds(raw: string | null | undefined): CoordinateBounds | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;

  const parts = raw.split(",");
  if (parts.length !== 4 || parts.some((part) => !part.trim())) return undefined;

  const values = parts.map((part) => Number(part.trim()));
  if (!isValidCoordinateBounds(values)) return undefined;
  return values;
}

/** Inclusive geographic check, useful for testing viewport filtering contracts. */
export function pointWithinBounds(
  latitude: unknown,
  longitude: unknown,
  bounds: unknown,
): boolean {
  if (!isValidGeoPoint(latitude, longitude) || !isValidCoordinateBounds(bounds)) return false;
  const [west, south, east, north] = bounds;
  return longitude >= west && longitude <= east && latitude >= south && latitude <= north;
}

function projectAtZoomZero(latitude: number, longitude: number): { x: number; y: number } {
  const clampedLatitude = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, latitude));
  const sin = Math.sin((clampedLatitude * Math.PI) / 180);
  return {
    x: ((longitude + 180) / 360) * 256,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * 256,
  };
}

/** Web-Mercator center of a bounds box; latitude is centered in projected space. */
export function coordinateBoundsCenter(bounds: unknown): { latitude: number; longitude: number } | undefined {
  if (!isValidCoordinateBounds(bounds)) return undefined;
  const [west, south, east, north] = bounds;
  const northWest = projectAtZoomZero(north, west);
  const southEast = projectAtZoomZero(south, east);
  const scale = 256;
  const n = Math.PI - (2 * Math.PI * ((northWest.y + southEast.y) / 2)) / scale;
  return {
    longitude: (west + east) / 2,
    latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)),
  };
}

/**
 * Chooses a zoom whose viewport contains the given W,S,E,N box.
 * With padding=0 this reconstructs a saved viewport at the same dimensions.
 * With padding > 0 it is appropriate for focusing a neighborhood bbox.
 */
export function zoomForCoordinateBounds(
  bounds: unknown,
  width: number,
  height: number,
  padding = 0,
  minZoom = 10,
  maxZoom = 18,
): number | undefined {
  if (!isValidCoordinateBounds(bounds)) return undefined;
  if (![width, height, padding, minZoom, maxZoom].every(Number.isFinite)) return undefined;
  if (width <= padding * 2 || height <= padding * 2 || padding < 0 || minZoom > maxZoom) return undefined;

  const [west, south, east, north] = bounds;
  const northWest = projectAtZoomZero(north, west);
  const southEast = projectAtZoomZero(south, east);
  const deltaX = Math.abs(southEast.x - northWest.x);
  const deltaY = Math.abs(southEast.y - northWest.y);
  if (deltaX <= 0 || deltaY <= 0) return maxZoom;

  const scale = Math.min(
    (width - padding * 2) / deltaX,
    (height - padding * 2) / deltaY,
  );
  if (!Number.isFinite(scale) || scale <= 0) return undefined;

  // A tiny epsilon neutralizes floating point noise for a saved viewport whose
  // bounds were derived from the same projection function.
  return Math.max(minZoom, Math.min(maxZoom, Math.floor(Math.log2(scale) + 1e-6)));
}
