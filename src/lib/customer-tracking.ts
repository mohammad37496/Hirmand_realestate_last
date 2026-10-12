const CUSTOMER_TRACKING_KEY = "hirmand:customer:tracking-codes";
const MAX_CUSTOMER_CODES = 8;

export type CustomerTrackingSummary = {
  trackingCode: string;
  savedAt: string;
};

export function normalizeCustomerTrackingCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function readCustomerTrackingCodes(): CustomerTrackingSummary[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOMER_TRACKING_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is { trackingCode: unknown; savedAt?: unknown } => Boolean(item) && typeof item === "object")
      .map((item) => ({
        trackingCode: normalizeCustomerTrackingCode(String(item.trackingCode ?? "")),
        savedAt: typeof item.savedAt === "string" ? item.savedAt : new Date().toISOString(),
      }))
      .filter((item) => /^HIR-[A-Z0-9]{2}-[A-F0-9]{12}$/.test(item.trackingCode))
      .filter((item, index, list) => list.findIndex((other) => other.trackingCode === item.trackingCode) === index)
      .slice(0, MAX_CUSTOMER_CODES);
  } catch {
    return [];
  }
}

function persist(items: CustomerTrackingSummary[]) {
  try {
    window.localStorage.setItem(CUSTOMER_TRACKING_KEY, JSON.stringify(items.slice(0, MAX_CUSTOMER_CODES)));
  } catch {
    // Storage is optional; the current page should remain usable.
  }
}

export function rememberCustomerTrackingCode(value: string) {
  if (typeof window === "undefined") return;
  const trackingCode = normalizeCustomerTrackingCode(value);
  if (!/^HIR-[A-Z0-9]{2}-[A-F0-9]{12}$/.test(trackingCode)) return;
  const current = readCustomerTrackingCodes();
  persist([{ trackingCode, savedAt: new Date().toISOString() }, ...current.filter((item) => item.trackingCode !== trackingCode)]);
  window.dispatchEvent(new CustomEvent("hirmand:tracking-codes-changed"));
}

export function forgetCustomerTrackingCode(value: string) {
  if (typeof window === "undefined") return;
  const trackingCode = normalizeCustomerTrackingCode(value);
  persist(readCustomerTrackingCodes().filter((item) => item.trackingCode !== trackingCode));
  window.dispatchEvent(new CustomEvent("hirmand:tracking-codes-changed"));
}

export function clearCustomerTrackingCodes() {
  if (typeof window === "undefined") return;
  persist([]);
  window.dispatchEvent(new CustomEvent("hirmand:tracking-codes-changed"));
}
