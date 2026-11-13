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
import { dbSource, getSql } from "@/lib/db";
import { contentMatchesDeclaredType } from "@/lib/file-signature.server";
import {
  copyLiaraObject,
  createLiaraPresignedPutUrl,
  deleteLiaraObject,
  getLiaraObject,
  headLiaraObject,
  liaraDirectUploadEnabled,
  liaraObjectUrl,
} from "@/lib/liara-object-storage.server";
import {
  deleteStoredMedia,
  getMediaMeta,
  pruneStaleUploadSessions,
  readMediaRange,
  storeAssembledUpload,
  type StoredMedia,
} from "@/lib/media-store.server";
import {
  matchesUploadSessionScope,
  uploadSessionScopePrefix,
} from "@/lib/upload-session-scope";

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
  /** Allow a trusted caller to retain a client-generated ID across retries. */
  allowClientUploadId?: boolean;
  /** Public submissions deliberately skip admin-session auth but keep same-origin and rate limiting. */
  access?: "admin" | "public";
  /** Path prefix for stored objects, e.g. `music` or `properties/uploads`. */
  pathPrefix: string;
  maxBytes: number;
  chunkSize?: number;
  /** Returns the content type to store, or null when the file is not allowed. */
  resolveContentType: (input: { filename: string; declared: string }) => string | null;
  unsupportedTypeMessage: string;
  sizeLimitMessage: (limitMb: number) => string;
  textFields?: TextField[];
  /** Recover a business record after its short-lived upload session was pruned. */
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
  /** File types eligible for browser-to-Liara PUT when the server feature flag is enabled. */
  directUpload?: (input: { filename: string; contentType: string }) => boolean;
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

function createDirectUpload(pathname: string, contentType: string, sizeBytes: number) {
  const objectKey = `staging/${pathname}`;
  const signed = createLiaraPresignedPutUrl({
    key: objectKey,
    contentType,
    sizeBytes,
    expiresInSeconds: 900,
  });
  if (!signed) {
    throw httpError("آپلود مستقیم Liara تنظیم نشده است؛ لطفاً تنظیمات ذخیره‌سازی را بررسی کنید.", 503);
  }
  return { objectKey, signed };
}

