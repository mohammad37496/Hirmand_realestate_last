/**
 * Pure WGS84 / Web Mercator helpers shared by the listings filter and map UI.
 *
 * Coordinate conventions:
 * - points are { latitude, longitude }
 * - query bounds are [westLongitude, southLatitude, eastLongitude, northLatitude]
 * - map projection uses Web Mercator world pixels (EPSG:3857 tiles), while
 *   persisted coordinates remain longitude/latitude degrees (EPSG:4326 / WGS84).
 */
export type CoordinateBounds = [west: number, south: number, east: number, north: number];
export type GeoPoint = { latitude: number; longitude: number };
export type PixelPoint = { x: number; y: number };
export type MapView = GeoPoint & { zoom: number };

export const TILE_SIZE = 256;
export const MIN_MAP_ZOOM = 0;
export const MAX_MAP_ZOOM = 18;
export const WEB_MERCATOR_MAX_LATITUDE = 85.0511287798066;
export const DEFAULT_MAP_VIEW: MapView = { latitude: 32.655, longitude: 51.668, zoom: 12 };

export function isValidWgs84Point(latitude: unknown, longitude: unknown): boolean {
  if (
    latitude === null || latitude === undefined || latitude === "" ||
    longitude === null || longitude === undefined || longitude === ""
  ) return false;
  const lat = typeof latitude === "number" ? latitude : Number(latitude);
  const lng = typeof longitude === "number" ? longitude : Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function normalizeCoordinateBounds(value: unknown): CoordinateBounds | undefined {
  if (!Array.isArray(value) || value.length !== 4) return undefined;
  if (value.some((part) => (typeof part !== "number" && typeof part !== "string") || String(part).trim() === "")) return undefined;
  const values = value.map((part) => Number(part));
  if (values.some((part) => !Number.isFinite(part))) return undefined;
  const [west, south, east, north] = values;
  if (
    west < -180 || west > 180 || east < -180 || east > 180 ||
    south < -90 || south > 90 || north < -90 || north > 90 ||
    west >= east || south >= north
  ) return undefined;
  return [west, south, east, north];
}

export function parseCoordinateBounds(raw: string | null | undefined): CoordinateBounds | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  return normalizeCoordinateBounds(raw.split(",").map((value) => value.trim()));
}

export function boundsEqual(
  left: CoordinateBounds | undefined,
  right: CoordinateBounds | undefined,
  tolerance = 1e-7,
): boolean {
  if (!left || !right) return left === right;
  return left.every((value, index) => Math.abs(value - right[index]) <= tolerance);
}

/** Projects a WGS84 coordinate into Web Mercator world pixels at the given zoom. */
export function project(latitude: number, longitude: number, zoom: number): PixelPoint {
  const scale = TILE_SIZE * 2 ** zoom;
  const safeLatitude = Math.max(
    -WEB_MERCATOR_MAX_LATITUDE,
    Math.min(WEB_MERCATOR_MAX_LATITUDE, latitude),
  );
  const sin = Math.sin((safeLatitude * Math.PI) / 180);
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

/** Converts Web Mercator world pixels at the given zoom back to WGS84 degrees. */
export function unproject(point: PixelPoint, zoom: number): GeoPoint {
  const scale = TILE_SIZE * 2 ** zoom;
  const n = Math.PI - (2 * Math.PI * point.y) / scale;
  return {
    longitude: (point.x / scale) * 360 - 180,
    latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)),
  };
}

/**
 * Chooses a center and zoom that contains the complete bounds in the measured
 * map viewport. Divar bbox extents are rectangles, not true neighborhood polygons.
 */
export function fitBoundsToView(
  rawBounds: unknown,
  width: number,
  height: number,
  options: { padding?: number; minZoom?: number; maxZoom?: number } = {},
): MapView | null {
  const bounds = normalizeCoordinateBounds(rawBounds);
  if (!bounds || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;

  const padding = Math.max(0, Math.min(options.padding ?? 32, Math.min(width, height) / 3));
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const [west, south, east, north] = bounds;
  const topLeft = project(north, west, 0);
  const bottomRight = project(south, east, 0);
  const spanX = Math.max(1e-9, bottomRight.x - topLeft.x);
  const spanY = Math.max(1e-9, bottomRight.y - topLeft.y);
  const idealZoom = Math.floor(Math.log2(Math.min(availableWidth / spanX, availableHeight / spanY)));
  // A saved viewport can have been created on a much larger desktop. Allow
  // fitting below city-scale zoom on narrow mobile screens; forcing zoom >= 10
  // crops the visible map even though the property query still uses the full URL bbox.
  const minZoom = options.minZoom ?? MIN_MAP_ZOOM;
  const maxZoom = options.maxZoom ?? MAX_MAP_ZOOM;
  const zoom = Math.max(minZoom, Math.min(maxZoom, idealZoom));
  const center = unproject({
    x: (topLeft.x + bottomRight.x) / 2,
    y: (topLeft.y + bottomRight.y) / 2,
  }, 0);
  return { latitude: center.latitude, longitude: center.longitude, zoom };
}

/** Returns real viewport bounds in [west, south, east, north] order. */
export function viewportBoundsFromView(
  view: MapView,
  width: number,
  height: number,
): CoordinateBounds | null {
  if (
    !isValidWgs84Point(view.latitude, view.longitude) ||
    !Number.isFinite(view.zoom) || view.zoom < 0 ||
    !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0
  ) return null;
  const center = project(view.latitude, view.longitude, view.zoom);
  const topLeft = unproject({ x: center.x - width / 2, y: center.y - height / 2 }, view.zoom);
  const bottomRight = unproject({ x: center.x + width / 2, y: center.y + height / 2 }, view.zoom);
  return normalizeCoordinateBounds([
    topLeft.longitude,
    bottomRight.latitude,
    bottomRight.longitude,
    topLeft.latitude,
  ]) ?? null;
}

/** Whether a valid WGS84 point lies inside inclusive viewport bounds. */
export function pointWithinBounds(
  latitude: unknown,
  longitude: unknown,
  rawBounds: unknown,
): boolean {
  if (!isValidWgs84Point(latitude, longitude)) return false;
  const bounds = normalizeCoordinateBounds(rawBounds);
  if (!bounds) return false;
  const lat = Number(latitude);
  const lng = Number(longitude);
  const [west, south, east, north] = bounds;
  return lng >= west && lng <= east && lat >= south && lat <= north;
}
