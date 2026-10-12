/**
 * Server-only media storage.
 *
 * Uploaded media lives in the application database (`media_objects`) and is
 * served from our own origin with HTTP range support. An external object store
 * (Vercel Blob) is used opportunistically when it is configured, so large files
 * keep the fast CDN path while everything still works with just `DATABASE_URL`.
 */

import { dbSource, getSql } from "@/lib/db";
import { DB_MEDIA_PATH } from "@/lib/media";
import {
  deleteLiaraObject,
  liaraObjectKeyFromUrl,
  liaraStorageConfigured,
  putLiaraObject,
} from "@/lib/liara-object-storage.server";

/** Largest assembled file we will hand to the object store from memory. */
const MAX_OFFLOAD_BYTES = 32 * 1024 * 1024;

export type StoredMedia = {
  /** Public URL, either an absolute CDN URL or a same-origin `/api/media/<id>`. */
  url: string;
  storage: "object-store" | "database";
  /** Database row id when `storage` is `database`. */
  id: string | null;
};

export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

export function isDatabaseMediaUrl(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(DB_MEDIA_PATH);
}

export function mediaIdFromUrl(value: string | null | undefined): string | null {
  if (!isDatabaseMediaUrl(value)) return null;
  const raw = value!.slice(DB_MEDIA_PATH.length).split(/[?#]/)[0] ?? "";
  const id = raw.trim();
  return id ? decodeURIComponent(id) : null;
}

export function requireDatabase(): void {
  if (dbSource === "unconfigured") {
    throw new Error(
      "برای ذخیره رسانه، اتصال پایگاه داده (DATABASE_URL) لازم است.",
    );
  }
}

function toBytes(data: Buffer | Uint8Array): Buffer {
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

async function putToObjectStore(
  pathname: string,
  bytes: Buffer,
  contentType: string,
): Promise<string | null> {
  try {
    const { put } = await import("@vercel/blob");
    const result = await put(pathname, bytes, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });
    return result.url ?? null;
  } catch (error) {
    console.warn(
      "[media] object store upload failed, falling back to the database:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Persist bytes and return a URL that can be handed straight to a browser.
 * Prefers the object storage CDN, then falls back to the database so media is
 * never lost because a third-party store is unconfigured or unavailable.
 */
export async function storeMedia(input: {
  pathname: string;
  data: Buffer | Uint8Array;
  contentType: string;
}): Promise<StoredMedia> {
  const bytes = toBytes(input.data);
  const contentType = input.contentType || "application/octet-stream";

  if (liaraStorageConfigured()) {
    const url = await putLiaraObject({
      key: input.pathname,
      body: bytes,
      contentType,
    });
    if (url) return { url, storage: "object-store", id: null };
  }

  // Legacy Vercel Blob remains a compatibility path for existing deployments.
  if (blobConfigured()) {
    const url = await putToObjectStore(input.pathname, bytes, contentType);
    if (url) return { url, storage: "object-store", id: null };
  }

  requireDatabase();
  const sql = await getSql();
  const id = crypto.randomUUID();
  await sql.query(
    `insert into media_objects (id, pathname, content_type, size_bytes, data)
     values ($1, $2, $3, $4, $5)`,
    [id, input.pathname, contentType, bytes.length, bytes],
  );

  return { url: `${DB_MEDIA_PATH}${id}`, storage: "database", id };
}

/**
 * Store a pre-assembled object whose chunks already live in the staging tables.
 * Assembly happens inside Postgres (`string_agg` over the chunk rows) so a large
 * file never has to be materialised in the serverless function.
 */
export type AssembledUploadTransform = (input: {
  data: Buffer;
  contentType: string;
  pathname: string;
}) => Promise<{
  data: Buffer;
  contentType: string;
  pathname: string;
} | null>;

export async function storeAssembledUpload(input: {
  pathname: string;
  contentType: string;
  sessionId: string;
  transform?: AssembledUploadTransform;
}): Promise<StoredMedia> {
  requireDatabase();
  const sql = await getSql();
  let contentType = input.contentType || "application/octet-stream";
  let pathname = input.pathname;

  // Completion can be retried after the business insert or the final cleanup
  // failed. Reuse the already assembled object instead of creating a second
  // copy of a large upload.
  const existing = await sql.query<{
    stored_url: string | null;
    stored_storage: string | null;
    stored_media_id: string | null;
  }>(
    `select stored_url, stored_storage, stored_media_id
     from media_upload_sessions where id = $1 limit 1`,
    [input.sessionId],
  );
  if (existing[0]?.stored_url) {
    return {
      url: existing[0].stored_url,
      storage: existing[0].stored_storage === "object-store" ? "object-store" : "database",
      id: existing[0].stored_media_id,
    };
  }

  const id = crypto.randomUUID();

  // The chunks are concatenated inside Postgres, so a large file never has to
  // be assembled by the function itself.
  await sql.query(
    `insert into media_objects (id, pathname, content_type, size_bytes, data)
     select $1, $2, $3, coalesce(sum(octet_length(data)), 0), string_agg(data, ''::bytea order by chunk_index)
     from media_upload_chunks
     where session_id = $4`,
    [id, pathname, contentType, input.sessionId],
  );

  let dataResult = await readMediaRange(id, 0, null);
  if (!dataResult || !dataResult.bytes.length) {
    throw new Error("فایل assembled شده در پایگاه داده پیدا نشد یا خالی است.");
  }

  // Transformations (such as permanent video watermarking) happen before the
  // object can leave the database, so the final URL always points to the
  // processed bytes and the original upload is never published as a fallback.
  if (input.transform) {
    try {
      const transformed = await input.transform({
        data: dataResult.bytes,
        contentType,
        pathname,
      });

      if (transformed) {
        const nextData = Buffer.from(transformed.data);
        if (!nextData.length) {
          throw new Error("خروجی پردازش رسانه خالی است.");
        }
        contentType = transformed.contentType || contentType;
        pathname = transformed.pathname || pathname;

        await sql.query(
          `update media_objects
           set pathname = $2, content_type = $3, size_bytes = $4, data = $5
           where id = $1`,
          [id, pathname, contentType, nextData.length, nextData],
        );
        dataResult = {
          bytes: nextData,
          size: nextData.length,
          contentType,
        };
      }
    } catch (error) {
      await sql.query("delete from media_objects where id = $1", [id]).catch(() => undefined);
      throw error;
    }
  }

  // With an object store configured, move the finished file to the CDN and drop
  // the database copy; if that fails the stored row still serves the media.
  let stored: StoredMedia = {
    url: `${DB_MEDIA_PATH}${id}`,
    storage: "database",
    id,
  };

  if (dataResult.size > 0 && dataResult.size <= MAX_OFFLOAD_BYTES) {
    if (liaraStorageConfigured()) {
      const url = await putLiaraObject({
        key: pathname,
        body: dataResult.bytes,
        contentType,
      });
      if (url) {
        await sql.query("delete from media_objects where id = $1", [id]);
        stored = { url, storage: "object-store", id: null };
      }
    } else if (blobConfigured()) {
      const url = await putToObjectStore(pathname, dataResult.bytes, contentType);
      if (url) {
        await sql.query("delete from media_objects where id = $1", [id]);
        stored = { url, storage: "object-store", id: null };
      }
    }
  }

  // Keep the session until the caller's business record is committed. This
  // makes a retry observable and lets us return the same URL/result.
  await sql.query(
    `update media_upload_sessions
     set completion_state = 'assembled', stored_url = $2, stored_storage = $3, stored_media_id = $4
     where id = $1`,
    [input.sessionId, stored.url, stored.storage, stored.id],
  );
  return stored;
}
export async function deleteStoredMedia(
  url: string | null | undefined,
): Promise<void> {
  if (!url) return;

  const liaraKey = liaraObjectKeyFromUrl(url);
  if (liaraKey) {
    try {
      await deleteLiaraObject(liaraKey);
    } catch (error) {
      console.warn("[media] Liara Object Storage delete failed", error);
    }
    return;
  }

  if (isDatabaseMediaUrl(url)) {
    const id = mediaIdFromUrl(url);
    if (!id) return;
    try {
      requireDatabase();
      const sql = await getSql();
      await sql.query("delete from media_objects where id = $1", [id]);
    } catch (error) {
      console.warn("[media] database delete failed", error);
    }
    return;
  }

  try {
    const parsed = new URL(url);
    const isObjectStoreHost =
      parsed.hostname === "blob.vercel-storage.com" ||
      parsed.hostname.endsWith(".blob.vercel-storage.com");
    if (parsed.protocol === "https:" && isObjectStoreHost) {
      const { del } = await import("@vercel/blob");
      await del(url);
    }
  } catch (error) {
    console.warn("[media] object store delete failed", error);
  }
}

export type MediaMeta = {
  id: string;
  contentType: string;
  sizeBytes: number;
  pathname: string;
};

export async function getMediaMeta(id: string): Promise<MediaMeta | null> {
  if (dbSource === "unconfigured") return null;
  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>(
    `select id, pathname, content_type, size_bytes
     from media_objects where id = $1 limit 1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    pathname: String(row.pathname ?? ""),
    contentType: String(row.content_type ?? "application/octet-stream"),
    sizeBytes: Number(row.size_bytes) || 0,
  };
}

/**
 * Read `[start, end]` (inclusive, 0-based) of a stored object without pulling
 * the whole blob into memory. `end` defaults to the last byte.
 */
export async function readMediaRange(
  id: string,
  start: number,
  end: number | null,
): Promise<{ bytes: Buffer; size: number; contentType: string } | null> {
  const meta = await getMediaMeta(id);
  if (!meta) return null;

  const size = meta.sizeBytes;
  const safeStart = Math.max(0, Math.min(start, Math.max(size - 1, 0)));
  const safeEnd = end == null ? Math.max(size - 1, 0) : Math.min(end, size - 1);
  const length = Math.max(0, safeEnd - safeStart + 1);

  if (size === 0 || length === 0) {
    return { bytes: Buffer.alloc(0), size, contentType: meta.contentType };
  }

  const sql = await getSql();
  const rows = await sql.query<{ data?: Uint8Array }>(
    `select substring(data from $2 for $3) as data
     from media_objects where id = $1 limit 1`,
    [id, safeStart + 1, length],
  );

  const raw = rows[0]?.data;
  return {
    // `pg` hands back a Buffer, PGlite a Uint8Array; both are byte containers.
    bytes: raw ? (Buffer.isBuffer(raw) ? raw : Buffer.from(raw)) : Buffer.alloc(0),
    size,
    contentType: meta.contentType,
  };
}

/**
 * Delete abandoned staging sessions so chunk uploads that never complete do not
 * fill the database forever.
 */
export async function pruneStaleUploadSessions(
  maxAgeMinutes = 120,
): Promise<void> {
  if (dbSource === "unconfigured") return;
  try {
    const sql = await getSql();
    await sql.query(
      `delete from media_upload_sessions
       where created_at < current_timestamp - ($1::text || ' minutes')::interval`,
      [String(maxAgeMinutes)],
    );
  } catch (error) {
    console.warn("[media] pruning stale upload sessions failed", error);
  }
}
