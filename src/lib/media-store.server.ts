/**
 * Server-only media storage.
 *
 * Uploaded media lives in the application database (`media_objects`) and is
 * served from our own origin with HTTP range support. An external object store
 * (Vercel Blob) is used opportunistically when it is configured, so large files
 * keep the fast CDN path while everything still works with just `DATABASE_URL`.
 */

import { dbSource, getSql, withSqlTransaction, type Sql } from "@/lib/db";
import { DB_MEDIA_PATH } from "@/lib/media";
import { hasMediaUrlReferences, mediaReferenceNeedles, removeOrphanedVideoRenditionManifest } from "@/lib/media-reference-guard.server";
import { assertMediaCleanupDatabaseConfigured, assertMediaObjectWritable, deletePreparedMediaCleanupJobInTransaction, lockMediaObjectIdentity, lockMediaReferenceWrites, prepareMediaCleanupJobInTransaction, upsertMediaCleanupJob } from "@/lib/media-cleanup-transaction.server";
import {
  deleteLiaraObject,
  liaraMediaProxyUrl,
  liaraObjectKeyFromBrowserProxy,
  liaraObjectKeyFromUrl,
  liaraStorageConfigured,
  putLiaraObject,
  putLiaraObjectFromFile,
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

/** Browser-safe URL for media uploaded to either private Liara storage or the database. */
export function mediaUrlForBrowser(value: string, contentType = ""): string {
  const proxyUrl = liaraMediaProxyUrl(value, contentType);
  if (proxyUrl !== value) return proxyUrl;
  if (contentType.toLowerCase().startsWith("video/") && value.startsWith(DB_MEDIA_PATH)) {
    return value + (value.includes("?") ? "&" : "?") + "type=video";
  }
  return value;
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

/** Upload to a deterministic Liara key only while its per-object cleanup lock is held. */
export async function putLiaraObjectSafely(input: {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
}): Promise<string | null> {
  requireDatabase();
  const mediaUrl = `liara://${input.key}`;
  return withSqlTransaction(async (tx) => {
    await lockMediaObjectIdentity(tx, mediaUrl);
    await assertMediaObjectWritable(tx, mediaUrl, input.key);
    return putLiaraObject(input);
  });
}

/** File-backed rendition uploads use the same tombstone check as byte uploads. */
export async function putLiaraObjectFromFileSafely(input: {
  key: string;
  filePath: string;
  contentType: string;
}): Promise<string | null> {
  requireDatabase();
  const mediaUrl = `liara://${input.key}`;
  return withSqlTransaction(async (tx) => {
    await lockMediaObjectIdentity(tx, mediaUrl);
    await assertMediaObjectWritable(tx, mediaUrl, input.key);
    return putLiaraObjectFromFile(input);
  });
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
  /** Optional deterministic id used by idempotent upload sessions. */
  id?: string;
  /** Skip legacy foreign Blob storage for sources that must stay on Hirmand/Liara/DB. */
  allowLegacyBlob?: boolean;
}): Promise<StoredMedia> {
  requireDatabase();
  const bytes = toBytes(input.data);
  const contentType = input.contentType || "application/octet-stream";

  // When a previous attempt reached the DB fallback but lost its final HTTP
  // response, return the same durable object instead of inserting a duplicate.
  if (input.id) {
    requireDatabase();
    const existing = await withSqlTransaction(async (tx) => {
      const url = `${DB_MEDIA_PATH}${input.id}`;
      await lockMediaObjectIdentity(tx, url);
      await assertMediaObjectWritable(tx, url);
      return tx.query<Record<string, unknown>>(
        `select id, pathname, content_type from media_objects where id = $1 limit 1`,
        [input.id],
      );
    });
    if (existing[0]) {
      if (
        String(existing[0].pathname ?? "") !== input.pathname ||
        String(existing[0].content_type ?? "") !== contentType
      ) {
        throw new Error("شناسه رسانه از قبل برای فایل دیگری استفاده شده است.");
      }
      return { url: `${DB_MEDIA_PATH}${input.id}`, storage: "database", id: input.id };
    }
  }

  if (liaraStorageConfigured()) {
    const url = await putLiaraObjectSafely({
      key: input.pathname,
      body: bytes,
      contentType,
    });
    if (url) return { url, storage: "object-store", id: null };
  }

  // Legacy Vercel Blob remains a compatibility path for existing deployments.
  if (input.allowLegacyBlob !== false && blobConfigured()) {
    const url = await putToObjectStore(input.pathname, bytes, contentType);
    if (url) return { url, storage: "object-store", id: null };
  }

  requireDatabase();
  const id = input.id ?? crypto.randomUUID();
  await withSqlTransaction(async (tx) => {
    const url = `${DB_MEDIA_PATH}${id}`;
    await lockMediaObjectIdentity(tx, url);
    await assertMediaObjectWritable(tx, url);
    await tx.query(
      `insert into media_objects (id, pathname, content_type, size_bytes, data)
       values ($1, $2, $3, $4, $5)
       on conflict (id) do nothing`,
      [id, input.pathname, contentType, bytes.length, bytes],
    );

    const stored = await tx.query<Record<string, unknown>>(
      "select pathname, content_type from media_objects where id = $1 limit 1",
      [id],
    );
    if (
      !stored[0] ||
      String(stored[0].pathname ?? "") !== input.pathname ||
      String(stored[0].content_type ?? "") !== contentType
    ) {
      throw new Error("ذخیره رسانه در فضای پایدار تأیید نشد.");
    }
  });

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
  /** Keep the durable database copy as the final source; useful for same-origin audio playback. */
  forceDatabaseStorage?: boolean;
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
      try {
        await deleteStoredMedia(`${DB_MEDIA_PATH}${id}`, { throwOnFailure: true });
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Media transformation failed and its staged object cleanup could not be completed.");
      }
      throw error;
    }
  }

  // Commit a usable database URL before attempting the optional CDN offload.
  // If the remote put succeeds but updating the session fails, the database row
  // remains intact and a retried completion can safely return this fallback URL.
  let stored: StoredMedia = {
    url: `${DB_MEDIA_PATH}${id}`,
    storage: "database",
    id,
  };

  // Do not delete the database row if this update throws: the transaction
  // may have committed even if its acknowledgement was lost.
  await sql.query(
    "update media_upload_sessions\n     set completion_state = 'assembled', stored_url = $2, stored_storage = $3, stored_media_id = $4\n     where id = $1",
    [input.sessionId, stored.url, stored.storage, stored.id],
  );

  if (!input.forceDatabaseStorage && dataResult.size > 0 && dataResult.size <= MAX_OFFLOAD_BYTES) {
    let remoteUrl: string | null = null;

    if (liaraStorageConfigured()) {
      remoteUrl = await putLiaraObjectSafely({
        key: pathname,
        body: dataResult.bytes,
        contentType,
      });
    } else if (blobConfigured()) {
      remoteUrl = await putToObjectStore(pathname, dataResult.bytes, contentType);
    }

    if (remoteUrl) {
      const remoteStored: StoredMedia = {
        url: remoteUrl,
        storage: "object-store",
        id: null,
      };

      // Commit the public CDN URL before deleting the durable database fallback.
      // The SQL update may have committed even if its acknowledgement is lost.
      // Do not delete the remote object in this ambiguous state: the session may
      // already reference it. An orphan is safer than a broken URL.
      await sql.query(
        "update media_upload_sessions\n         set completion_state = 'assembled', stored_url = $2, stored_storage = $3, stored_media_id = $4\n         where id = $1",
        [input.sessionId, remoteStored.url, remoteStored.storage, remoteStored.id],
      );

      const cleanupJobIds = await withSqlTransaction(async (tx) => {
        await tx.query(
          "update media_upload_sessions\n     set completion_state = 'assembled', stored_url = $2, stored_storage = $3, stored_media_id = $4\n     where id = $1",
          [input.sessionId, remoteStored.url, remoteStored.storage, remoteStored.id],
        );
        const [job] = await enqueueMediaCleanupJob(tx, `${DB_MEDIA_PATH}${id}`);
        return job ? [job.id] : [];
      });
      await processMediaCleanupJobs(cleanupJobIds, sql);
      stored = remoteStored;
    }
  }

  return stored;
}

