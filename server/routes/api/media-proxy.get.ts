import { createError, defineEventHandler, getCookie, getHeader, getQuery } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims } from "@/lib/admin-session.server";
import { hasAdminPermission } from "@/lib/admin-roles";
import { clientFingerprint, consumeAdminAttempt, tooManyAttemptsError } from "@/lib/admin-rate-limit.server";
import { detectRasterImageType, isDivarRemoteHost, isLiaraStorageHost, isVideoUrl } from "@/lib/media";
import { getLiaraObject, isAllowedLiaraMediaKey, liaraObjectKeyFromUrl } from "@/lib/liara-object-storage.server";
import {
  databaseMediaVisibility,
  hasCompletedCustomerUploadMedia,
  hasRejectedCustomerSubmissionMedia,
  isPublishedPropertyMedia,
  shouldRateLimitPrivateMediaRequest,
  createLiaraVideoResponse,
  LIARA_MEDIA_STREAM_IDLE_TIMEOUT_MS,
  liaraMediaCacheControl,
} from "@/lib/liara-media-access.server";

/**
 * Same-origin media proxy for classifieds images and private Liara objects.
 *
 * Divar's image CDN answers server-to-server requests but frequently refuses a
 * browser request coming from another origin, which is why imported listings can
 * end up with missing photos. Proxying them through our own origin fixes the
 * grid without depending on a third-party proxy service.
 */

const MAX_BYTES = 12 * 1024 * 1024;
const TIMEOUT_MS = 12_000;

function isAllowedTarget(target: URL): boolean {
  return target.protocol === "https:" && (isDivarRemoteHost(target.toString()) || isLiaraStorageHost(target.toString()));
}

async function readBoundedImage(response: Response, timeoutMs = TIMEOUT_MS): Promise<Uint8Array> {
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
  let timedOut = false;
  const timeout = timeoutMs > 0
    ? setTimeout(() => {
        timedOut = true;
        void reader.cancel().catch(() => undefined);
      }, timeoutMs)
    : undefined;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (timedOut) {
        throw createError({ statusCode: 504, statusMessage: "دریافت تصویر بیش از حد طول کشید." });
      }
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw createError({ statusCode: 502, statusMessage: "حجم تصویر نامعتبر است." });
      }
      chunks.push(value);
    }
  } catch (error) {
    if (timedOut) {
      throw createError({ statusCode: 504, statusMessage: "دریافت تصویر بیش از حد طول کشید." });
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
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
  const query = getQuery(event) as { url?: string; trackingToken?: string; uploadId?: string };
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

  const liaraKey = liaraObjectKeyFromUrl(target.toString());
  if (isLiaraStorageHost(target.toString())) {
    if (!liaraKey) {
      throw createError({ statusCode: 502, statusMessage: "نشانی تصویر با فضای ذخیره‌سازی تنظیم‌شده هیرمند تطبیق ندارد." });
    }

    if (!isAllowedLiaraMediaKey(liaraKey)) {
      // Do not let the public proxy become a general-purpose reader for every
      // object in the configured bucket (for example, private deal documents).
      throw createError({ statusCode: 404, statusMessage: "تصویر پیدا نشد." });
    }

    const mediaVisibility = databaseMediaVisibility(liaraKey);
    const customerSubmissionMedia = mediaVisibility === "customer-submission";
    const propertyUploadMedia = mediaVisibility === "property-upload";
    let hasPrivateMediaPermission = false;
    if (customerSubmissionMedia || propertyUploadMedia) {
      const claims = await getAdminSessionClaims(getCookie(event, ADMIN_SESSION_COOKIE));
      hasPrivateMediaPermission = Boolean(
        claims && hasAdminPermission(claims.role, "property.manage"),
      );
    }

    let publishedReference = false;
    let ownerSubmissionAccess = false;
    let recentUploadAccess = false;
    let mediaSql: Awaited<ReturnType<typeof getSql>> | null = null;
    if (
      (customerSubmissionMedia || propertyUploadMedia) &&
      !hasPrivateMediaPermission &&
      dbSource !== "unconfigured"
    ) {
      try {
        mediaSql = await getSql();
        publishedReference = await isPublishedPropertyMedia(mediaSql, raw);
      } catch {
        // Fail closed when the database cannot confirm a published reference.
      }
    }

    if (shouldRateLimitPrivateMediaRequest(mediaVisibility, hasPrivateMediaPermission, publishedReference)) {
      const attempt = await consumeAdminAttempt("private-property-media:" + clientFingerprint(event), 120);
      if (!attempt.allowed) throw tooManyAttemptsError(attempt.retryAfterSeconds);
    }

    if (customerSubmissionMedia && !hasPrivateMediaPermission && !publishedReference && mediaSql) {
      ownerSubmissionAccess = await hasRejectedCustomerSubmissionMedia(
        mediaSql,
        typeof query.trackingToken === "string" ? query.trackingToken : "",
        raw,
      );
      if (!ownerSubmissionAccess) {
        recentUploadAccess = await hasCompletedCustomerUploadMedia(
          mediaSql,
          liaraKey,
          raw,
          typeof query.uploadId === "string" ? query.uploadId : "",
        );
      }
    }

    if (
      customerSubmissionMedia &&
      !hasPrivateMediaPermission &&
      !publishedReference &&
      !ownerSubmissionAccess &&
      !recentUploadAccess
    ) {
      throw createError({ statusCode: 404, statusMessage: "تصویر پیدا نشد." });
    }
    if (propertyUploadMedia && !hasPrivateMediaPermission && !publishedReference) {
      throw createError({ statusCode: 404, statusMessage: "تصویر پیدا نشد." });
    }

    const video = isVideoUrl(raw);
    const cacheControl = liaraMediaCacheControl(liaraKey, publishedReference);
    const response = await getLiaraObject({
      key: liaraKey,
      timeoutMs: TIMEOUT_MS,
      range: video ? getHeader(event, "range") : undefined,
    });
    if (!response) {
      throw createError({ statusCode: 502, statusMessage: "دریافت رسانه از فضای ذخیره‌سازی هیرمند ممکن نشد." });
    }
    if (video) {
      const videoResponse = createLiaraVideoResponse(
        response,
        liaraKey,
        cacheControl,
        LIARA_MEDIA_STREAM_IDLE_TIMEOUT_MS,
      );
      if (videoResponse) return videoResponse;
      if (!response.ok) {
        throw createError({ statusCode: response.status === 404 ? 404 : 502, statusMessage: "دریافت ویدئو از فضای ذخیره‌سازی هیرمند ممکن نشد." });
      }
      throw createError({ statusCode: 415, statusMessage: "نوع ویدئوی ذخیره‌شده پشتیبانی نمی‌شود." });
    }
    if (!response.ok) {
      throw createError({ statusCode: response?.status === 404 ? 404 : 502, statusMessage: "دریافت تصویر از فضای ذخیره‌سازی هیرمند ممکن نشد." });
    }
    const bytes = await readBoundedImage(response, TIMEOUT_MS);
    const contentType = detectRasterImageType(bytes);
    if (!contentType) throw createError({ statusCode: 502, statusMessage: "محتوای ذخیره‌شده تصویر معتبر نیست." });
    return new Response(bytes.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": cacheControl,
        "x-content-type-options": "nosniff",
        "content-security-policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'",
        "cross-origin-resource-policy": "same-origin",
      },
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

  const bytes = await readBoundedImage(response, TIMEOUT_MS);
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
      "cross-origin-resource-policy": "same-origin",
    },
  });
});
