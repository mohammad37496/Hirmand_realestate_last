/**
 * Shared chunked upload protocol.
 *
 * A browser uploads a file one slice at a time so progress reflects bytes that
 * really left the client, request bodies stay far below any serverless body
 * limit, and a failure can name the exact step that broke. Both the music
 * library and the property media library use this handler.
 */

import {
  createError,
  getCookie,
  getHeader,
  readBody,
  readRawBody,
  setResponseHeader,
  type H3Event,
} from "h3";
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin-session.server";
import {
  assertSameOrigin,
  clientFingerprint,
  consumeAdminAttempt,
  tooManyAttemptsError,
} from "@/lib/admin-rate-limit.server";
import { dbSource, getSql, withSqlTransaction } from "@/lib/db";
import { lockMediaReferenceWrites } from "@/lib/media-cleanup-transaction.server";
import { contentMatchesDeclaredType } from "@/lib/file-signature.server";
import { matchesUploadSessionScope, uploadSessionScopePrefix } from "@/lib/upload-session-scope";
import {
  enqueueMediaCleanupJob,
  getMediaMeta,
  pruneStaleUploadSessions,
  readMediaRange,
  retryPendingMediaCleanupJobs,
  storeAssembledUpload,
  type StoredMedia,
} from "@/lib/media-store.server";

export const DEFAULT_CHUNK_SIZE = 2 * 1024 * 1024;

/** Enough bytes to identify every container we accept. */
const SIGNATURE_PROBE_BYTES = 32;

type SessionRow = Record<string, unknown>;

export type TextField = {
  column: "title" | "artist";
  label: string;
  required?: boolean;
  maxLength: number;
};

export type ChunkedUploadConfig = {
  /** Row flavour in `media_upload_sessions`. */
  kind: string;
  /** Public submissions deliberately skip admin-session auth but keep same-origin and rate limiting. */
  access?: "admin" | "public";
  /** Keep media on the application's own origin instead of offloading it to a CDN. */
  forceDatabaseStorage?: boolean;
  /** Path prefix for stored objects, e.g. `music` or `properties/uploads`. */
  pathPrefix: string;
  maxBytes: number;
  chunkSize?: number;
  /** Returns the content type to store, or null when the file is not allowed. */
  resolveContentType: (input: { filename: string; declared: string }) => string | null;
  unsupportedTypeMessage: string;
  sizeLimitMessage: (limitMb: number) => string;
  textFields?: TextField[];
  /** Recover a completed business record if its short-lived upload receipt was pruned. */
  recoverCompleted?: (input: {
    uploadId: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    text: Record<string, string>;
  }) => Promise<Record<string, unknown> | null>;
  /** Called once every chunk arrived; persists the business record. */
  finish: (input: {
    stored: StoredMedia;
    session: SessionRow;
    text: Record<string, string>;
    totalBytes: number;
  }) => Promise<unknown>;
  /** Optional server-side media transformation before the final object is persisted. */
  transform?: (input: {
    data: Buffer;
    contentType: string;
    pathname: string;
    session: SessionRow;
    totalBytes: number;
  }) => Promise<{
    data: Buffer;
    contentType: string;
    pathname: string;
  } | null>;
};

const SIGNATURE_REJECTION = Symbol("signature-rejection");

function isSignatureRejection(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { rejection?: symbol }).rejection === SIGNATURE_REJECTION
  );
}

function httpError(message: string, statusCode = 400) {
  return createError({ statusCode, statusMessage: message });
}

function signatureRejection(message: string) {
  const error = new Error(message);
  (error as Error & { rejection?: symbol }).rejection = SIGNATURE_REJECTION;
  return error;
}

/**
 * Verifies the assembled object really is the media type the upload claimed.
 * Object-store uploads cannot be byte-inspected cheaply, so they are trusted
 * there (the CDN only ever serves what we uploaded); database-backed media is
 * always checked.
 */
async function assertStoredContentType(stored: StoredMedia, declaredType: string) {
  if (stored.storage !== "database" || !stored.id) return;

  const meta = await getMediaMeta(stored.id);
  if (!meta) throw signatureRejection("فایل آپلودشده پیدا نشد.");

  const probe = await readMediaRange(stored.id, 0, SIGNATURE_PROBE_BYTES - 1);
  if (!probe || !probe.bytes.length) throw signatureRejection("فایل آپلودشده خالی است.");

  if (!contentMatchesDeclaredType(probe.bytes, declaredType)) {
    throw signatureRejection("محتوای فایل با نوع اعلام‌شده هم‌خوانی ندارد.");
  }
}