export async function deleteStoredMedia(
  url: string | null | undefined,
  options: { throwOnFailure?: boolean } = {},
): Promise<void> {
  if (!url) return;
  const liaraKey = liaraObjectKeyFromUrl(url) ?? liaraObjectKeyFromBrowserProxy(url);
  const databaseId = mediaIdFromUrl(url);
  let blobUrl = false;
  let liaraProxyUrl = false;
  try {
    const parsed = new URL(url);
    blobUrl = parsed.protocol === "https:" && (parsed.hostname === "blob.vercel-storage.com" || parsed.hostname.endsWith(".blob.vercel-storage.com"));
    liaraProxyUrl = parsed.pathname === "/api/liara-media";
  } catch { /* unsupported URL */ }
  if (liaraProxyUrl && !liaraKey) throw new Error("Cannot resolve the Liara object key for media cleanup.");
  if (!liaraKey && !databaseId && !blobUrl) return;
  assertMediaCleanupDatabaseConfigured(dbSource);

  const sql = await getSql();
  const [job] = await withSqlTransaction(async (tx) => enqueueMediaCleanupJob(tx, url));
  if (!job) throw new Error("Media cleanup could not be queued for retry.");
  await processMediaCleanupJob(job.id, sql);
  void options;
}

/** Persist a cleanup request in the caller's transaction before its owner row is removed. */
export async function enqueueMediaCleanupJob(sql: Sql, url: string): Promise<Array<{ id: number }>> {
  const liaraKey = liaraObjectKeyFromUrl(url) ?? liaraObjectKeyFromBrowserProxy(url);
  const databaseId = mediaIdFromUrl(url);
  let isBlob = false;
  try {
    const parsed = new URL(url);
    isBlob = parsed.protocol === "https:" && (parsed.hostname === "blob.vercel-storage.com" || parsed.hostname.endsWith(".blob.vercel-storage.com"));
  } catch { /* unsupported URL */ }
  if (!liaraKey && !databaseId && !isBlob) return [];
  let canonicalUrl = url;
  if (liaraKey) canonicalUrl = `liara://${liaraKey}`;
  else if (databaseId) canonicalUrl = `${DB_MEDIA_PATH}${databaseId}`;
  else if (isBlob) {
    const parsed = new URL(url);
    canonicalUrl = `${parsed.origin}${parsed.pathname}`;
  }
  return upsertMediaCleanupJob(sql, {
    mediaUrl: canonicalUrl,
    liaraKey,
    referenceTokens: mediaReferenceNeedles(url, liaraKey),
  });
}

