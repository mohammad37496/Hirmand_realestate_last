import {
  createError,
  defineEventHandler,
  getHeader,
  getCookie,
  getQuery,
  getRouterParam,
  setHeader,
} from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims } from "@/lib/admin-session.server";
import { hasAdminPermission } from "@/lib/admin-roles";
import { clientFingerprint, consumeAdminAttempt, tooManyAttemptsError } from "@/lib/admin-rate-limit.server";
import {
  getMediaMeta,
  IncompleteMediaRangeError,
  readMediaRange,
} from "@/lib/media-store.server";
import { parseMediaByteRange } from "@/lib/media-range-bytes";
import { createRangeNotSatisfiableResponse } from "@/lib/music-range-response";
import {
  databaseMediaVisibility,
  hasCompletedCustomerUploadMedia,
  hasRejectedCustomerSubmissionMedia,
  isPublishedPropertyMedia,
  liaraMediaCacheControl,
} from "@/lib/liara-media-access.server";

/**
 * Serves stored media from our own origin.
 *
 * Audio playback and image rendering both depend on this endpoint being a
 * first-class HTTP resource: it answers `Range` requests (so the browser can
 * seek inside a song) and applies path-specific caching after access checks.
 */

const SAFE_INLINE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
]);

function disposition(pathname: string, contentType: string): string {
  const name = pathname.split("/").pop()?.trim() || "media";
  const ascii = name.replace(/[^\w.-]+/g, "_").slice(0, 80) || "media";
  const inline =
    contentType.startsWith("audio/") ||
    contentType.startsWith("video/") ||
    SAFE_INLINE_IMAGE_TYPES.has(contentType);
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"`;
}

export default defineEventHandler(async (event) => {
  setHeader(event, "Cross-Origin-Resource-Policy", "same-origin");
  const id = getRouterParam(event, "id")?.trim();
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "شناسه رسانه نامعتبر است." });
  }

  const meta = await getMediaMeta(id);
  if (!meta) {
    throw createError({ statusCode: 404, statusMessage: "رسانه پیدا نشد." });
  }

  const visibility = databaseMediaVisibility(meta.pathname);
  if (visibility === "unknown") {
    throw createError({ statusCode: 404, statusMessage: "رسانه پیدا نشد." });
  }
  const query = getQuery(event) as { type?: string; trackingToken?: string; uploadId?: string };
  const rawUrl = `/api/media/${encodeURIComponent(id)}${query.type === "video" ? "?type=video" : ""}`;

  let publishedReference = false;
  if (visibility === "customer-submission" || visibility === "property-upload") {
    const claims = await getAdminSessionClaims(getCookie(event, ADMIN_SESSION_COOKIE));
    const hasPrivateMediaPermission = Boolean(
      claims && hasAdminPermission(claims.role, "property.manage"),
    );
    if (!hasPrivateMediaPermission) {
      const attempt = await consumeAdminAttempt("private-property-media:" + clientFingerprint(event), 120);
      if (!attempt.allowed) throw tooManyAttemptsError(attempt.retryAfterSeconds);
    }
    if (!hasPrivateMediaPermission && dbSource !== "unconfigured") {
      try {
        const sql = await getSql();
        publishedReference = await isPublishedPropertyMedia(sql, rawUrl);
        let ownerSubmissionAccess = false;
        let recentUploadAccess = false;
        if (visibility === "customer-submission" && !publishedReference) {
          ownerSubmissionAccess = await hasRejectedCustomerSubmissionMedia(
            sql,
            typeof query.trackingToken === "string" ? query.trackingToken : "",
            rawUrl,
          );
          if (!ownerSubmissionAccess) {
            recentUploadAccess = await hasCompletedCustomerUploadMedia(
              sql,
              meta.pathname,
              rawUrl,
              typeof query.uploadId === "string" ? query.uploadId : "",
            );
          }
        }

        if (
          visibility === "customer-submission" &&
          !publishedReference &&
          !ownerSubmissionAccess &&
          !recentUploadAccess
        ) {
          throw createError({ statusCode: 404, statusMessage: "رسانه پیدا نشد." });
        }
        if (visibility === "property-upload" && !publishedReference) {
          throw createError({ statusCode: 404, statusMessage: "رسانه پیدا نشد." });
        }
      } catch {
        throw createError({ statusCode: 404, statusMessage: "رسانه پیدا نشد." });
      }
    } else if (!hasPrivateMediaPermission) {
      throw createError({ statusCode: 404, statusMessage: "رسانه پیدا نشد." });
    }
  }

  const size = meta.sizeBytes;
  const range = parseMediaByteRange(getHeader(event, "range"), size);

  if (range === "unsatisfiable") {
    return createRangeNotSatisfiableResponse(`bytes */${size}`);
  }

  const start = range ? range.start : 0;
  const end = range ? range.end : null;
  let result: Awaited<ReturnType<typeof readMediaRange>>;
  try {
    result = await readMediaRange(id, start, end);
  } catch (error) {
    if (error instanceof IncompleteMediaRangeError) {
      throw createError({ statusCode: 404, statusMessage: "رسانه پیدا نشد." });
    }
    throw error;
  }

  if (!result) {
    throw createError({ statusCode: 404, statusMessage: "رسانه پیدا نشد." });
  }

  const headers: Record<string, string> = {
    "content-type": result.contentType,
    "content-length": String(result.bytes.length),
    "cache-control": liaraMediaCacheControl(meta.pathname, publishedReference),
    "accept-ranges": "bytes",
    "x-content-type-options": "nosniff",
    "content-disposition": disposition(meta.pathname, result.contentType),
    "content-security-policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'; media-src 'self' blob: data:",
    "cross-origin-resource-policy": "same-origin",
  };

  if (range) {
    headers["content-range"] = `bytes ${start}-${start + result.bytes.length - 1}/${size}`;
    headers.vary = "Range";
  }

  // `new Response` (instead of a raw stream) keeps the range semantics intact
  // through Vite dev and the deployed Node runtime alike.
  return new Response(new Uint8Array(result.bytes), {
    status: range ? 206 : 200,
    headers,
  });
});