function safePathSegment(filename: string): string {
  const cleaned = filename
    .replace(/[^\w.\u0600-\u06FF-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-100);
  return cleaned || "file";
}

async function loadSession(uploadId: string): Promise<SessionRow | null> {
  const sql = await getSql();
  const rows = await sql.query<SessionRow>(
    `select * from media_upload_sessions where id = $1 limit 1`,
    [uploadId],
  );
  return rows[0] ?? null;
}

export async function handleChunkedUpload(
  event: H3Event,
  config: ChunkedUploadConfig,
): Promise<unknown> {
  setResponseHeader(event, "cache-control", "no-store");

  const adminAccess = config.access !== "public";
  if (adminAccess && !await verifyAdminSessionToken(getCookie(event, ADMIN_SESSION_COOKIE))) {
    throw httpError("نشست مدیریت معتبر نیست. دوباره وارد پنل شوید.", 401);
  }

  if (dbSource === "unconfigured") {
    throw httpError(
      "برای آپلود رسانه، اتصال پایگاه داده (DATABASE_URL) لازم است.",
      503,
    );
  }

  assertSameOrigin(event);

  const chunkSize = config.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const maxChunkBytes = chunkSize + 512 * 1024;
  const uploadIdHeader = getHeader(event, "x-upload-id")?.trim();

  // --- Raw chunk body -------------------------------------------------------
  if (uploadIdHeader) {
    const index = Number(getHeader(event, "x-upload-index")?.trim() ?? "");
    if (!Number.isInteger(index) || index < 0) {
      throw httpError("شماره قطعه ارسالی نامعتبر است.");
    }

    const session = await loadSession(uploadIdHeader);
    if (!session) {
      throw httpError("نشست آپلود پیدا نشد یا برای این مسیر معتبر نیست.", 404);
    }
    if (!matchesUploadSessionScope(session, config.kind, config.pathPrefix)) {
      throw httpError("نشست آپلود پیدا نشد یا برای این مسیر معتبر نیست.", 404);
    }
    if (String(session.completion_state ?? "pending") !== "pending") {
      throw httpError("این آپلود در مرحله نهایی‌سازی است و قطعه جدیدی نمی‌پذیرد.", 409);
    }
    if (index >= (Number(session.total_chunks) || 0)) {
      throw httpError("شماره قطعه ارسالی نامعتبر است.");
    }

    // Binary media must stay bytes. readRawBody defaults to UTF-8 text, which
    // corrupts arbitrary JPEG/WebP/video bytes and makes the final size check fail.
    const raw = await readRawBody(event, false);
    const bytes = raw ? Buffer.from(raw) : Buffer.alloc(0);
    if (!bytes.length) throw httpError("قطعه ارسالی خالی بود.");
    if (bytes.length > maxChunkBytes) {
      throw httpError("حجم قطعه ارسالی بیش از حد مجاز است.");
    }

    const totalBytes = Number(session.total_bytes) || 0;
    const expectedBytes = Math.min(chunkSize, Math.max(0, totalBytes - index * chunkSize));
    if (expectedBytes > 0 && bytes.length !== expectedBytes) {
      throw httpError(
        `حجم قطعه دریافتی با اندازه مورد انتظار برابر نیست (${bytes.length.toLocaleString("fa-IR")} از ${expectedBytes.toLocaleString("fa-IR")} بایت). دوباره تلاش کنید.`,
      );
    }

    const row = await withSqlTransaction(async (tx) => {
      // The chunk CTE locks its session row before the following UPDATE. Take
      // the shared media lock first to preserve the global lock order against
      // stale-session cleanup (which deletes chunk rows and then the session).
      await lockMediaReferenceWrites(tx);
      const insertedChunks = await tx.query<{ session_id: string }>(
        `with scoped_session as (
           select id
           from media_upload_sessions
           where id = $1
             and kind = $4
             and left(pathname, length($5)) = $5
             and completion_state = 'pending'
           for update
         )
         insert into media_upload_chunks (session_id, chunk_index, data)
         select id, $2, $3 from scoped_session
         on conflict (session_id, chunk_index) do update set data = excluded.data
         returning session_id`,
        [uploadIdHeader, index, bytes, config.kind, uploadSessionScopePrefix(config.pathPrefix)],
      );
      if (!insertedChunks[0]) return null;
      const counters = await tx.query<SessionRow>(
        `update media_upload_sessions
         set received_chunks = (select count(*) from media_upload_chunks where session_id = $1),
             bytes_received = (select coalesce(sum(octet_length(data)), 0) from media_upload_chunks where session_id = $1)
         where id = $1
           and kind = $2
           and left(pathname, length($3)) = $3
         returning received_chunks, bytes_received, total_bytes, total_chunks`,
        [uploadIdHeader, config.kind, uploadSessionScopePrefix(config.pathPrefix)],
      );
      return counters[0] ?? null;
    });
    if (!row) throw httpError("آپلود در حال نهایی‌سازی است؛ وضعیت قطعه را دوباره بررسی کنید.", 409);

    return {
      uploadId: uploadIdHeader,
      receivedChunks: Number(row.received_chunks) || 0,
      bytesReceived: Number(row.bytes_received) || 0,
      totalBytes: Number(row.total_bytes) || 0,
      totalChunks: Number(row.total_chunks) || 0,
    };
  }

  // --- JSON control messages ------------------------------------------------
  const body = (await readBody(event)) as Record<string, unknown> | null;
  const action = body && typeof body === "object" ? body.action : undefined;

  if (action === "begin") {
    const payload = (body ?? {}) as Record<string, unknown>;
    const filename = typeof payload.filename === "string" ? payload.filename.trim() : "";
    const declared =
      typeof payload.contentType === "string"
        ? payload.contentType.trim().toLowerCase()
        : "";
    const contentType = config.resolveContentType({ filename, declared });
    const sizeBytes = Number(payload.sizeBytes) || 0;

    if (!contentType) throw httpError(config.unsupportedTypeMessage);
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      throw httpError("فایل انتخاب‌شده خالی است.");
    }
    if (sizeBytes > config.maxBytes) {
      throw httpError(config.sizeLimitMessage(Math.round(config.maxBytes / 1024 / 1024)));
    }

    const text: Record<string, string> = {};
    for (const field of config.textFields ?? []) {
      const value = typeof payload[field.column] === "string"
        ? (payload[field.column] as string).trim()
        : "";
      if (field.required && !value) {
        throw httpError(`${field.label} را وارد کنید.`);
      }
      if (value.length > field.maxLength) {
        throw httpError(`${field.label} طولانی‌تر از حد مجاز است.`);
      }
      text[field.column] = value;
    }

    const totalChunks = Math.max(1, Math.ceil(sizeBytes / chunkSize));
    const requestedUploadId = typeof payload.uploadId === "string" ? payload.uploadId.trim() : "";
    if (requestedUploadId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedUploadId)) {
      throw httpError("شناسهٔ تلاش مجدد معتبر نیست.");
    }
    const uploadId = requestedUploadId || crypto.randomUUID();
    const sql = await getSql();

    // A stable client ID lets a retry recover the same upload session and its
    // receipt after a lost response. Validate the immutable metadata before
    // reusing an ID; never let one upload ID be repurposed for another file.
    const existingRows = requestedUploadId
      ? await sql.query<SessionRow>(
          "select * from media_upload_sessions where id = $1 limit 1",
          [uploadId],
        )
      : [];
    const existing = existingRows[0];
    if (existing && !matchesUploadSessionScope(existing, config.kind, config.pathPrefix)) {
      throw httpError("شناسه آپلود متعلق به مسیر دیگری است.", 409);
    }
    if (!existing && requestedUploadId && config.recoverCompleted) {
      const recovered = await config.recoverCompleted({
        uploadId,
        filename,
        contentType,
        sizeBytes,
        text,
      });
      if (recovered) {
        return {
          uploadId,
          totalChunks,
          totalBytes: sizeBytes,
          completed: true,
          response: recovered,
        };
      }
    }
    if (existing) {
      const expectedPathSuffix = "-" + safePathSegment(filename);
      const sameRequest =
        String(existing.pathname ?? "").endsWith(expectedPathSuffix) &&
        String(existing.content_type ?? "") === contentType &&
        String(existing.title ?? "") === (text.title ?? "") &&
        String(existing.artist ?? "") === (text.artist ?? "") &&
        Number(existing.total_bytes) === sizeBytes &&
        Number(existing.total_chunks) === totalChunks;
      if (!sameRequest) throw httpError("این شناسه قبلاً برای فایل دیگری استفاده شده است.", 409);

      const receipt = existing.completion_result;
      if (receipt && typeof receipt === "object") {
        return {
          uploadId,
          totalChunks: Number(existing.total_chunks) || totalChunks,
          totalBytes: Number(existing.total_bytes) || sizeBytes,
          completed: true,
          response: {
            ...(receipt as Record<string, unknown>),
            storage: String(existing.stored_storage ?? "database"),
          },
        };
      }
      return {
        uploadId,
        chunkSize,
        totalChunks: Number(existing.total_chunks) || totalChunks,
        totalBytes: Number(existing.total_bytes) || sizeBytes,
        maxBytes: config.maxBytes,
        assembled: Boolean(existing.stored_url),
      };
    }

    // Count only a syntactically valid, type- and size-accepted new begin.
    // Retries of a known upload ID reuse its existing session without consuming
    // another begin quota slot.
    const attempt = await consumeAdminAttempt(
      `media-upload:begin:${config.pathPrefix}:${clientFingerprint(event)}`,
      30,
    );
    if (!attempt.allowed) throw tooManyAttemptsError(attempt.retryAfterSeconds);

    const pathname = `${config.pathPrefix}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safePathSegment(filename)}`;

    await sql.query(
      `insert into media_upload_sessions
         (id, pathname, content_type, title, artist, total_chunks, total_bytes, kind)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (id) do nothing`,
      [
        uploadId,
        pathname,
        contentType,
        text.title ?? "",
        text.artist ?? "",
        totalChunks,
        sizeBytes,
        config.kind,
      ],
    );

    const confirmedRows = await sql.query<SessionRow>(
      "select * from media_upload_sessions where id = $1 limit 1",
      [uploadId],
    );
    const confirmed = confirmedRows[0];
    if (!confirmed || !matchesUploadSessionScope(confirmed, config.kind, config.pathPrefix)) {
      throw httpError("نشست آپلود ایجاد نشد؛ دوباره تلاش کنید.", 503);
    }
    const sameRequest =
      String(confirmed.pathname ?? "").endsWith("-" + safePathSegment(filename)) &&
      String(confirmed.content_type ?? "") === contentType &&
      String(confirmed.title ?? "") === (text.title ?? "") &&
      String(confirmed.artist ?? "") === (text.artist ?? "") &&
      Number(confirmed.total_bytes) === sizeBytes &&
      Number(confirmed.total_chunks) === totalChunks;
    if (!sameRequest) throw httpError("این شناسه قبلاً برای فایل دیگری استفاده شده است.", 409);
    if (confirmed.completion_result && typeof confirmed.completion_result === "object") {
      return {
        uploadId,
        totalChunks: Number(confirmed.total_chunks) || totalChunks,
        totalBytes: Number(confirmed.total_bytes) || sizeBytes,
        completed: true,
        response: {
          ...(confirmed.completion_result as Record<string, unknown>),
          storage: String(confirmed.stored_storage ?? "database"),
        },
      };
    }

    void pruneStaleUploadSessions().catch((error) => {
      console.error("[upload] stale-session/media cleanup retry failed", error);
    });

    return {
      uploadId,
      chunkSize,
      totalChunks: Number(confirmed.total_chunks) || totalChunks,
      totalBytes: Number(confirmed.total_bytes) || sizeBytes,
      maxBytes: config.maxBytes,
      assembled: Boolean(confirmed.stored_url),
    };
  }

  if (action === "complete") {
    const uploadId = typeof body?.uploadId === "string" ? body.uploadId.trim() : "";
    if (!uploadId) throw httpError("شناسه آپلود مشخص نیست.");

    const sql = await getSql();

    // A completed upload may have succeeded while the HTTP response was lost.
    // Keep a short-lived receipt so retrying the same uploadId returns the same
    // URL instead of assembling a second object or reporting a false failure.
    const completedRows = await sql.query<SessionRow>(
      `select completion_result, stored_storage
       from media_upload_sessions
       where id = $1 and kind = $2
         and left(pathname, length($3)) = $3
         and completion_result is not null
       limit 1`,
      [uploadId, config.kind, uploadSessionScopePrefix(config.pathPrefix)],
    );
    const completedSession = completedRows[0];
    if (
      completedSession?.completion_result &&
      typeof completedSession.completion_result === "object"
    ) {
      return {
        ...(completedSession.completion_result as Record<string, unknown>),
        storage: String(completedSession.stored_storage ?? "database"),
      };
    }

    // Claim completion atomically. A second request can read the session, but
    // only one UPDATE can win; the other receives a retryable 409 instead of
    // assembling a duplicate object.
    const claimed = await sql.query<SessionRow>(
      `update media_upload_sessions
       set completion_state = 'completing', completion_started_at = current_timestamp
       where id = $1
         and kind = $2
         and left(pathname, length($3)) = $3
         and (
           completion_state = 'pending'
           or (
             completion_state in ('completing', 'assembled')
             and (completion_started_at is null or completion_started_at < current_timestamp - interval '10 minutes')
           )
         )
       returning *`,
      [uploadId, config.kind, uploadSessionScopePrefix(config.pathPrefix)],
    );
    const session = claimed[0];
    if (!session) {
      throw httpError("این آپلود در حال نهایی‌سازی است؛ کمی بعد دوباره تلاش کنید.", 409);
    }

    if (session.completion_result && typeof session.completion_result === "object") {
      const result = session.completion_result as Record<string, unknown>;
      return {
        ...result,
        storage: String(session.stored_storage ?? "database"),
      };
    }

    const totals = await sql.query<SessionRow>(
      `select count(*) as chunks, coalesce(sum(octet_length(data)), 0) as bytes
       from media_upload_chunks where session_id = $1`,
      [uploadId],
    );
    const receivedChunks = Number(totals[0]?.chunks) || 0;
    const receivedBytes = Number(totals[0]?.bytes) || 0;
    const totalChunks = Number(session.total_chunks) || 0;
    const totalBytes = Number(session.total_bytes) || 0;

    if (receivedChunks !== totalChunks || (totalBytes > 0 && receivedBytes !== totalBytes)) {
      await sql.query(
        `update media_upload_sessions
         set completion_state = 'pending', completion_started_at = null
         where id = $1 and kind = $2 and left(pathname, length($3)) = $3`,
        [uploadId, config.kind, uploadSessionScopePrefix(config.pathPrefix)],
      );
      const chunkLabel = `${receivedChunks.toLocaleString("fa-IR")} از ${totalChunks.toLocaleString("fa-IR")} قطعه`;
      const byteLabel = `${receivedBytes.toLocaleString("fa-IR")} از ${totalBytes.toLocaleString("fa-IR")} بایت`;
      throw httpError(
        `فایل کامل دریافت نشد (${chunkLabel}، ${byteLabel} دریافت شده). دوباره آپلود کنید.`,
      );
    }

    let stored: StoredMedia | null = null;
    try {
      // Validate the real bytes before storeAssembledUpload can offload the
      // object to Liara/Vercel Blob and remove its temporary database copy.
      // Validating only after that step skipped signature checks for CDN files.
      const signatureRows = await sql.query<{ data?: Uint8Array }>(
        `select substring(data from 1 for $2) as data
         from media_upload_chunks
         where session_id = $1 and chunk_index = 0
         limit 1`,
        [uploadId, SIGNATURE_PROBE_BYTES],
      );
      const signatureData = signatureRows[0]?.data;
      const signatureProbe = signatureData
        ? (Buffer.isBuffer(signatureData) ? signatureData : Buffer.from(signatureData))
        : Buffer.alloc(0);
      if (!signatureProbe.length) {
        throw signatureRejection("فایل آپلودشده خالی است.");
      }
      if (!contentMatchesDeclaredType(signatureProbe, String(session.content_type))) {
        throw signatureRejection("محتوای فایل با نوع اعلام‌شده هم‌خوانی ندارد.");
      }

      stored = await storeAssembledUpload({
        pathname: String(session.pathname),
        contentType: String(session.content_type),
        sessionId: uploadId,
        forceDatabaseStorage: config.forceDatabaseStorage === true,
        transform: config.transform
          ? (input) => config.transform!({
              ...input,
              session,
              totalBytes: receivedBytes,
            })
          : undefined,
      });

      // The declared type and the extension are both attacker-controlled. Read
      // the real header bytes back and refuse anything that is not what we are
      // about to persist, so a disguised HTML/SVG payload can never be served
      // from our own origin.
      const storedContentType = stored.id
        ? (await getMediaMeta(stored.id))?.contentType
        : null;
      await assertStoredContentType(
        stored,
        storedContentType || String(session.content_type),
      );

      const result = await config.finish({
        stored,
        session,
        text: {
          title: String(session.title ?? ""),
          artist: String(session.artist ?? ""),
        },
        totalBytes: receivedBytes,
      });

      const resultObject = (result && typeof result === "object" ? result : {}) as Record<string, unknown>;
      await sql.query(
        `update media_upload_sessions
         set completion_result = $2::jsonb
         where id = $1 and kind = $3 and left(pathname, length($4)) = $4`,
        [uploadId, JSON.stringify(resultObject), config.kind, uploadSessionScopePrefix(config.pathPrefix)],
      );
      // Chunks are no longer needed once storage and the business response are
      // committed. Keep only the receipt until normal stale-session pruning so
      // a retry can recover the same result if the HTTP response was dropped.
      await sql.query(
        `delete from media_upload_chunks where session_id = $1
         and exists (
           select 1 from media_upload_sessions
           where id = $1 and kind = $2 and left(pathname, length($3)) = $3
         )`,
        [uploadId, config.kind, uploadSessionScopePrefix(config.pathPrefix)],
      );
      return { ...resultObject, storage: stored.storage };
    } catch (error) {
      if (isSignatureRejection(error)) {
        // Drop the object we just staged plus its chunks: keeping either would
        // leave an orphan file nothing will ever reference.
        try {
          await withSqlTransaction(async (tx) => {
            await tx.query(
              "delete from media_upload_sessions where id = $1 and kind = $2 and left(pathname, length($3)) = $3",
              [uploadId, config.kind, uploadSessionScopePrefix(config.pathPrefix)],
            );
            if (stored?.url) await enqueueMediaCleanupJob(tx, stored.url);
          });
          await retryPendingMediaCleanupJobs();
        } catch (cleanupError) {
          console.error(`[upload] rejected object cleanup remains queued for ${uploadId}`, cleanupError);
        }
        console.warn(
          `[upload] rejected ${session.kind} upload ${uploadId}: content does not match declared type`,
        );
        throw httpError(
          error instanceof Error ? error.message : "محتوای فایل با نوع اعلام‌شده هم‌خوانی ندارد.",
          415,
        );
      }

      // Preserve the diagnostic detail in Liara runtime logs while keeping
      // the browser response safe and actionable.
      console.error(
        `[upload] finalization failed for ${String(session.kind ?? config.kind)} upload ${uploadId}: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Leave an assembled object retryable, but do not leave a permanently
      // locked session if a transient database/network error occurred.
      try {
        await sql.query(
          `update media_upload_sessions
           set completion_state = case when stored_url is null then 'pending' else 'assembled' end,
               completion_started_at = case when stored_url is null then null else current_timestamp - interval '10 minutes' end
           where id = $1 and kind = $2 and left(pathname, length($3)) = $3`,
          [uploadId, config.kind, uploadSessionScopePrefix(config.pathPrefix)],
        );
      } catch (stateError) {
        throw new AggregateError([error, stateError], "Upload finalization failed and its retry state could not be persisted.");
      }
      throw error;
    }
  }

  if (action === "abort") {
    const uploadId = typeof body?.uploadId === "string" ? body.uploadId.trim() : "";
    if (uploadId) {
      const sql = await getSql();
      await sql.query(
        "delete from media_upload_sessions where id = $1 and kind = $2 and left(pathname, length($3)) = $3 and completion_state = 'pending'",
        [uploadId, config.kind, uploadSessionScopePrefix(config.pathPrefix)],
      );
    }
    return { aborted: true };
  }

  throw httpError("درخواست آپلود نامعتبر است.");
}
