export type PropertyWatermarkSettings = {
  enabled: boolean;
  showLogo: boolean;
  showText: boolean;
  text: string;
  opacity: number;
  size: number;
};

export const DEFAULT_PROPERTY_WATERMARK: PropertyWatermarkSettings = {
  enabled: true,
  showLogo: true,
  showText: true,
  text: "املاک هیرمند",
  opacity: 0.82,
  size: 1,
};

let cachedSettings: PropertyWatermarkSettings | null = null;
let inFlight: Promise<PropertyWatermarkSettings> | null = null;

export async function getPropertyWatermarkSettings(): Promise<PropertyWatermarkSettings> {
  if (typeof window === "undefined") return DEFAULT_PROPERTY_WATERMARK;
  if (cachedSettings) return cachedSettings;
  if (inFlight) return inFlight;

  inFlight = fetch("/api/public-watermark", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  })
    .then((response) => (response.ok ? response.json() : DEFAULT_PROPERTY_WATERMARK))
    .then((value) => ({
      enabled: value?.enabled !== false,
      showLogo: value?.showLogo !== false,
      showText: value?.showText !== false,
      text: typeof value?.text === "string" && value.text.trim() ? value.text.trim() : DEFAULT_PROPERTY_WATERMARK.text,
      opacity: Number.isFinite(Number(value?.opacity)) ? Math.min(1, Math.max(0.2, Number(value.opacity))) : DEFAULT_PROPERTY_WATERMARK.opacity,
      size: Number.isFinite(Number(value?.size)) ? Math.min(1.6, Math.max(0.6, Number(value.size))) : DEFAULT_PROPERTY_WATERMARK.size,
    }))
    .catch(() => DEFAULT_PROPERTY_WATERMARK)
    .finally(() => {
      inFlight = null;
    });

  const result = await inFlight;
  cachedSettings = result;
  return result;
}

export function invalidatePropertyWatermarkSettings() {
  cachedSettings = null;
}

export function watermarkIsVisible(settings: PropertyWatermarkSettings) {
  return settings.enabled && (settings.showLogo || (settings.showText && settings.text.trim()));
}


export function isPermanentlyWatermarkedVideoUrl(value: string | null | undefined): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  return /-watermarked\.mp4(?:[?#]|$)/i.test(value);
}


export function isPermanentlyWatermarkedMediaUrl(value: string | null | undefined): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  return /-watermarked\.(?:webp|mp4)(?:[?#]|$)/i.test(value);
}
