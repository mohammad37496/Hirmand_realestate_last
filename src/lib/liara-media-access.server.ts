export type MediaAccessSql = {
  query<T>(statement: string, parameters?: unknown[]): Promise<T[]>;
};

export function liaraMediaCacheControl(key: string, publishedReference: boolean): string {
  if (
    key.startsWith("properties/customer-submissions/") ||
    (key.startsWith("properties/uploads/") && !publishedReference)
  ) {
    return "private, no-store";
  }
  return "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800";
}

function storedUploadUrlCandidates(rawUrl: string): string[] {
  try {
    const normalized = new URL(rawUrl);
    normalized.searchParams.delete("type");
    return [...new Set([rawUrl, normalized.toString()])];
  } catch {
    return [rawUrl];
  }
}

function publishedMediaCandidates(rawUrl: string): string[] {
  return [
    rawUrl,
    "/api/media-proxy?url=" + encodeURIComponent(rawUrl),
    "/api/liara-media?url=" + encodeURIComponent(rawUrl),
  ];
}

/** A Liara image is public only while a live property actually references it. */
export async function isPublishedPropertyMedia(
  sql: MediaAccessSql,
  rawUrl: string,
): Promise<boolean> {
  const candidates = publishedMediaCandidates(rawUrl);
  try {
    const rows = await sql.query<{ present: boolean }>(
      `select exists(
         select 1
         from properties p
         where p.deleted_at is null
           and (p.status = 'published' or (p.status = 'draft' and p.publish_at is not null and p.publish_at <= current_timestamp))
           and (p.unpublish_at is null or p.unpublish_at > current_timestamp)
           and (
             p.images @> $1::jsonb
             or p.images @> $2::jsonb
             or p.images @> $3::jsonb
             or p.floor_plan_url = any($4::text[])
             or p.virtual_tour_url = any($4::text[])
           )
         limit 1
       ) as present`,
      [
        JSON.stringify([candidates[0]]),
        JSON.stringify([candidates[1]]),
        JSON.stringify([candidates[2]]),
        candidates,
      ],
    );
    return rows[0]?.present === true;
  } catch {
    // Fail closed: database errors must never turn private media public.
    return false;
  }
}

/** The owner tracking code grants access only to the exact images of a rejected submission. */
export async function hasRejectedCustomerSubmissionMedia(
  sql: MediaAccessSql,
  trackingToken: string,
  rawUrl: string,
): Promise<boolean> {
  const token = trackingToken.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^HIR-[A-Z0-9]{2}-[A-F0-9]{12}$/.test(token)) return false;
  try {
    const rows = await sql.query<{ present: boolean }>(
      `select exists(
         select 1
         from customer_property_submissions s
         where s.public_tracking_token = $1
           and s.status = 'rejected'
           and s.property_data->'images' @> $2::jsonb
         limit 1
       ) as present`,
      [token, JSON.stringify([rawUrl])],
    );
    return rows[0]?.present === true;
  } catch {
    return false;
  }
}

/** A just-completed upload session is a short-lived capability for its exact object URL. */
export async function hasCompletedCustomerUploadMedia(
  sql: MediaAccessSql,
  key: string,
  rawUrl: string,
): Promise<boolean> {
  const storedUrls = storedUploadUrlCandidates(rawUrl);
  try {
    const rows = await sql.query<{ present: boolean }>(
      `select exists(
         select 1
         from media_upload_sessions s
         where s.kind = 'customer-property-media'
           and s.pathname = $1
           and s.stored_url = any($2::text[])
           and s.stored_storage = 'object-store'
           and s.completion_state = 'assembled'
           and s.completion_result is not null
           and s.created_at >= current_timestamp - interval '120 minutes'
         limit 1
       ) as present`,
      [key, storedUrls],
    );
    return rows[0]?.present === true;
  } catch {
    return false;
  }
}

const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

function videoContentType(upstream: Response, key: string): string | null {
  const declared = (upstream.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (ALLOWED_VIDEO_TYPES.has(declared)) return declared;
  if (declared && declared !== "application/octet-stream" && declared !== "binary/octet-stream") {
    return null;
  }

  const lowerKey = key.toLowerCase();
  if (lowerKey.endsWith(".mp4")) return "video/mp4";
  if (lowerKey.endsWith(".webm")) return "video/webm";
  if (lowerKey.endsWith(".mov")) return "video/quicktime";
  return null;
}

/** Stream a private Liara video while preserving browser byte-range semantics. */
export function createLiaraVideoResponse(
  upstream: Response,
  key: string,
  cacheControl: string,
): Response | null {
  if (upstream.status === 416) {
    const headers = new Headers({
      "accept-ranges": upstream.headers.get("accept-ranges") || "bytes",
      "cache-control": "no-store",
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
    });
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) headers.set("content-range", contentRange);
    return new Response(null, { status: 416, headers });
  }

  if (upstream.status !== 200 && upstream.status !== 206) return null;
  const contentType = videoContentType(upstream, key);
  if (!contentType) return null;

  const headers = new Headers({
    "content-type": contentType,
    "cache-control": cacheControl,
    "accept-ranges": upstream.headers.get("accept-ranges") || "bytes",
    "content-disposition": "inline",
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox; default-src 'none'",
    "cross-origin-resource-policy": "same-origin",
  });
  for (const name of ["content-length", "content-range", "last-modified", "etag"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (upstream.status === 206) headers.set("vary", "Range");

  return new Response(upstream.body, { status: upstream.status, headers });
}
