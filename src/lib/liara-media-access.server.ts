export type MediaAccessSql = {
  query<T>(statement: string, parameters?: unknown[]): Promise<T[]>;
};

export type DatabaseMediaVisibility = "customer-submission" | "property-upload" | "public" | "unknown";

/** Known database media producers; unknown namespaces are private by default. */
export function databaseMediaVisibility(pathname: string): DatabaseMediaVisibility {
  if (pathname.startsWith("properties/customer-submissions/")) return "customer-submission";
  if (pathname.startsWith("properties/uploads/")) return "property-upload";
  if (
    pathname.startsWith("properties/divar/") ||
    pathname.startsWith("areas/uploads/") ||
    pathname.startsWith("music/")
  ) return "public";
  return "unknown";
}

/** Legacy Blob URLs are public, so only known public media paths may use that fallback. */
export function shouldUseLegacyBlobFallback(pathname: string, blobAvailable: boolean): boolean {
  return blobAvailable && databaseMediaVisibility(pathname) === "public";
}

export function liaraMediaCacheControl(key: string, publishedReference: boolean): string {
  if (key.startsWith("properties/customer-submissions/")) {
    return "private, no-store";
  }
  if (key.startsWith("properties/uploads/")) {
    return publishedReference ? "public, max-age=300, s-maxage=300" : "private, no-store";
  }
  if (
    key.startsWith("properties/divar/") ||
    key.startsWith("areas/uploads/") ||
    key.startsWith("music/")
  ) {
    return "public, max-age=31536000, immutable";
  }
  return "private, no-store";
}

function storedUploadUrlCandidates(rawUrl: string): string[] {
  try {
    const isAbsolute = /^https?:\/\//i.test(rawUrl);
    const normalized = new URL(rawUrl, "https://hirmandrealestate.ir");
    const candidates = [rawUrl, isAbsolute ? normalized.toString() : normalized.pathname + normalized.search];
    normalized.searchParams.delete("type");
    candidates.push(isAbsolute ? normalized.toString() : normalized.pathname + normalized.search);
    return [...new Set(candidates)];
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
         and exists (
           select 1
           from jsonb_array_elements_text(coalesce(s.property_data->'images', '[]'::jsonb)) as images(image_url)
           where regexp_replace(image_url, '#uploadId=[0-9a-f-]{36}$', '', 'i') = $2
         )
         limit 1
       ) as present`,
      [token, rawUrl],
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
  uploadId: string,
): Promise<boolean> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uploadId)) {
    return false;
  }
  const storedUrls = storedUploadUrlCandidates(rawUrl);
  try {
    const rows = await sql.query<{ present: boolean }>(
      `select exists(
         select 1
         from media_upload_sessions s
         where s.id = $3
           and s.kind = 'customer-property-media'
           and s.pathname = $1
           and s.stored_url = any($2::text[])
           and s.stored_storage in ('object-store', 'database')
           and s.completion_state = 'assembled'
           and s.completion_result is not null
           and s.created_at >= current_timestamp - interval '120 minutes'
         limit 1
       ) as present`,
      [key, storedUrls, uploadId],
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

export const LIARA_MEDIA_STREAM_IDLE_TIMEOUT_MS = 12_000;

/** Preserve backpressure while cancelling an upstream body that stops producing bytes. */
function withIdleTimeout(
  body: ReadableStream<Uint8Array>,
  timeoutMs: number,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let activeTimer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (cancelled) return;
      try {
        const result = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            activeTimer = setTimeout(
              () => {
                reject(new Error("Upstream Liara media stream stalled."));
                void reader.cancel().catch(() => undefined);
              },
              Math.max(1, timeoutMs),
            );
          }),
        ]);
        if (activeTimer) clearTimeout(activeTimer);
        activeTimer = undefined;
        if (cancelled) return;
        if (result.done) controller.close();
        else controller.enqueue(result.value);
      } catch (error) {
        if (activeTimer) clearTimeout(activeTimer);
        activeTimer = undefined;
        if (!cancelled) controller.error(error);
      }
    },
    async cancel(reason) {
      cancelled = true;
      if (activeTimer) clearTimeout(activeTimer);
      activeTimer = undefined;
      return reader.cancel(reason);
    },
  });
}

export function withLiaraStreamIdleTimeout(
  body: ReadableStream<Uint8Array> | null,
  timeoutMs = LIARA_MEDIA_STREAM_IDLE_TIMEOUT_MS,
): ReadableStream<Uint8Array> | null {
  return body ? withIdleTimeout(body, timeoutMs) : null;
}

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
  idleTimeoutMs = LIARA_MEDIA_STREAM_IDLE_TIMEOUT_MS,
): Response | null {
  if (upstream.status === 416) {
    const headers = new Headers({
      "accept-ranges": upstream.headers.get("accept-ranges") || "bytes",
      "cache-control": "no-store",
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-origin",
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

  return new Response(withLiaraStreamIdleTimeout(upstream.body, idleTimeoutMs), {
    status: upstream.status,
    headers,
  });
}