async function processMediaCleanupJob(jobId: number, sql: Sql): Promise<"completed" | "retained" | "missing"> {
  let prepared: Awaited<ReturnType<typeof prepareMediaCleanupJobInTransaction>>;
  const renditionJobIds: number[] = [];
  try {
    prepared = await withSqlTransaction((tx) => prepareMediaCleanupJobInTransaction(tx, jobId, async (renditionUrl) => {
      const [renditionJob] = await enqueueMediaCleanupJob(tx, renditionUrl);
      if (renditionJob) renditionJobIds.push(renditionJob.id);
    }));
    if (prepared.status !== "deleting") return prepared.status;
    // The deleting tombstone is already committed. A job-row lock serializes
    // concurrent workers while the idempotent external DELETE runs; a crash
    // rolls back completion but never the tombstone that blocks new writers.
    const result = await withSqlTransaction((tx) => deletePreparedMediaCleanupJobInTransaction(tx, jobId, async (job) => {
      if (job.liara_key) await deleteLiaraObject(job.liara_key);
      else {
        const { del } = await import("@vercel/blob");
        await del(job.media_url);
      }
    }));
    if (result === "completed" && renditionJobIds.length) {
      await processMediaCleanupJobs(renditionJobIds, sql);
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Unknown media cleanup failure";
    try {
      await sql.query("update media_cleanup_jobs set attempts=attempts+1,last_error=$2,next_attempt_at=current_timestamp + make_interval(secs => least(3600,power(2,least(attempts,10))::integer)),updated_at=current_timestamp where id=$1 and status in ('pending','retained','deleting')", [jobId, message]);
    } catch (persistError) {
      throw new AggregateError([error, persistError], "Media cleanup failed and its retry metadata could not be persisted.");
    }
    throw error;
  }
}

export async function retryPendingMediaCleanupJobs(limit = 20, forceRetained = false): Promise<{ completed: number; retained: number }> {
  if (dbSource === "unconfigured") return { completed: 0, retained: 0 };
  const sql = await getSql();
  const jobs = await sql.query<{ id: number }>("select id from media_cleanup_jobs where (status in ('pending','deleting') and next_attempt_at <= current_timestamp) or ($2::boolean and status='retained') order by next_attempt_at,id limit $1", [Math.max(1, Math.min(100, Math.trunc(limit))), forceRetained]);
  return processMediaCleanupJobs(jobs.map((job) => job.id), sql);
}

export async function processMediaCleanupJobs(jobIds: number[], existingSql?: Sql): Promise<{ completed: number; retained: number }> {
  assertMediaCleanupDatabaseConfigured(dbSource);
  const sql = existingSql ?? await getSql();
  const failures: unknown[] = [];
  let completed = 0;
  let retained = 0;
  for (const jobId of [...new Set(jobIds)]) {
    try {
      const result = await processMediaCleanupJob(jobId, sql);
      if (result === "completed") completed += 1;
      else if (result === "retained") retained += 1;
    } catch (error) { failures.push(error); }
  }
  if (failures.length) throw new AggregateError(failures, "One or more media cleanup jobs remain pending.");
  return { completed, retained };
}

/** Queue the source and all orphaned renditions atomically before deleting any object. */
export async function deletePropertyMedia(url: string): Promise<void> {
  if (!url?.trim()) return;
  assertMediaCleanupDatabaseConfigured(dbSource);
  const sql = await getSql();
  const jobs = await withSqlTransaction(async (tx) => {
    await lockMediaReferenceWrites(tx);
    const liaraKey = liaraObjectKeyFromUrl(url) ?? liaraObjectKeyFromBrowserProxy(url);
    const manifest = await removeOrphanedVideoRenditionManifest(tx, url, liaraKey);
    if (!manifest.removed && await hasMediaUrlReferences(tx, url, liaraKey)) return [];
    const candidates = [...new Set((manifest.removed ? [...manifest.renditionUrls, url] : [url]).filter(Boolean))];
    const queued: number[] = [];
    for (const candidate of candidates) {
      const [job] = await enqueueMediaCleanupJob(tx, candidate);
      if (job) queued.push(job.id);
    }
    return queued;
  });
  for (const jobId of jobs) await processMediaCleanupJob(jobId, sql);
}

/** Revisit old rendition manifests after a crashed encoder or a concurrent property deletion. */
export async function pruneOrphanedVideoRenditionManifests(limit = 25): Promise<number> {
  if (dbSource === "unconfigured") return 0;
  const sql = await getSql();
  const manifests = await sql.query<{ source_url: string }>(
    "select source_url from property_video_renditions where created_at < current_timestamp - interval '30 minutes' and coalesce(renditions->>'processing','false') <> 'true' order by created_at limit $1",
    [Math.max(1, Math.min(100, Math.trunc(limit)))],
  );
  for (const manifest of manifests) await deletePropertyMedia(manifest.source_url);
  return manifests.length;
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
    await withSqlTransaction(async (tx) => {
      const expired = await tx.query<{ stored_url: string | null; stored_media_id: string | null }>(
        `delete from media_upload_sessions
         where created_at < current_timestamp - ($1::text || ' minutes')::interval
         returning stored_url,stored_media_id`,
        [String(maxAgeMinutes)],
      );
      for (const row of expired) {
        const url = row.stored_url || (row.stored_media_id ? `${DB_MEDIA_PATH}${row.stored_media_id}` : null);
        if (url) await enqueueMediaCleanupJob(tx, url);
      }
    });
    await pruneOrphanedVideoRenditionManifests();
    await retryPendingMediaCleanupJobs();
  } catch (error) {
    console.warn("[media] pruning stale upload sessions failed", error);
    throw error;
  }
}
