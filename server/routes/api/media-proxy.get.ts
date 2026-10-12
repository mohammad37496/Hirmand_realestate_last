import { createError, defineEventHandler, getQuery } from "h3";
import { detectRasterImageType, isDivarRemoteHost } from "@/lib/media";

/**
 * Same-origin image proxy for classifieds CDNs that block hotlinking.
 *
 * Divar's image CDN answers server-to-server requests but frequently refuses a
 * browser request coming from another origin, which is why imported listings can
 * end up with missing photos. Proxying them through our own origin fixes the
 * grid without depending on a third-party proxy service.
 */

const MAX_BYTES = 12 * 1024 * 1024;
const TIMEOUT_MS = 12_000;

function isAllowedTarget(target: URL): boolean {
  return target.protocol === "https:" && isDivarRemoteHost(target.toString());
}

async function readBoundedImage(response: Response): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
    throw createError({ statusCode: 502, statusMessage: "حجم تصویر نامعتبر است." });
  }

  if (!response.body) {
    throw createError({ statusCode: 502, statusMessage: "محتوای دریافتی تصویر نیست." });
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw createError({ statusCode: 502, statusMessage: "حجم تصویر نامعتبر است." });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as { url?: string };
  const raw = typeof query.url === "string" ? query.url.trim() : "";

  if (!raw) {
    throw createError({ statusCode: 400, statusMessage: "نشانی تصویر مشخص نیست." });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    throw createError({ statusCode: 400, statusMessage: "نشانی تصویر نامعتبر است." });
  }

  if (!isAllowedTarget(target)) {
    throw createError({
      statusCode: 400,
      statusMessage: "پروکسی تصویر فقط برای منابع مجاز فعال است.",
    });
  }

  const requestHeaders = {
    accept: "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8",
    "accept-language": "fa-IR,fa;q=0.9,en;q=0.7",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36",
  };
  let currentUrl = target;
  let response: Response | null = null;

  try {
    for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
      response = await fetch(currentUrl.toString(), {
        redirect: "manual",
        headers: requestHeaders,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (response.status < 300 || response.status >= 400) break;

      const location = response.headers.get("location");
      if (!location) {
        throw createError({
          statusCode: 502,
          statusMessage: "منبع تصویر ریدایرکت نامعتبر برگرداند.",
        });
      }

      const nextUrl = new URL(location, currentUrl);
      if (!isAllowedTarget(nextUrl)) {
        throw createError({
          statusCode: 502,
          statusMessage: "ریدایرکت تصویر به منبع غیرمجاز مسدود شد.",
        });
      }

      currentUrl = nextUrl;
    }

    if (!response || (response.status >= 300 && response.status < 400)) {
      throw createError({
        statusCode: 502,
        statusMessage: "تعداد ریدایرکت‌های تصویر بیش از حد مجاز است.",
      });
    }
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) throw error;
    throw createError({ statusCode: 502, statusMessage: "دریافت تصویر از منبع ممکن نشد." });
  }

  if (!response.ok) {
    throw createError({
      statusCode: response.status === 404 ? 404 : 502,
      statusMessage: "منبع تصویر پاسخ معتبری برنگرداند.",
    });
  }

  const bytes = await readBoundedImage(response);
  if (!bytes.length) {
    throw createError({ statusCode: 502, statusMessage: "حجم تصویر نامعتبر است." });
  }

  const contentType = detectRasterImageType(bytes);
  if (!contentType) {
    throw createError({ statusCode: 502, statusMessage: "محتوای دریافتی تصویر نیست." });
  }

  return new Response(bytes.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'",
    },
  });
});
