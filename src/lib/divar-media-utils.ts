import { isAllowedDivarImageUrl, isVideoUrl } from "./media.ts";

// The payload commonly contains several renditions per photo. Bound raw
// traversal separately from the final media count so thumbnails appearing
// first cannot consume the entire scan budget and hide full-size URLs.
const MAX_DIVAR_MEDIA_CANDIDATES = 5_000;

export type DivarMediaExtraction = {
  /** Unique, ordered media URLs after collapsing known photo renditions. */
  urls: string[];
  /** True when the bounded traversal stopped before it could inspect all input. */
  truncatedCandidates: boolean;
};

type Collector = { urls: string[]; truncated: boolean };

function hasPotentialMedia(
  value: unknown,
  keyHint: string,
  depth = 0,
  budget = { remaining: MAX_DIVAR_MEDIA_CANDIDATES },
): boolean {
  budget.remaining -= 1;
  if (budget.remaining < 0) return true;
  if (depth > 64) return value !== null && typeof value === "object";

  if (typeof value === "string" && isAllowedDivarImageUrl(value)) {
    try {
      const url = new URL(value);
      const pathname = url.pathname.toLowerCase();
      const looksMediaKey = /image|photo|picture|thumbnail|media|gallery|cover/i.test(keyHint);
      const looksVideoKey = /video|movie|clip/i.test(keyHint);
      const looksImagePath = /\.(?:jpe?g|png|gif|webp|avif)(?:$|\/)/i.test(pathname);
      const isUiAsset = pathname.includes("/static/imgs/") || pathname.includes("mapimage");
      return !isUiAsset && (
        /\/static\/photo\//i.test(pathname) ||
        isVideoUrl(value) ||
        (looksImagePath && looksMediaKey) ||
        (looksVideoKey && !pathname.includes("/widget-icons/"))
      );
    } catch {
      return false;
    }
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasPotentialMedia(item, keyHint, depth + 1, budget));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(([key, item]) =>
      hasPotentialMedia(item, `${keyHint} ${key}`, depth + 1, budget),
    );
  }
  return false;
}

function collectMediaUrls(
  value: unknown,
  state: Collector = { urls: [], truncated: false },
  keyHint = "",
  depth = 0,
): Collector {
  if (state.truncated) return state;
  if (depth > 12) {
    // Only fail closed when the skipped branch contains potential gallery
    // media. Divar has unrelated deeply nested UI metadata in real payloads.
    if (hasPotentialMedia(value, keyHint)) state.truncated = true;
    return state;
  }

  if (typeof value === "string") {
    if (isAllowedDivarImageUrl(value)) {
      try {
        const url = new URL(value);
        const pathname = url.pathname.toLowerCase();
        const looksMediaKey = /image|photo|picture|thumbnail|media|gallery|cover/i.test(keyHint);
        const looksVideoKey = /video|movie|clip/i.test(keyHint);
        const looksImagePath = /\.(?:jpe?g|png|gif|webp|avif)(?:$|\/)/i.test(pathname);
        const isKnownPhotoPath = /\/static\/photo\//i.test(pathname);
        const isKnownVideo = isVideoUrl(url.toString()) || (looksVideoKey && !pathname.includes("/widget-icons/"));
        const isUiAsset = pathname.includes("/static/imgs/") || pathname.includes("mapimage");

        // The Divar CDN also hosts interface icons and map tiles. A CDN hostname
        // alone is not evidence that a URL belongs to the listing gallery.
        if (isKnownPhotoPath || isKnownVideo || (!isUiAsset && looksImagePath && looksMediaKey)) {
          if (state.urls.length >= MAX_DIVAR_MEDIA_CANDIDATES) {
            state.truncated = true;
          } else {
            state.urls.push(url.toString());
          }
        }
      } catch {
        // Ignore malformed URLs.
      }
    }
    return state;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectMediaUrls(item, state, keyHint, depth + 1);
      if (state.truncated) break;
    }
    return state;
  }

  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      collectMediaUrls(item, state, `${keyHint} ${key}`, depth + 1);
      if (state.truncated) break;
    }
  }

  return state;
}

export function extractDivarMedia(value: unknown): DivarMediaExtraction {
  const collected = collectMediaUrls(value);
  const byPhoto = new Map<string, string>();

  for (const candidate of collected.urls) {
    try {
      const url = new URL(candidate);
      const filename = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
      // Collapse variants only when the URL follows Divar's known photo-rendition
      // path. A basename alone is not globally unique and can discard unrelated
      // media that happen to be named image.jpg (or use a generic filename).
      const isDivarPhotoRendition = /\/static\/photo\//i.test(url.pathname);
      const photoId = filename.replace(/\.(?:jpe?g|png|gif|webp|avif)$/i, "").toLowerCase();
      const key = isDivarPhotoRendition && photoId
        ? `photo:${photoId}`
        : `url:${url.origin}${url.pathname}${url.search}`;
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

  return { urls: Array.from(byPhoto.values()), truncatedCandidates: collected.truncated };
}

/** Backward-compatible convenience wrapper for callers that only need URLs. */
export function extractDivarMediaUrls(value: unknown): string[] {
  return extractDivarMedia(value).urls;
}
