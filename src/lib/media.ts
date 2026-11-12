/** Same-origin path prefix for media the app stores and serves itself. */
export const DB_MEDIA_PATH = "/api/media/";

/** Media slots a property gallery can hold. */
export const MAX_PROPERTY_MEDIA = 20;

const DIVAR_MEDIA_DOMAINS = ["divar.ir", "divar.com", "divarcdn.com"] as const;
// These exact image hosts are grounded in the checked-in Divar media fixtures.
// Do not widen this list from a suffix match: import-time fetches are server-side.
const DIVAR_IMAGE_HOSTS = new Set(["img.divarcdn.com", "s100.divarcdn.com", "divar.ir"]);

/** Liara buckets may be private; their public-looking object URLs still need a
 * signed same-origin read when the bucket policy does not allow anonymous GETs. */
export function isLiaraStorageHost(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" &&
      ["liara.space", "liara.site", "liara.ir"].some((domain) => host === domain || host.endsWith("." + domain));
  } catch {
    return false;
  }
}

/** Public property gallery objects may fall back to their bucket URL if the
 * signed proxy is temporarily unavailable. Submission uploads stay proxied. */
function isPublicLiaraGalleryObject(value: string): boolean {
  try {
    const url = new URL(value);
    return isLiaraStorageHost(value) &&
      url.pathname.includes("/properties/uploads/gallery/") &&
      !url.hash &&
      !url.username &&
      !url.password;
  } catch {
    return false;
  }
}

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

/** Normalize only known first-party Divar image hosts before fetching/importing. */
export function normalizeDivarImageUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!DIVAR_IMAGE_HOSTS.has(url.hostname.toLowerCase())) return null;
    if (url.username || url.password || url.port) return null;
    url.protocol = "https:";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
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
 * The placeholder is used only when no source URL was stored; failed real-media requests stay visible as failures.
 */
export function mediaSourceCandidates(src: string, fallback = ""): string[] {
  const value = src.trim();
  if (!value) return fallback ? [fallback] : [];

  // Older property rows can contain either a relative proxy path or the
  // absolute canonical site URL saved by a previous release. Normalize only
  // this site's HTTPS origin; never rewrite a proxy URL hosted by an arbitrary
  // third party.
  try {
    const relativeOrigin = "https://hirmand.invalid";
    const isRelativePath = value.startsWith("/");
    const legacyUrl = new URL(value, relativeOrigin);
    const isTrustedAbsoluteOrigin =
      legacyUrl.protocol === "https:" &&
      (legacyUrl.origin === "https://hirmandrealestate.ir" ||
        legacyUrl.origin === "https://www.hirmandrealestate.ir");
    const isTrustedRelativeOrigin =
      isRelativePath && legacyUrl.origin === relativeOrigin;
    const isLegacyProxyPath =
      legacyUrl.pathname === "/api/liara-media" ||
      legacyUrl.pathname === "/api/media-proxy";

    if ((isTrustedRelativeOrigin || isTrustedAbsoluteOrigin) && isLegacyProxyPath) {
      const storedTarget = legacyUrl.searchParams.get("url")?.trim() ?? "";
      if (isLiaraStorageHost(storedTarget)) {
        return ["/api/media-proxy?url=" + encodeURIComponent(storedTarget)];
      }
      const normalizedDivarTarget = normalizeDivarImageUrl(storedTarget);
      if (normalizedDivarTarget) {
        return ["/api/media-proxy?url=" + encodeURIComponent(normalizedDivarTarget)];
      }
      return [value];
    }
  } catch {
    // Keep malformed and unsupported source URLs visible as failed media.
  }

  const normalizedDivarSource = normalizeDivarImageUrl(value);
  const isLiaraRemote = isLiaraStorageHost(value);

  if (normalizedDivarSource) {
    // Imported classifieds media should never make the visitor's browser call
    // Divar or a foreign image proxy directly. The same-origin route fetches
    // the image server-side and keeps the browser request on Hirmand's domain.
    return [`/api/media-proxy?url=${encodeURIComponent(normalizedDivarSource)}`];
  }

  if (isLiaraRemote) {
    const proxy = `/api/media-proxy?url=${encodeURIComponent(value)}`;
    return isPublicLiaraGalleryObject(value) ? [proxy, value] : [proxy];
  }

  return [value];
}

const MEDIA_UPLOAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Keep the short-lived upload capability with private submission media until review. */
export function withMediaUploadCapability(src: string, uploadId: string): string {
  if (!MEDIA_UPLOAD_ID_PATTERN.test(uploadId)) return src;
  try {
    const isAbsolute = /^https:\/\//i.test(src);
    const url = new URL(src, "https://hirmandrealestate.ir");
    url.hash = "uploadId=" + uploadId;
    return isAbsolute ? url.toString() : url.pathname + url.search + url.hash;
  } catch {
    return src;
  }
}

/** Remove the private upload capability before media is copied to a public property. */
export function stripMediaUploadCapability(src: string): string {
  try {
    const isAbsolute = /^https:\/\//i.test(src);
    const url = new URL(src, "https://hirmandrealestate.ir");
    if (/^#uploadId=[0-9a-f-]{36}$/i.test(url.hash)) url.hash = "";
    return isAbsolute ? url.toString() : url.pathname + url.search + url.hash;
  } catch {
    return src;
  }
}

/** Build a same-origin preview URL, optionally carrying owner and upload capabilities. */
export function mediaPreviewSource(src: string, trackingToken = ""): string {
  const candidate = mediaSourceCandidates(src)[0] ?? src;
  let isCustomerSubmissionMedia = false;
  if (candidate.startsWith(DB_MEDIA_PATH)) {
    try {
      const mediaUrl = new URL(candidate, "https://hirmandrealestate.ir");
      const capability = mediaUrl.hash.match(/^#uploadId=([0-9a-f-]{36})$/i);
      if (capability && MEDIA_UPLOAD_ID_PATTERN.test(capability[1]!)) {
        mediaUrl.hash = "";
        mediaUrl.searchParams.set("uploadId", capability[1]!);
      }
      if (trackingToken) mediaUrl.searchParams.set("trackingToken", trackingToken);
      return mediaUrl.pathname + mediaUrl.search;
    } catch {
      return candidate;
    }
  }
  if (trackingToken && candidate.startsWith("/api/media-proxy?")) {
    try {
      const proxy = new URL(candidate, "https://hirmandrealestate.ir");
      const targetValue = proxy.searchParams.get("url");
      if (targetValue) {
        const target = new URL(targetValue);
        isCustomerSubmissionMedia =
          isLiaraStorageHost(target.href) &&
          target.pathname.includes("/properties/customer-submissions/");
      }
    } catch {
      isCustomerSubmissionMedia = false;
    }
  }
  if (candidate.startsWith("/api/media-proxy?")) {
    try {
      const proxy = new URL(candidate, "https://hirmandrealestate.ir");
      const targetValue = proxy.searchParams.get("url");
      if (targetValue) {
        const target = new URL(targetValue);
        const capability = target.hash.match(/^#uploadId=([0-9a-f-]{36})$/i);
        if (capability && MEDIA_UPLOAD_ID_PATTERN.test(capability[1]!)) {
          target.hash = "";
          proxy.searchParams.set("url", target.toString());
          proxy.searchParams.set("uploadId", capability[1]!);
        }
      }
      if (trackingToken && isCustomerSubmissionMedia) {
        proxy.searchParams.set("trackingToken", trackingToken);
      }
      return proxy.pathname + proxy.search;
    } catch {
      // Keep the original proxy URL if a malformed source cannot be normalized.
    }
  }
  return candidate;
}
