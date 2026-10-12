/** Same-origin path prefix for media the app stores and serves itself. */
export const DB_MEDIA_PATH = "/api/media/";

/** Media slots a property gallery can hold. */
export const MAX_PROPERTY_MEDIA = 20;

const DIVAR_MEDIA_DOMAINS = ["divar.ir", "divar.com", "divarcdn.com"] as const;

export type RasterImageMime =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp"
  | "image/avif";

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

/**
 * Divar's media hosts rotate over time. Match complete DNS suffixes rather
 * than a substring so an unrelated host cannot masquerade as a trusted CDN.
 */
export function isDivarRemoteHost(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    return DIVAR_MEDIA_DOMAINS.some(
      (domain) => host === domain || host.endsWith("." + domain),
    );
  } catch {
    return false;
  }
}

/** Only allow HTTPS media, except for explicit loopback development URLs. */
function isAllowedRemoteMediaUrl(url: URL): boolean {
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && isLoopbackHost(url.hostname);
}

/**
 * A gallery entry is either a remote `https://` URL, a loopback development
 * URL, or media we serve ourselves from `/api/media/<id>`.
 */
export function isAllowedMediaRef(value: string): boolean {
  if (value.startsWith(DB_MEDIA_PATH)) {
    try {
      const url = new URL(value, "https://hirmand.invalid");
      return (
        url.origin === "https://hirmand.invalid" &&
        url.pathname.startsWith(DB_MEDIA_PATH) &&
        url.pathname.length > DB_MEDIA_PATH.length &&
        !url.pathname.includes("/", DB_MEDIA_PATH.length)
      );
    } catch {
      return false;
    }
  }
  try {
    return isAllowedRemoteMediaUrl(new URL(value));
  } catch {
    return false;
  }
}

function hasAscii(bytes: Uint8Array, start: number, value: string): boolean {
  if (start + value.length > bytes.length) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[start + index] !== value.charCodeAt(index)) return false;
  }
  return true;
}

function hasHex(bytes: Uint8Array, start: number, value: string): boolean {
  if (start + value.length / 2 > bytes.length) return false;
  for (let index = 0; index < value.length; index += 2) {
    const byte = bytes[start + index];
    const expected = Number.parseInt(value.slice(index, index + 2), 16);
    if (byte !== expected) return false;
  }
  return true;
}

/**
 * Detect only raster image formats from magic bytes. SVG is deliberately not
 * accepted: active SVG content served from our origin can become stored XSS.
 */
export function detectRasterImageType(bytes: Uint8Array): RasterImageMime | "" {
  if (hasHex(bytes, 0, "ffd8ff")) return "image/jpeg";
  if (hasHex(bytes, 0, "89504e470d0a1a0a")) return "image/png";
  if (hasAscii(bytes, 0, "GIF87a") || hasAscii(bytes, 0, "GIF89a")) {
    return "image/gif";
  }
  if (hasAscii(bytes, 0, "RIFF") && hasAscii(bytes, 8, "WEBP")) {
    return "image/webp";
  }
  if (
    bytes.length >= 12 &&
    hasAscii(bytes, 4, "ftyp") &&
    (hasAscii(bytes, 8, "avif") || hasAscii(bytes, 8, "avis"))
  ) {
    return "image/avif";
  }
  return "";
}

/** Detect image vs video from URL or MIME. */
export function isVideoUrl(src: string): boolean {
  const [pathname, query = ""] = src.toLowerCase().split("?", 2);
  return /\.(mp4|webm|mov|m4v|ogg)($|\/)/i.test(pathname) ||
    pathname.includes("/video/") ||
    new URLSearchParams(query).get("type") === "video";
}

export function isImageUrl(src: string): boolean {
  return !isVideoUrl(src);
}

export function isAllowedDivarImageUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:" && isDivarRemoteHost(value);
  } catch {
    return false;
  }
}

/**
 * Ordered, browser-safe candidates for remote property media.
 *
 * Classifieds CDNs reject hotlink requests from a visitor's browser, so we try
 * the original URL, then our own proxy (same origin, no third party involved),
 * then public image proxies, and finally the local placeholder.
 */
export function mediaSourceCandidates(src: string, fallback = ""): string[] {
  const value = src.trim();
  if (!value) return fallback ? [fallback] : [];

  const isDivarRemote = isDivarRemoteHost(value);

  if (isDivarRemote) {
    // Imported classifieds media should never make the visitor's browser call
    // Divar or a foreign image proxy directly. The same-origin route fetches
    // the image server-side and keeps the browser request on Hirmand's domain.
    return Array.from(
      new Set(
        [
          `/api/media-proxy?url=${encodeURIComponent(value)}`,
          fallback,
        ].filter(Boolean),
      ),
    );
  }

  return Array.from(new Set([value, fallback].filter(Boolean)));
}