async function readLiaraSignatureProbe(key: string): Promise<Buffer> {
  const response = await getLiaraObject({ key, range: `bytes=0-${SIGNATURE_PROBE_BYTES - 1}` });
  if (!response?.ok || !response.body) {
    throw new Error("فایل مستقیم در Liara قابل خواندن نیست؛ دوباره تلاش کنید.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (length < SIGNATURE_PROBE_BYTES) {
      const next = await reader.read();
      if (next.done) break;
      const remaining = SIGNATURE_PROBE_BYTES - length;
      const part = next.value.subarray(0, remaining);
      if (part.length) {
        chunks.push(part);
        length += part.length;
      }
      if (next.value.length > remaining) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

async function verifyDirectLiaraUpload(input: {
  key: string;
  contentType: string;
  sizeBytes: number;
}): Promise<void> {
  const head = await headLiaraObject(input.key);
  if (!head) {
    throw new Error("فایل در فضای ابری دریافت نشد یا قابل بررسی نیست؛ دوباره تلاش کنید.");
  }
  if (head.sizeBytes !== input.sizeBytes || head.contentType !== input.contentType.toLowerCase()) {
    throw signatureRejection("اندازه یا نوع واقعی فایل ذخیره‌شده با اطلاعات آپلود مطابقت ندارد.");
  }
  const probe = await readLiaraSignatureProbe(input.key);
  if (!probe.length || !contentMatchesDeclaredType(probe, input.contentType)) {
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
  const sessionPathPrefix = uploadSessionScopePrefix(config.pathPrefix);

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
    if (!session || !matchesUploadSessionScope(session, config.kind, config.pathPrefix)) {
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

    const sql = await getSql();
    const savedChunk = await sql.query<{ session_id: string }>(
      `with upload_session as (
         select id from media_upload_sessions
         where id = $1
           and kind = $4
           and left(pathname, length($5)) = $5
           and completion_state = 'pending'
         for update
       ), saved_chunk as (
         insert into media_upload_chunks (session_id, chunk_index, data)
         select id, $2, $3 from upload_session
         on conflict (session_id, chunk_index) do update set data = excluded.data
         returning session_id
       )
       select session_id from saved_chunk limit 1`,
      [uploadIdHeader, index, bytes, config.kind, sessionPathPrefix],
    );
    if (!savedChunk[0]) {
      throw httpError("این آپلود در مرحله نهایی‌سازی است یا نشست آن معتبر نیست.", 409);
    }

    const counters = await sql.query<SessionRow>(
      `update media_upload_sessions
       set received_chunks = (select count(*) from media_upload_chunks where session_id = $1),
           bytes_received = (select coalesce(sum(octet_length(data)), 0) from media_upload_chunks where session_id = $1)
       where id = $1
       returning received_chunks, bytes_received, total_bytes, total_chunks`,
      [uploadIdHeader],
    );
    const row = counters[0] ?? {};

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
    if (requestedUploadId && !config.allowClientUploadId) {
      throw httpError("این مسیر اجازه انتخاب شناسه آپلود را نمی‌دهد.", 400);
    }
    if (requestedUploadId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedUploadId)) {
      throw httpError("شناسهٔ تلاش مجدد معتبر نیست.");
    }
    const uploadId = requestedUploadId || crypto.randomUUID();
    const sql = await getSql();

    // A stable client ID recovers the same session after a lost begin/chunk/
    // completion response. Reuse is allowed only for the exact same immutable
    // file metadata; a UUID must never be repurposed for a different upload.
    const existing = requestedUploadId ? await loadSession(uploadId) : null;
    if (existing) {
      if (!matchesUploadSessionScope(existing, config.kind, config.pathPrefix)) {
        throw httpError("این شناسه آپلود متعلق به مسیر دیگری است.", 409);
      }
      const sameRequest =
        String(existing.pathname ?? "").startsWith(`${config.pathPrefix}/`) &&
        String(existing.pathname ?? "").endsWith("-" + safePathSegment(filename)) &&
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
      if (String(existing.completion_state ?? "pending") === "expired") {
        throw httpError("مهلت این نشست آپلود تمام شده است؛ آپلود را از ابتدا شروع کنید.", 410);
      }
      const existingDirect = String(existing.upload_mode ?? "chunked") === "direct";
      const existingCompleting = String(existing.completion_state ?? "") === "completing";
      const direct = existingDirect && !existing.stored_url && !existingCompleting
        ? createDirectUpload(String(existing.pathname), contentType, sizeBytes)
        : null;
      const refreshed = await sql.query<{ id: string }>(
        `update media_upload_sessions
         set created_at = current_timestamp,
             direct_upload_expires_at = case when $4::boolean
               then current_timestamp + interval '15 minutes'
               else direct_upload_expires_at end
         where id = $1 and kind = $2 and left(pathname, length($3)) = $3
           and completion_state <> 'expired'
         returning id`,
        [uploadId, config.kind, sessionPathPrefix, Boolean(direct)],
      );
      if (!refreshed.length) {
        throw httpError("مهلت این نشست آپلود تمام شده است؛ آپلود را از ابتدا شروع کنید.", 410);
      }
      return {
        uploadId,
        chunkSize,
        totalChunks: Number(existing.total_chunks) || totalChunks,
        totalBytes: Number(existing.total_bytes) || sizeBytes,
        maxBytes: config.maxBytes,
        assembled: Boolean(existing.stored_url),
        completing: String(existing.completion_state ?? "") === "completing",
        ...(direct ? { directUpload: direct.signed } : {}),
      };
    }

    // If normal session pruning already removed the receipt, the music route
    // can recover the same persisted track by its upload ID before creating a
    // new session or media object.
    if (requestedUploadId && config.recoverCompleted) {
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

    // Retries of an existing session above do not consume another begin slot.
    const attempt = await consumeAdminAttempt(
      `media-upload:begin:${config.pathPrefix}:${clientFingerprint(event)}`,
      30,
    );
    if (!attempt.allowed) throw tooManyAttemptsError(attempt.retryAfterSeconds);

    const pathname = `${config.pathPrefix}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safePathSegment(filename)}`;
    const useDirectUpload = Boolean(
      config.directUpload?.({ filename, contentType }) && liaraDirectUploadEnabled(),
    );
    const objectKey = useDirectUpload ? `staging/${pathname}` : null;
    await sql.query(
      `insert into media_upload_sessions
         (id, pathname, content_type, title, artist, total_chunks, total_bytes, kind, upload_mode, direct_upload_expires_at, object_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, case when $10::boolean then current_timestamp + interval '15 minutes' else null end, $11)
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
        useDirectUpload ? "direct" : "chunked",
        useDirectUpload,
        objectKey,
      ],
    );

    // Confirm a client-selected ID won the insert race and still belongs to
    // this exact request before returning it to the browser.
    const confirmed = await loadSession(uploadId);
    if (!confirmed || !matchesUploadSessionScope(confirmed, config.kind, config.pathPrefix)) {
      throw httpError("نشست آپلود ایجاد نشد؛ دوباره تلاش کنید.", 503);
    }
    const sameRequest =
      String(confirmed.pathname ?? "").startsWith(`${config.pathPrefix}/`) &&
      String(confirmed.pathname ?? "").endsWith("-" + safePathSegment(filename)) &&
      String(confirmed.content_type ?? "") === contentType &&
      String(confirmed.title ?? "") === (text.title ?? "") &&
      String(confirmed.artist ?? "") === (text.artist ?? "") &&
      Number(confirmed.total_bytes) === sizeBytes &&
      Number(confirmed.total_chunks) === totalChunks;
    if (!sameRequest) throw httpError("این شناسه قبلاً برای فایل دیگری استفاده شده است.", 409);

    const direct = String(confirmed.upload_mode ?? "chunked") === "direct" &&
      !confirmed.stored_url && String(confirmed.completion_state ?? "") !== "completing"
      ? createDirectUpload(String(confirmed.pathname), contentType, sizeBytes)
      : null;
    if (direct) {
      await sql.query(
        "update media_upload_sessions set direct_upload_expires_at = current_timestamp + interval '15 minutes' where id = $1 and kind = $2 and left(pathname, length($3)) = $3",
        [uploadId, config.kind, sessionPathPrefix],
      );
    }

    const confirmedReceipt = confirmed.completion_result;
    if (confirmedReceipt && typeof confirmedReceipt === "object") {
      return {
        uploadId,
        totalChunks: Number(confirmed.total_chunks) || totalChunks,
        totalBytes: Number(confirmed.total_bytes) || sizeBytes,
        completed: true,
        response: {
          ...(confirmedReceipt as Record<string, unknown>),
          storage: String(confirmed.stored_storage ?? "database"),
        },
      };
    }

    void pruneStaleUploadSessions().catch(() => undefined);

    return {
      uploadId,
      chunkSize,
      totalChunks,
      totalBytes: sizeBytes,
      maxBytes: config.maxBytes,
      assembled: Boolean(confirmed.stored_url),
      completing: String(confirmed.completion_state ?? "") === "completing",
      ...(direct ? { directUpload: direct.signed } : {}),
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
      [uploadId, config.kind, sessionPathPrefix],
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
       set completion_state = 'completing', completion_started_at = current_timestamp,
           created_at = current_timestamp
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
      [uploadId, config.kind, sessionPathPrefix],
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

    const totalChunks = Number(session.total_chunks) || 0;
    const totalBytes = Number(session.total_bytes) || 0;
    const isDirectUpload = String(session.upload_mode ?? "chunked") === "direct";
    let receivedChunks = isDirectUpload ? totalChunks : 0;
    let receivedBytes = isDirectUpload ? totalBytes : 0;

    if (!isDirectUpload) {
      const totals = await sql.query<SessionRow>(
        `select count(*) as chunks, coalesce(sum(octet_length(data)), 0) as bytes
         from media_upload_chunks where session_id = $1`,
        [uploadId],
      );
      receivedChunks = Number(totals[0]?.chunks) || 0;
      receivedBytes = Number(totals[0]?.bytes) || 0;

      if (receivedChunks !== totalChunks || (totalBytes > 0 && receivedBytes !== totalBytes)) {
        await sql.query(
          `update media_upload_sessions
           set completion_state = 'pending', completion_started_at = null
           where id = $1 and kind = $2 and left(pathname, length($3)) = $3`,
          [uploadId, config.kind, sessionPathPrefix],
        );
        const chunkLabel = `${receivedChunks.toLocaleString("fa-IR")} از ${totalChunks.toLocaleString("fa-IR")} قطعه`;
        const byteLabel = `${receivedBytes.toLocaleString("fa-IR")} از ${totalBytes.toLocaleString("fa-IR")} بایت`;
        throw httpError(
          `فایل کامل دریافت نشد (${chunkLabel}، ${byteLabel} دریافت شده). دوباره آپلود کنید.`,
        );
      }
    }

    let stored: StoredMedia | null = null;
    try {
      if (isDirectUpload) {
        const key = String(session.pathname);
        const stagingKey = String(session.object_key ?? `staging/${key}`);
        if (session.stored_url) {
          // A prior completion attempt may have published the final key and
          // removed staging before the business receipt was committed.
          await verifyDirectLiaraUpload({
            key,
            contentType: String(session.content_type),
            sizeBytes: totalBytes,
          });
          stored = { url: String(session.stored_url), storage: "object-store", id: null };
        } else {
          await verifyDirectLiaraUpload({
            key: stagingKey,
            contentType: String(session.content_type),
            sizeBytes: totalBytes,
          });
          const copied = await copyLiaraObject(stagingKey, key);
          if (!copied) throw new Error("انتقال فایل تأییدشده از فضای موقت به مسیر نهایی Liara انجام نشد.");
          await verifyDirectLiaraUpload({
            key,
            contentType: String(session.content_type),
            sizeBytes: totalBytes,
          });
          const url = liaraObjectUrl(key);
          if (!url) throw new Error("آدرس فایل ذخیره‌شده در Liara قابل ساخت نیست.");
          stored = { url, storage: "object-store", id: null };
          // Persist the verified pointer before the business write. If the
          // response or business insert is lost, the same session can retry
          // completion without uploading the object again.
          await sql.query(
            `update media_upload_sessions
             set completion_state = 'assembled', stored_url = $2,
                 stored_storage = 'object-store', stored_media_id = null
             where id = $1 and kind = $3 and left(pathname, length($4)) = $4`,
            [uploadId, stored.url, config.kind, sessionPathPrefix],
          );
          // The signed browser URL can be reused until expiry, so it only ever
          // targets the staging key. The final key is a server-side copy and is
          // never writable through that bearer URL.
          await deleteLiaraObject(stagingKey).catch(() => false);
        }
      } else {
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
          transform: config.transform
            ? (input) => config.transform!({
                ...input,
                session,
                totalBytes: receivedBytes,
              })
            : undefined,
        });
      }

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
        [uploadId, JSON.stringify(resultObject), config.kind, sessionPathPrefix],
      );
      // Chunks are no longer needed once storage and the business response are
      // committed. Keep only the receipt until normal stale-session pruning so
      // a retry can recover the same result if the HTTP response was dropped.
      await sql.query("delete from media_upload_chunks where session_id = $1", [uploadId]);
      return { ...resultObject, storage: stored.storage };
    } catch (error) {
      if (isSignatureRejection(error)) {
        // Drop the object we just staged plus its chunks: keeping either would
        // leave an orphan file nothing will ever reference.
        const objectRemoved = isDirectUpload
          ? await Promise.all([
              deleteLiaraObject(String(session.object_key ?? `staging/${session.pathname}`)).catch(() => false),
              deleteLiaraObject(String(session.pathname)).catch(() => false),
            ]).then((results) => results.every(Boolean))
          : (await deleteStoredMedia(stored?.url).then(() => true).catch(() => false));
        if (objectRemoved) {
          await sql
            .query(
              "delete from media_upload_sessions where id = $1 and kind = $2 and left(pathname, length($3)) = $3",
              [uploadId, config.kind, sessionPathPrefix],
            )
            .catch(() => undefined);
        } else {
          await sql.query(
            `update media_upload_sessions
             set completion_state = 'pending', completion_started_at = null
             where id = $1 and kind = $2 and left(pathname, length($3)) = $3`,
            [uploadId, config.kind, sessionPathPrefix],
          ).catch(() => undefined);
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
      await sql.query(
        `update media_upload_sessions
         set completion_state = case when stored_url is null then 'pending' else 'assembled' end,
             completion_started_at = case when stored_url is null then null else current_timestamp - interval '10 minutes' end,
             created_at = current_timestamp
         where id = $1 and kind = $2 and left(pathname, length($3)) = $3`,
        [uploadId, config.kind, sessionPathPrefix],
      ).catch(() => undefined);
      throw error;
    }
  }

  if (action === "abort") {
    const uploadId = typeof body?.uploadId === "string" ? body.uploadId.trim() : "";
    if (uploadId) {
      const sql = await getSql();
      const rows = await sql.query<{ object_key: string | null; pathname: string; upload_mode: string }>(
        `select object_key, pathname, upload_mode from media_upload_sessions
         where id = $1 and kind = $2 and left(pathname, length($3)) = $3
           and completion_state = 'pending' limit 1`,
        [uploadId, config.kind, sessionPathPrefix],
      );
      const session = rows[0];
      if (session?.upload_mode === "direct") {
        const deleted = await deleteLiaraObject(String(session.object_key ?? `staging/${session.pathname}`));
        if (!deleted) {
          throw httpError("پاک‌سازی فایل نیمه‌کاره در فضای ابری انجام نشد؛ نشست برای تلاش مجدد حفظ شد.", 503);
        }
      }
      if (session) {
        await sql.query(
          "delete from media_upload_sessions where id = $1 and kind = $2 and left(pathname, length($3)) = $3 and completion_state = 'pending'",
          [uploadId, config.kind, sessionPathPrefix],
        );
      }
    }
    return { aborted: true };
  }

  throw httpError("درخواست آپلود نامعتبر است.");
}
