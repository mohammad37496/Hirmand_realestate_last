import {
  createError,
  defineEventHandler,
  getHeader,
  getQuery,
} from "h3";
import {
  getLiaraObject,
  isAllowedLiaraMediaKey,
  liaraObjectKeyFromUrl,
} from "@/lib/liara-object-storage.server";

/**
 * Public, same-origin delivery for property media stored in a private Liara
 * bucket. The object URL is validated against the configured endpoint and
 * bucket; storage credentials never leave the server.
 */
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

function mimeFromKey(key: string): string {
  const extension = key.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "avif") return "image/avif";
  if (extension === "mp4") return "video/mp4";
  if (extension === "webm") return "video/webm";
  if (extension === "mov") return "video/quicktime";
  return "";
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as { url?: string };
  const rawUrl = typeof query.url === "string" ? query.url.trim() : "";
  if (!rawUrl) {
    throw createError({ statusCode: 400, statusMessage: "نشانی رسانه مشخص نیست." });
  }

  const key = liaraObjectKeyFromUrl(rawUrl);
  if (!key || !isAllowedLiaraMediaKey(key)) {
    throw createError({ statusCode: 400, statusMessage: "نشانی رسانه مجاز نیست." });
  }

  const range = getHeader(event, "range");
  const upstream = await getLiaraObject({ key, ...(range ? { range } : {}) });
  if (!upstream) {
    throw createError({ statusCode: 502, statusMessage: "دریافت تصویر از فضای ذخیره‌سازی ممکن نشد." });
  }
  if (upstream.status === 404) {
    throw createError({ statusCode: 404, statusMessage: "رسانه در فضای ذخیره‌سازی پیدا نشد." });
  }
  if (!upstream.ok && upstream.status !== 206) {
    console.warn("[liara-media] private object request failed:", upstream.status, key);
    throw createError({ statusCode: 502, statusMessage: "فضای ذخیره‌سازی رسانه پاسخ معتبر برنگرداند." });
  }

  const declaredType = (upstream.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const contentType = ALLOWED_TYPES.has(declaredType)
    ? declaredType
    : mimeFromKey(key);
  if (!ALLOWED_TYPES.has(contentType)) {
    throw createError({ statusCode: 415, statusMessage: "نوع رسانه پشتیبانی نمی‌شود." });
  }

  const headers = new Headers({
    "content-type": contentType,
    "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
    "accept-ranges": "bytes",
    "x-content-type-options": "nosniff",
    "content-disposition": "inline",
    "content-security-policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'; media-src 'self' blob: data:",
  });
  const length = upstream.headers.get("content-length");
  const contentRange = upstream.headers.get("content-range");
  if (length) headers.set("content-length", length);
  if (contentRange) headers.set("content-range", contentRange);

  return new Response(upstream.body, {
    status: upstream.status === 206 ? 206 : 200,
    headers,
  });
});
