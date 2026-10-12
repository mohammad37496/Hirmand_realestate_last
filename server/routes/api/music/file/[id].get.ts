import { createError, defineEventHandler, getHeader, getRouterParam } from "h3";
import { dbSource, getSql } from "@/lib/db";
import {
  getLiaraObject,
  liaraObjectKeyFromUrl,
} from "@/lib/liara-object-storage.server";
import {
  isPlayableMediaUrl,
  normalizeStoredMediaUrl,
} from "@/lib/music-library.server";
import { isDatabaseMediaUrl } from "@/lib/media-store.server";

const CACHE_CONTROL =
  "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";

function copyHeader(
  response: Response,
  headers: Record<string, string>,
  name: string,
): void {
  const value = response.headers.get(name);
  if (value) headers[name] = value;
}

/**
 * Streams a music track through the application when its Liara object is
 * private. Direct public URLs remain supported, but this route is now a real
 * Range-aware fallback instead of redirecting back to the same storage URL.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id")?.trim();

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "شناسه آهنگ نامعتبر است.",
    });
  }

  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 404, statusMessage: "آهنگ پیدا نشد." });
  }

  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>(
    "select url, mime_type from music_tracks where id = $1 and active = true limit 1",
    [id],
  );
  const row = rows[0];

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: "آهنگ پیدا نشد." });
  }

  const target = normalizeStoredMediaUrl(String(row.url));

  if (!isPlayableMediaUrl(target)) {
    throw createError({
      statusCode: 502,
      statusMessage: "نشانی فایل موسیقی قابل پخش نیست.",
    });
  }

  // Database-backed media already has a correct same-origin Range endpoint.
  if (isDatabaseMediaUrl(target)) {
    return new Response(null, {
      status: 307,
      headers: {
        location: target,
        "cache-control": CACHE_CONTROL,
        "content-disposition": "inline",
      },
    });
  }

  const liaraKey = liaraObjectKeyFromUrl(target);
  const range = getHeader(event, "range")?.trim();

  // Liara objects may be private. Fetch them server-side with the storage
  // credentials, while forwarding the browser's Range header.
  if (liaraKey) {
    const upstream = await getLiaraObject({ key: liaraKey, range });

    if (!upstream) {
      throw createError({
        statusCode: 502,
        statusMessage: "دسترسی به فایل موسیقی برقرار نشد.",
      });
    }

    if (!upstream.ok) {
      const status = upstream.status === 404 ? 404 : 502;
      throw createError({
        statusCode: status,
        statusMessage:
          status === 404
            ? "فایل موسیقی پیدا نشد."
            : "فایل موسیقی از فضای ذخیره‌سازی قابل دریافت نیست.",
      });
    }

    const headers: Record<string, string> = {
      "cache-control": CACHE_CONTROL,
      "accept-ranges": upstream.headers.get("accept-ranges") || "bytes",
      "content-disposition": "inline",
      "content-type":
        upstream.headers.get("content-type") ||
        String(row.mime_type || "audio/mpeg"),
      "x-content-type-options": "nosniff",
    };

    copyHeader(upstream, headers, "content-length");
    copyHeader(upstream, headers, "content-range");
    copyHeader(upstream, headers, "etag");

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  }

  // Legacy/public remote storage continues to work through the redirect path.
  return new Response(null, {
    status: 307,
    headers: {
      location: target,
      "cache-control":
        "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      "content-disposition": "inline",
    },
  });
});
