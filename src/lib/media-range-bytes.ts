/** Return a stored byte range only when the database returned the exact requested length. */
export function exactMediaRangeBytes(
  raw: Uint8Array | undefined,
  expectedLength: number,
): Uint8Array | null {
  if (!raw || !Number.isSafeInteger(expectedLength) || expectedLength < 0) return null;
  return raw.byteLength === expectedLength ? raw : null;
}
