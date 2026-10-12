import type { PropertyType } from "@/lib/properties";

type FallbackMap = Record<PropertyType, readonly string[]>;

/**
 * Curated, self-hosted fallback photography.
 *
 * JPEG files are generated into public/images/fallback before the production
 * build from the repository's source manifest. The bundled SVGs remain the
 * zero-network emergency fallback when a build-time image cannot be fetched.
 */
export const PROPERTY_FALLBACK_IMAGES: FallbackMap = {
  apartment: [
    "/images/fallback/apartment-01.jpg",
    "/images/fallback/apartment-02.jpg",
    "/images/fallback/apartment-03.jpg",
    "/images/fallback/apartment-04.jpg",
    "/images/fallback/apartment-05.jpg",
    "/images/fallback/apartment-06.jpg",
  ],
  villa: [
    "/images/fallback/villa-01.jpg",
    "/images/fallback/villa-02.jpg",
    "/images/fallback/villa-03.jpg",
    "/images/fallback/villa-04.jpg",
    "/images/fallback/villa-05.jpg",
    "/images/fallback/villa-06.jpg",
  ],
  office: [
    "/images/fallback/office-01.jpg",
    "/images/fallback/office-02.jpg",
    "/images/fallback/office-03.jpg",
    "/images/fallback/office-04.jpg",
  ],
  heritage: [
    "/images/fallback/heritage-01.jpg",
    "/images/fallback/heritage-02.jpg",
    "/images/fallback/heritage-03.jpg",
    "/images/fallback/heritage-04.jpg",
  ],
  land: [
    "/images/fallback/land-01.jpg",
    "/images/fallback/land-02.jpg",
    "/images/fallback/land-03.jpg",
    "/images/fallback/land-04.jpg",
  ],
  commercial: [
    "/images/fallback/commercial-01.jpg",
    "/images/fallback/commercial-02.jpg",
    "/images/fallback/commercial-03.jpg",
    "/images/fallback/commercial-04.jpg",
  ],
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

const LEGACY_FALLBACK_IMAGES: FallbackMap = {
  apartment: [
    "/images/fallback/apartment-01.svg",
    "/images/fallback/apartment-02.svg",
  ],
  villa: [
    "/images/fallback/villa-01.svg",
    "/images/fallback/villa-02.svg",
  ],
  office: [
    "/images/fallback/office-01.svg",
    "/images/fallback/office-02.svg",
  ],
  heritage: [
    "/images/fallback/heritage-01.svg",
    "/images/fallback/heritage-02.svg",
  ],
  land: [
    "/images/fallback/land-01.svg",
    "/images/fallback/land-02.svg",
  ],
  commercial: [
    "/images/fallback/commercial-01.svg",
    "/images/fallback/commercial-02.svg",
  ],
};

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
  // Prefer same-origin assets so property galleries do not depend on Pexels
  // being reachable from the visitor's network. The raster files are generated
  // during deploy; ResilientImage falls back to the tracked category image and
  // then the checked-in SVG if a generated file is missing.
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

export function getPropertyFallbackImage(propertyType: PropertyType, _propertyId: string) {
  // First-party image files remain available when third-party image CDNs fail.
  return LOCAL_CATEGORY_FALLBACK[propertyType] ?? LOCAL_CATEGORY_FALLBACK.apartment;
}

export function getPropertyFallbackImageAvif(propertyType: PropertyType, propertyId: string) {
  const fallback = getPropertyFallbackImage(propertyType, propertyId);
  return /\.webp$/i.test(fallback) ? fallback.replace(/\.webp$/i, ".avif") : "";
}

export function getPropertyFallbackLegacyImage(propertyType: PropertyType, propertyId: string) {
  const images = LEGACY_FALLBACK_IMAGES[propertyType] ?? LEGACY_FALLBACK_IMAGES.apartment;
  return images[stableIndex(propertyId || propertyType, images.length)] ?? images[0];
}
