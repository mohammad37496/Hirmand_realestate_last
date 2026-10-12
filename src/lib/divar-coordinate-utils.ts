/** Parse Divar map coordinates without loading server-only code. */

export type DivarCoordinates = { latitude: number; longitude: number };

function normalizeCoordinate(value: unknown, max: number, integerScale = 1_000_000): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const raw = String(value).replace(/,/g, "").trim();
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.abs(parsed) > max ? parsed / integerScale : parsed;
  return Number.isFinite(normalized) && Math.abs(normalized) <= max ? normalized : null;
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
