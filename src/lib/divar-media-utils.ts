import { isDivarRemoteHost, normalizeDivarImageUrl } from "./media.ts";

const MAX_DIVAR_MEDIA_SCAN = 60;

function collectMediaUrls(
  value: unknown,
  out: string[] = [],
  keyHint = "",
  depth = 0,
): string[] {
  if (depth > 10 || out.length >= MAX_DIVAR_MEDIA_SCAN) return out;

  if (typeof value === "string") {
    const normalized = normalizeDivarImageUrl(value);
    if (normalized) {
      try {
        const url = new URL(normalized);
        const looksMediaKey = /image|photo|picture|thumbnail|media|gallery|cover/i.test(keyHint);
        const looksImagePath = /\.(?:jpe?g|png|gif|webp|avif)(?:$|[?#])/i.test(url.pathname);
        const isCdnHost = url.hostname === "img.divarcdn.com" || url.hostname === "s100.divarcdn.com";
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
  return Array.from(new Set(collectMediaUrls(value))).slice(0, MAX_DIVAR_MEDIA_SCAN);
}

export type DivarImageUploadResult = {
  images: string[];
  failures: { source: string; reason: string }[];
  sourceImages: string[];
};

/** Preserve hosted gallery media and only fall back to normalized sources whose upload failed. */
export function buildDivarReimportImages(
  currentImages: string[],
  uploadResult: DivarImageUploadResult,
  maxImages = 20,
): string[] {
  const hostedCurrent = currentImages.filter((url) => !isDivarRemoteHost(url));
  const existingRemote = currentImages
    .map(normalizeDivarImageUrl)
    .filter((url): url is string => Boolean(url));
  const fallbackSources = uploadResult.sourceImages.length
    ? uploadResult.sourceImages.filter((url) =>
        uploadResult.failures.some((failure) => failure.source === url),
      )
    : existingRemote;

  return Array.from(new Set([
    ...hostedCurrent,
    ...uploadResult.images,
    ...fallbackSources,
  ])).slice(0, maxImages);
}
