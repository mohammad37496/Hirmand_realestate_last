export function normalizeFileCodeInput(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-F0-9]/g, "").slice(0, 8);
}

export function fileCodeLookupSuffix(value: string): string | null {
  const normalized = normalizeFileCodeInput(value);
  if (normalized.length !== 6 && normalized.length !== 8) return null;
  return normalized.slice(-6);
}
