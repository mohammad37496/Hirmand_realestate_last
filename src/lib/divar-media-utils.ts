import { isAllowedDivarImageUrl } from "./media.ts";

// The payload commonly contains several renditions per photo. Bound raw
// traversal separately from the final media count so thumbnails appearing
// first cannot consume the entire scan budget and hide full-size URLs.
const MAX_DIVAR_MEDIA_CANDIDATES = 1_000;
// Divar can expose up to 60 photos plus a video item in the same ad.
const MAX_DIVAR_MEDIA_SCAN = 80;

function collectMediaUrls(
  value: unknown,
  out: string[] = [],
  keyHint = "",
  depth = 0,
): string[] {
  if (depth > 12 || out.length >= MAX_DIVAR_MEDIA_CANDIDATES) return out;

  if (typeof value === "string") {
    if (isAllowedDivarImageUrl(value)) {
      try {
        const url = new URL(value);
        const looksMediaKey = /image|photo|picture|thumbnail|media|gallery|cover/i.test(keyHint);
        const looksImagePath = /\.(?:jpe?g|png|gif|webp|avif)(?:$|[?#])/i.test(url.pathname);
        const isCdnHost = url.hostname.toLowerCase().includes("divarcdn.");
        if (looksMediaKey || looksImagePath || isCdnHost) {
          out.push(url.toString());
        }
      } catch {
        // Ignore malformed URLs.
      }
    }
    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectMediaUrls(item, out, keyHint, depth + 1);
    return out;
  }

  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      collectMediaUrls(item, out, key, depth + 1);
    }
  }

  return out;
}

export function extractDivarMediaUrls(value: unknown): string[] {
  const candidates = collectMediaUrls(value);
  const byPhoto = new Map<string, string>();

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      const filename = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
      // Divar embeds several CDN renditions of the same photo in its detail
      // payload (thumbnail, webp and full-size). The stable filename/photo ID
      // identifies the photo; counting each rendition inflated gallery counts.
      const photoId = filename.replace(/\.(?:jpe?g|png|gif|webp|avif)$/i, "").toLowerCase();
      const key = photoId || url.pathname;
      const previous = byPhoto.get(key);
      const isThumbnail = /(?:thumbnail|thumb|small|medium)/i.test(url.pathname);
      const previousIsThumbnail = previous
        ? /(?:thumbnail|thumb|small|medium)/i.test(new URL(previous).pathname)
        : true;
      if (!previous || (previousIsThumbnail && !isThumbnail)) byPhoto.set(key, url.toString());
    } catch {
      // collectMediaUrls already validates these URLs; ignore any malformed
      // value defensively rather than letting one item abort the whole gallery.
    }
  }

  return Array.from(byPhoto.values()).slice(0, MAX_DIVAR_MEDIA_SCAN);
}
