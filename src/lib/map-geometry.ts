export type CoordinateBounds = [west: number, south: number, east: number, north: number];
export type MapCenterView = { latitude: number; longitude: number; zoom: number };

const TILE_SIZE = 256;
const MAX_MERCATOR_LATITUDE = 85.05112878;

function numericCoordinate(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = typeof value === "number" ? value : Number(value.trim());
  return Number.isFinite(number) ? number : null;
}

export function isValidMapCoordinate(latitude: unknown, longitude: unknown): boolean {
  const lat = numericCoordinate(latitude);
  const lon = numericCoordinate(longitude);
  return lat !== null && lon !== null && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export function isValidCoordinateBounds(value: unknown): value is CoordinateBounds {
  if (!Array.isArray(value) || value.length !== 4) return false;
  if (value.some((part) => typeof part !== "number" || !Number.isFinite(part))) return false;

  const [west, south, east, north] = value as number[];
  return (
    west >= -180 && west <= 180 &&
    east >= -180 && east <= 180 &&
    south >= -90 && south <= 90 &&
    north >= -90 && north <= 90 &&
    west < east &&
    south < north
  );
}

/** URL order is west, south, east, north (longitude, latitude, longitude, latitude). */
export function parseCoordinateBounds(raw: unknown): CoordinateBounds | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const parts = raw.split(",");
  if (parts.length !== 4 || parts.some((part) => part.trim() === "")) return null;
  const values = parts.map((part) => Number(part.trim()));
  return isValidCoordinateBounds(values) ? values : null;
}

/** Inclusive point-in-bounds check using (latitude, longitude) for the point. */
export function isPointInsideBounds(
  latitude: unknown,
  longitude: unknown,
  bounds: unknown,
): boolean {
  if (!isValidMapCoordinate(latitude, longitude) || !isValidCoordinateBounds(bounds)) return false;
  const lat = Number(latitude);
  const lon = Number(longitude);
  const [west, south, east, north] = bounds;
  return lon >= west && lon <= east && lat >= south && lat <= north;
}

function mercatorY(latitude: number): number {
  const safeLatitude = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, latitude));
  const sin = Math.sin((safeLatitude * Math.PI) / 180);
  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
}

function inverseMercatorY(y: number): number {
  const n = Math.PI - 2 * Math.PI * y;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

export function fitCoordinateBounds(
  bounds: unknown,
  width: number,
  height: number,
  options: { minZoom?: number; maxZoom?: number; padding?: number } = {},
): MapCenterView | null {
  if (!isValidCoordinateBounds(bounds)) return null;

  const [west, south, east, north] = bounds;
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 920;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 640;
  const minZoom = Number.isFinite(options.minZoom) ? Math.max(0, options.minZoom as number) : 2;
  const maxZoom = Number.isFinite(options.maxZoom) ? Math.min(22, options.maxZoom as number) : 18;
  const padding = Number.isFinite(options.padding) ? Math.max(0, options.padding as number) : 24;
  const availableWidth = Math.max(1, safeWidth - padding * 2);
  const availableHeight = Math.max(1, safeHeight - padding * 2);

  const xWest = (west + 180) / 360;
  const xEast = (east + 180) / 360;
  const yNorth = mercatorY(north);
  const ySouth = mercatorY(south);
  const deltaX = Math.max(Number.EPSILON, xEast - xWest);
  const deltaY = Math.max(Number.EPSILON, ySouth - yNorth);
  const zoomX = Math.log2(availableWidth / (TILE_SIZE * deltaX));
  const zoomY = Math.log2(availableHeight / (TILE_SIZE * deltaY));
  const zoom = Math.max(minZoom, Math.min(maxZoom, Math.floor(Math.min(zoomX, zoomY))));

  const centerX = (xWest + xEast) / 2;
  const centerY = (yNorth + ySouth) / 2;
  return {
    longitude: centerX * 360 - 180,
    latitude: inverseMercatorY(centerY),
    zoom,
  };
}
