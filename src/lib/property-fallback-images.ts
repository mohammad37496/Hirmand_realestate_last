import type { PropertyType } from "@/lib/properties";

type FallbackMap = Record<PropertyType, readonly string[]>;

/**
 * Primary fallbacks point to photographic assets committed to the repository.
 * They are available even when a production build cannot reach external hosts.
 */
export const PROPERTY_FALLBACK_IMAGES: FallbackMap = {
  apartment: ["/images/type-apartment.jpg"],
  villa: ["/images/type-villa.jpg"],
  office: ["/images/type-office.jpg"],
  heritage: ["/images/type-heritage.jpg"],
  land: ["/images/fallback/land-01.jpg"],
  commercial: ["/images/fallback/commercial-01.jpg"],
};

const PROPERTY_FALLBACK_REMOTE_IMAGES: Partial<FallbackMap> = {
  apartment: [
    "https://images.pexels.com/photos/7546596/pexels-photo-7546596.jpeg?auto=compress&dpr=1&h=750&w=1260",
    "https://images.pexels.com/photos/7173672/pexels-photo-7173672.jpeg?auto=compress&dpr=1&h=750&w=1260",
    "https://images.pexels.com/photos/8142052/pexels-photo-8142052.jpeg?auto=compress&dpr=1&h=750&w=1260",
    "https://images.pexels.com/photos/6636258/pexels-photo-6636258.jpeg?auto=compress&dpr=1&h=750&w=1260",
    "https://images.pexels.com/photos/6447393/pexels-photo-6447393.jpeg?auto=compress&dpr=1&h=750&w=1260",
    "https://images.pexels.com/photos/7534559/pexels-photo-7534559.jpeg?auto=compress&dpr=1&h=750&w=1260",
  ],
};

const PEXELS_FALLBACK_PATHS = new Set([
  "/photos/7546596/pexels-photo-7546596.jpeg",
  "/photos/7173672/pexels-photo-7173672.jpeg",
  "/photos/8142052/pexels-photo-8142052.jpeg",
  "/photos/6636258/pexels-photo-6636258.jpeg",
  "/photos/6447393/pexels-photo-6447393.jpeg",
  "/photos/7534559/pexels-photo-7534559.jpeg",
  "/photos/6588599/pexels-photo-6588599.jpeg",
  "/photos/11296221/pexels-photo-11296221.jpeg",
  "/photos/6312353/pexels-photo-6312353.jpeg",
  "/photos/6527027/pexels-photo-6527027.jpeg",
  "/photos/6934188/pexels-photo-6934188.jpeg",
  "/photos/6316055/pexels-photo-6316055.jpeg",
]);

const LOCAL_CATEGORY_FALLBACK_PATHS = new Set([
  "/images/type-apartment.jpg",
  "/images/type-villa.jpg",
  "/images/type-office.jpg",
  "/images/type-heritage.jpg",
  "/images/isfahan-arch.jpg",
]);

const FALLBACK_PATH_RE =
  /^\/images\/fallback\/(?:apartment|villa|office|heritage|land|commercial)-\d+\.(?:svg|jpe?g|webp|avif)$/i;

export function isPropertyFallbackImage(value: string) {
  const normalized = value.trim();
  if (!normalized) return false;

  try {
    const url = new URL(normalized, "https://hirmand.local");
    if (FALLBACK_PATH_RE.test(url.pathname)) return true;
    if (LOCAL_CATEGORY_FALLBACK_PATHS.has(url.pathname)) return true;
    return url.hostname.toLowerCase() === "images.pexels.com" &&
      PEXELS_FALLBACK_PATHS.has(url.pathname);
  } catch {
    return FALLBACK_PATH_RE.test(normalized);
  }
}

function stableIndex(value: string, length: number) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % length;
}

export function getPropertyFallbackImages(propertyType: PropertyType) {
  // Use committed same-origin photography so builds and visitors do not depend
  // on downloading generated fallback files from third-party image hosts.
  return PROPERTY_FALLBACK_IMAGES[propertyType] ??
    PROPERTY_FALLBACK_REMOTE_IMAGES[propertyType] ??
    PROPERTY_FALLBACK_IMAGES.apartment;
}

const LOCAL_CATEGORY_FALLBACK: Record<PropertyType, string> = {
  apartment: "/images/type-apartment.jpg",
  villa: "/images/type-villa.jpg",
  office: "/images/type-office.jpg",
  heritage: "/images/type-heritage.jpg",
  land: "/images/isfahan-arch.jpg",
  commercial: "/images/type-office.jpg",
};

export function getPropertyFallbackImage(propertyType: PropertyType, propertyId: string) {
  // Select from the checked-in photographic assets for this property type.
  const images = getPropertyFallbackImages(propertyType);
  return images[stableIndex(propertyId || propertyType, images.length)] ?? images[0];
}

export function getPropertyFallbackImageAvif(propertyType: PropertyType, propertyId: string) {
  const fallback = getPropertyFallbackImage(propertyType, propertyId);
  return /\.webp$/i.test(fallback) ? fallback.replace(/\.webp$/i, ".avif") : "";
}

export function getPropertyFallbackLegacyImage(propertyType: PropertyType, propertyId: string) {
  // Kept for existing callers; use the same known-good local photography.
  void propertyId;
  return LOCAL_CATEGORY_FALLBACK[propertyType] ?? LOCAL_CATEGORY_FALLBACK.apartment;
}
