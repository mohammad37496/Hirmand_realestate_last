/** Parse Divar map coordinates without loading server-only code. */

export type DivarCoordinates = { latitude: number; longitude: number };

function normalizeCoordinate(value: unknown, max: number, integerScale?: number): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;

  const magnitude = Math.abs(parsed);
  if (magnitude <= max) return parsed;

  // Do not scale an arbitrary out-of-range degree value such as 999 into a
  // tiny valid-looking point. Encoded coordinate integers are at least E6.
  if (magnitude < 1_000_000) return null;

  const primaryScale = integerScale ??
    (magnitude >= 100_000_000 ? 10_000_000 : 1_000_000);
  const normalized = parsed / primaryScale;
  if (Number.isFinite(normalized) && Math.abs(normalized) <= max) return normalized;

  // Some older Divar payloads used a generic lat/lng key for E7 integers.
  // Retry E7 only when the E6 interpretation is outside the latitude or
  // longitude domain. Explicit *_e6 and *_e7 fields always keep their key scale.
  if (integerScale === undefined && primaryScale === 1_000_000 && magnitude >= 100_000_000) {
    const e7 = parsed / 10_000_000;
    if (Number.isFinite(e7) && Math.abs(e7) <= max) return e7;
  }
  return null;
}

/**
 * Divar has returned normal decimal coordinates, E6 integers and E7 integers.
 * Key-specific scaling matters: dividing an E7 latitude by 1e6 creates 326°
 * and silently drops the pin.
 */
export function findDivarCoordinates(value: unknown, depth = 0): DivarCoordinates | null {
  if (depth > 12 || value == null) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findDivarCoordinates(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;

  const obj = value as Record<string, unknown>;
  const keyMap = new Map(
    Object.entries(obj).map(([key, item]) => [
      key.toLowerCase().replace(/[\s_-]+/g, ""),
      item,
    ]),
  );

  const latitude =
    normalizeCoordinate(keyMap.get("latitude"), 90) ??
    normalizeCoordinate(keyMap.get("lat"), 90) ??
    normalizeCoordinate(keyMap.get("latitudee7"), 90, 10_000_000) ??
    normalizeCoordinate(keyMap.get("late7"), 90, 10_000_000) ??
    normalizeCoordinate(keyMap.get("latitudee6"), 90, 1_000_000) ??
    normalizeCoordinate(keyMap.get("late6"), 90, 1_000_000);
  const longitude =
    normalizeCoordinate(keyMap.get("longitude"), 180) ??
    normalizeCoordinate(keyMap.get("lng"), 180) ??
    normalizeCoordinate(keyMap.get("lon"), 180) ??
    normalizeCoordinate(keyMap.get("long"), 180) ??
    normalizeCoordinate(keyMap.get("longitudee7"), 180, 10_000_000) ??
    normalizeCoordinate(keyMap.get("lnge7"), 180, 10_000_000) ??
    normalizeCoordinate(keyMap.get("longitudee6"), 180, 1_000_000) ??
    normalizeCoordinate(keyMap.get("lnge6"), 180, 1_000_000);

  if (latitude != null && longitude != null) return { latitude, longitude };

  const preferredEntries = Object.entries(obj).sort(([a], [b]) => {
    const score = (key: string) =>
      /location|map|geo|coordinate|coordinates|موقعیت|نقشه/i.test(key) ? 0 : 1;
    return score(a) - score(b);
  });

  for (const [, item] of preferredEntries) {
    const found = findDivarCoordinates(item, depth + 1);
    if (found) return found;
  }
  return null;
}
