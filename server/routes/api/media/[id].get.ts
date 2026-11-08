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
import { getMediaMeta, readMediaRange } from "@/lib/media-store.server";
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

function parseRangeHeader(
  header: string | undefined,
  size: number,
): { start: number; end: number } | null | "unsatisfiable" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  if (!rawStart) {
    // Suffix range: last N bytes.
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return "unsatisfiable";
    const start = Math.max(0, size - suffix);
    return { start, end: size - 1 };
  }

  const start = Number(rawStart);
  if (!Number.isFinite(start) || start >= size) return "unsatisfiable";
  const end = rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;
  if (!Number.isFinite(end) || end < start) return "unsatisfiable";
  return { start, end };
}

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
  const range = parseRangeHeader(getHeader(event, "range"), size);

  if (range === "unsatisfiable") {
    return createRangeNotSatisfiableResponse(`bytes */${size}`);
  }

  const start = range ? range.start : 0;
  const end = range ? range.end : null;
  const result = await readMediaRange(id, start, end);

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
