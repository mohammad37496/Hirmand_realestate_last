export function toExactPublicOfferAmount(value: unknown): string | null {
  if (value == null) return null;
  const amount = String(value).trim();
  return /^-?\d+(?:\.\d+)?$/.test(amount) ? amount : null;
}
