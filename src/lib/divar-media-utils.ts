import { isAllowedDivarImageUrl } from "./media.ts";

const MAX_DIVAR_MEDIA_SCAN = 60;

function collectMediaUrls(
  value: unknown,
  out: string[] = [],
  keyHint = "",
  depth = 0,
): string[] {
  if (depth > 10 || out.length >= MAX_DIVAR_MEDIA_SCAN) return out;

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
  return Array.from(new Set(collectMediaUrls(value))).slice(0, MAX_DIVAR_MEDIA_SCAN);
}
