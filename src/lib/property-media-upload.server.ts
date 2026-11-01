/**
 * Dedicated property-media upload pipeline.
 *
 * Gallery images, property videos, and floor plans use their own staging
 * tables instead of sharing music-upload sessions. Existing published files
 * still use media_objects / Liara and keep their current public URL formats.
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
import { dbSource, getSql, withSqlTransaction } from "@/lib/db";
import {
  ADMIN_SESSION_COOKIE,
  getAdminSessionClaims,
  verifyAdminSessionToken,
} from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import {
  assertSameOrigin,
  clientFingerprint,
  consumeAdminAttempt,
  tooManyAttemptsError,
} from "@/lib/admin-rate-limit.server";
import { contentMatchesDeclaredType } from "@/lib/file-signature.server";
import { watermarkPropertyMediaFile } from "@/lib/property-media-file-processing.server";
import { copyFile, mkdtemp, open, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { liaraStorageConfigured } from "@/lib/liara-object-storage.server";
import { applyPropertyImageWatermarkServer } from "@/lib/property-image-watermark.server";
import { applyPropertyVideoWatermark } from "@/lib/property-video-watermark.server";
import {
  createPropertyVideoRenditions,
  createPropertyVideoRenditionFiles,
} from "@/lib/property-video-renditions.server";
import type { PropertyWatermarkPosition, PropertyWatermarkSettings } from "@/lib/property-watermark";
import {
  deleteStoredMedia,
  deletePropertyMedia,
  enqueueMediaCleanupJob,
  mediaUrlForBrowser,
  putLiaraObjectFromFileSafely,
  retryPendingMediaCleanupJobs,
  storeMedia,
  type StoredMedia,
} from "@/lib/media-store.server";

const CHUNK_SIZE = 2 * 1024 * 1024;
const MAX_GALLERY_IMAGE_BYTES = 1024 * 1024 * 1024;
const MAX_GALLERY_VIDEO_BYTES = 1024 * 1024 * 1024;
const MAX_FLOOR_PLAN_BYTES = 15 * 1024 * 1024;
// Keep ordinary uploads on the existing buffered pipeline; larger objects use
// disk-backed processing and S3 multipart upload instead.
const MAX_IN_MEMORY_COMPLETION_BYTES = 100 * 1024 * 1024;
const CHUNKS_PER_DISK_BATCH = 16;
const SIGNATURE_PROBE_BYTES = 32;

function videoExtension(contentType: string): string {
  return contentType === "video/webm" ? ".webm"
    : contentType === "video/quicktime" ? ".mov"
    : ".mp4";
}

/**
 * Start optional large-video quality processing after the original upload has
 * been durably saved and its receipt returned. Copying the source first lets
 * the request clean up its temporary directory without waiting for FFmpeg.
 */
async function queueLargeVideoRenditions(input: {
  sourcePath: string;
  sourceUrl: string;
  contentType: string;
  pathname: string;
}): Promise<void> {
  if (!input.contentType.startsWith("video/")) return;
  const sql = await getSql();
  await sql.query(
    `insert into property_video_renditions (source_url, renditions)
     values ($1, $2::jsonb)
     on conflict (source_url) do update
       set renditions = excluded.renditions, created_at = current_timestamp`,
    [input.sourceUrl, JSON.stringify({ processing: true })],
  );
  const workDir = await mkdtemp(join(tmpdir(), "hirmand-video-quality-job-"));
  const inputPath = join(workDir, "source" + videoExtension(input.contentType));
  try {
    await copyFile(input.sourcePath, inputPath);
  } catch (error) {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    await sql.query(
      `update property_video_renditions set renditions = $2::jsonb, created_at = current_timestamp where source_url = $1`,
      [input.sourceUrl, JSON.stringify({ processing: false })],
    ).catch(() => undefined);
    await deletePropertyMedia(input.sourceUrl).catch((cleanupError) => {
      console.warn("[property-media] failed to retry cleanup after video staging failure", cleanupError);
    });
    console.warn("[property-media] could not stage background quality job:", error instanceof Error ? error.message : error);
    return;
  }

  void (async () => {
    const renditionUrls: Record<string, string> = {};
    let processingFailed = false;
    try {
      for await (const rendition of createPropertyVideoRenditionFiles({
        inputPath,
        contentType: input.contentType,
        pathname: input.pathname,
        workDir,
      })) {
        const storedUrl = await putLiaraObjectFromFileSafely({
          key: rendition.pathname,
          filePath: rendition.path,
          contentType: rendition.contentType,
        });
        if (!storedUrl) throw new Error("Liara Object Storage rejected a video quality variant.");
        renditionUrls[rendition.quality] = mediaUrlForBrowser(storedUrl, rendition.contentType);
        // Publish each available quality as soon as it is stored; the player
        // can offer 480p while 720p/1080p are still being encoded.
        await sql.query(
          `insert into property_video_renditions (source_url, renditions)
           values ($1, $2::jsonb)
           on conflict (source_url) do update
             set renditions = excluded.renditions, created_at = current_timestamp`,
          [input.sourceUrl, JSON.stringify({ ...renditionUrls, processing: true })],
        );
      }
    } catch (error) {
      processingFailed = true;
      console.warn(
        `[property-media] background quality processing failed for ${input.sourceUrl}:`,
        error instanceof Error ? error.message : error,
      );
    } finally {
      await sql.query(
        `update property_video_renditions
         set renditions = (renditions - 'processing') || '{"processing": false}'::jsonb,
             created_at = current_timestamp
         where source_url = $1`,
        [input.sourceUrl],
      ).catch(() => undefined);
      await deletePropertyMedia(input.sourceUrl).catch((cleanupError) => {
        console.warn("[property-media] deferred video media cleanup remains queued", cleanupError);
      });
      if (processingFailed) {
        for (const renditionUrl of Object.values(renditionUrls)) {
          await deleteStoredMedia(renditionUrl).catch((cleanupError) => {
            console.warn("[property-media] unregistered rendition cleanup remains queued", cleanupError);
          });
        }
      }
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  })();
}

const GALLERY_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);
const FLOOR_PLAN_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

type UploadSession = Record<string, unknown>;
type UploadKind = "gallery" | "floor-plan";

const WATERMARK_POSITIONS = new Set<PropertyWatermarkPosition>([
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
]);

function resolveWatermarkPosition(value: unknown): PropertyWatermarkPosition {
  return typeof value === "string" && WATERMARK_POSITIONS.has(value as PropertyWatermarkPosition)
    ? value as PropertyWatermarkPosition
    : "bottom-right";
}

function uploadWatermarkSettings(position: PropertyWatermarkPosition): PropertyWatermarkSettings {
  return {
    enabled: true,
    showLogo: true,
    showText: false,
    text: "املاک هیرمند",
    opacity: 0.76,
    size: 0.78,
    position,
  };
}

function httpError(message: string, statusCode = 400) {
  return createError({ statusCode, statusMessage: message });
}

function cleanFileSegment(filename: string): string {
  const cleaned = filename
    .replace(/[^\w.\u0600-\u06FF-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-100);
  return cleaned || "property-media";
}

function mimeFromFilename(filename: string): string {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "avif") return "image/avif";
  if (extension === "mp4" || extension === "m4v") return "video/mp4";
  if (extension === "webm") return "video/webm";
  if (extension === "mov") return "video/quicktime";
  return "";
}

function uploadKind(value: unknown): UploadKind | null {
  if (value === "gallery" || value === "floor-plan") return value;
  return null;
}

function allowedTypesFor(kind: UploadKind): Set<string> {
  return kind === "floor-plan" ? FLOOR_PLAN_TYPES : GALLERY_TYPES;
}

function resolveType(filename: string, declared: string, kind: UploadKind): string | null {
  const allowed = allowedTypesFor(kind);
  if (allowed.has(declared)) return declared;
  // Some browsers report an empty or generic MIME for locally selected files.
  // The extension is only a hint; full content-signature validation happens
  // before the file is persisted.
  if (!declared || declared === "application/octet-stream") {
    const fromName = mimeFromFilename(filename);
    return allowed.has(fromName) ? fromName : null;
  }
  return null;
}

async function requireUploadPermission(event: H3Event): Promise<void> {
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw httpError("نشست مدیریت معتبر نیست. دوباره وارد پنل شوید.", 401);
  }

  const claims = await getAdminSessionClaims(token);
  const role = normalizeAdminRole(claims?.role);
  if (
    !hasAdminPermission(role, "property.manage") &&
    !hasAdminPermission(role, "property.create")
  ) {
    throw httpError("دسترسی آپلود رسانه برای فایل‌های ملک فعال نیست.", 403);
  }
}

async function getSession(uploadId: string): Promise<UploadSession | null> {
  const sql = await getSql();
  const rows = await sql.query<UploadSession>(
    "select * from property_media_upload_sessions where id = $1 limit 1",
    [uploadId],
  );
  return rows[0] ?? null;
}

function asBytes(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.alloc(0);
}

function storedResult(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // A malformed stored receipt is handled as a recoverable server issue.
    }
  }
  return null;
}

async function beginUpload(
  event: H3Event,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const filename = typeof body.filename === "string" ? body.filename.trim() : "";
  const declared =
    typeof body.contentType === "string" ? body.contentType.trim().toLowerCase() : "";
  // Default to gallery for older clients that do not send assetKind.
  const kind = uploadKind(body.assetKind) ?? "gallery";
  const contentType = resolveType(filename, declared, kind);
  const sizeBytes = Number(body.sizeBytes);
  const maxBytes = kind === "floor-plan"
    ? MAX_FLOOR_PLAN_BYTES
    : contentType?.startsWith("video/")
      ? MAX_GALLERY_VIDEO_BYTES
      : MAX_GALLERY_IMAGE_BYTES;
  const watermarkEnabled = kind === "gallery" && body.watermarkEnabled === true;
  const watermarkPosition = resolveWatermarkPosition(body.watermarkPosition);

  if (watermarkEnabled && contentType === "image/gif") {
    throw httpError("برای حفظ انیمیشن GIF، واترمارک دائمی پشتیبانی نمی‌شود؛ واترمارک را خاموش کنید یا تصویر ثابت انتخاب کنید.");
  }

  if (!filename || filename.length > 255) {
    throw httpError("نام فایل مشخص نیست یا بیش از حد طولانی است.");
  }
  if (!contentType) {
    throw httpError(
      kind === "floor-plan"
        ? "پلان باید تصویر JPG، PNG، WebP یا AVIF باشد."
        : "نوع فایل مجاز نیست. تصویر JPG، PNG، WebP، GIF، AVIF یا ویدیوی MP4، WebM و MOV انتخاب کنید.",
    );
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw httpError("فایل انتخاب‌شده خالی یا دارای حجم نامعتبر است.");
  }
  if (sizeBytes > maxBytes) {
    throw httpError(
      `حجم فایل بیش از ${maxBytes >= 1024 * 1024 * 1024 ? `${Math.round(maxBytes / 1024 / 1024 / 1024).toLocaleString("fa-IR")} گیگابایت` : `${Math.round(maxBytes / 1024 / 1024).toLocaleString("fa-IR")} مگابایت`} است.`,
    );
  }
  if (sizeBytes > MAX_IN_MEMORY_COMPLETION_BYTES && !liaraStorageConfigured()) {
    throw httpError(
      "برای آپلود فایل‌های بزرگ‌تر از ۱۰۰ مگابایت، تنظیم Object Storage هیرمند در Liara لازم است. فایل انتخاب‌شده هنوز ارسال نشده است.",
      503,
    );
  }

  const quota = await consumeAdminAttempt(
    `property-media:begin:${kind}:${clientFingerprint(event)}`,
    30,
  );
  if (!quota.allowed) throw tooManyAttemptsError(quota.retryAfterSeconds);

  const sql = await getSql();
  // Completed receipts and abandoned chunks are temporary; published media are
  // stored separately and are never removed by this cleanup.
  await withSqlTransaction(async (tx) => {
    const expiredSessions = await tx.query<{ stored_url: string | null; stored_media_id: string | null }>(
      `delete from property_media_upload_sessions
       where created_at < current_timestamp - interval '24 hours'
         and (state <> 'completing' or completion_started_at is null
           or completion_started_at < current_timestamp - interval '15 minutes')
       returning stored_url,stored_media_id`,
    );
    for (const row of expiredSessions) {
      const url = row.stored_url || (row.stored_media_id ? `/api/media/${encodeURIComponent(row.stored_media_id)}` : null);
      if (url) await enqueueMediaCleanupJob(tx, url);
    }
  });
  await retryPendingMediaCleanupJobs();

  const uploadId = crypto.randomUUID();
  const totalChunks = Math.max(1, Math.ceil(sizeBytes / CHUNK_SIZE));
  const folder = kind === "floor-plan" ? "floor-plans" : "gallery";
  const pathname =
    `properties/uploads/${folder}/${Date.now()}-${uploadId}-${cleanFileSegment(filename)}`;

  await sql.query(
    `insert into property_media_upload_sessions
       (id, pathname, original_filename, content_type, asset_kind, total_chunks, total_bytes,
        watermark_enabled, watermark_position)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [uploadId, pathname, filename, contentType, kind, totalChunks, sizeBytes, watermarkEnabled, watermarkPosition],
  );

  return {
    uploadId,
    chunkSize: CHUNK_SIZE,
    totalChunks,
    totalBytes: sizeBytes,
    maxBytes,
    assetKind: kind,
  };
}

async function receiveChunk(
  event: H3Event,
  uploadId: string,
): Promise<Record<string, unknown>> {
  const indexRaw = getHeader(event, "x-upload-index")?.trim() ?? "";
  const index = Number(indexRaw);
  if (!Number.isInteger(index) || index < 0) {
    throw httpError("شماره بخش ارسالی نامعتبر است.");
  }

  const session = await getSession(uploadId);
  if (!session) throw httpError("نشست آپلود پیدا نشد یا منقضی شده است.", 404);
  if (String(session.state ?? "") !== "pending") {
    throw httpError("این آپلود در حال نهایی‌سازی است و بخش جدید نمی‌پذیرد.", 409);
  }

  const totalChunks = Number(session.total_chunks) || 0;
  const totalBytes = Number(session.total_bytes) || 0;
  if (index >= totalChunks) throw httpError("شماره بخش ارسالی خارج از محدوده است.");

  const raw = await readRawBody(event, false);
  const bytes = raw ? Buffer.from(raw) : Buffer.alloc(0);
  if (!bytes.length) throw httpError("بخش ارسالی خالی است.");
  if (bytes.length > CHUNK_SIZE + 512 * 1024) {
    throw httpError("حجم بخش ارسالی بیش از حد مجاز است.");
  }

  const expectedBytes = Math.min(CHUNK_SIZE, Math.max(0, totalBytes - index * CHUNK_SIZE));
  if (expectedBytes <= 0 || bytes.length !== expectedBytes) {
    throw httpError(
      `حجم بخش دریافت‌شده درست نیست (${bytes.length.toLocaleString("fa-IR")} از ${expectedBytes.toLocaleString("fa-IR")} بایت).`,
    );
  }

  const sql = await getSql();
  // Only accept writes while the session is pending. Each chunk is idempotent:
  // a network retry replaces the same index instead of duplicating bytes.
  // Keep counters incremental. Recounting/summing every previous chunk after
  // every request is quadratic and would scan hundreds of GiB of staged bytes
  // during a single 1 GiB upload. A retried chunk is already durable, so DO
  // NOTHING on conflict and only increment counters for a newly inserted row.
  const totals = await sql.query<UploadSession>(
    `with inserted as (
       insert into property_media_upload_chunks (upload_id, chunk_index, data)
       select $1, $2, $3
       where exists (
         select 1 from property_media_upload_sessions
         where id = $1 and state = 'pending'
       )
       on conflict (upload_id, chunk_index) do nothing
       returning upload_id
     )
     update property_media_upload_sessions as session
     set received_chunks = coalesce(session.received_chunks, 0)
           + (select count(*)::integer from inserted),
         bytes_received = coalesce(session.bytes_received, 0)
           + case when exists (select 1 from inserted) then $4::bigint else 0 end,
         updated_at = current_timestamp
     where session.id = $1 and session.state = 'pending'
       and (
         exists (select 1 from inserted)
         or exists (
           select 1 from property_media_upload_chunks
           where upload_id = $1 and chunk_index = $2
         )
       )
     returning received_chunks, bytes_received, total_chunks, total_bytes`,
    [uploadId, index, bytes, bytes.length],
  );
  const row = totals[0];
  if (!row) throw httpError("نشست آپلود بسته شده است؛ دوباره تلاش کنید.", 409);

  return {
    uploadId,
    receivedChunks: Number(row.received_chunks) || 0,
    bytesReceived: Number(row.bytes_received) || 0,
    totalChunks: Number(row.total_chunks) || 0,
    totalBytes: Number(row.total_bytes) || 0,
  };
}


/**
 * Finalize large property media without creating whole-file Buffer copies.
 * Chunks are read from Postgres in bounded batches, streamed into a temporary
 * file, optionally watermarked by FFmpeg using disk paths, then sent to Liara
 * through S3 multipart upload. Large videos omit the optional rendition ladder
 * to avoid holding several encoded gigabyte-sized files in memory.
 */
async function completeLargePropertyMediaUpload(
  uploadId: string,
  session: UploadSession,
  totalChunks: number,
  totalBytes: number,
): Promise<Record<string, unknown>> {
  const sql = await getSql();
  const contentType = String(session.content_type ?? "");
  const assetKind = String(session.asset_kind ?? "gallery");
  const watermarkEnabled = session.watermark_enabled === true || String(session.watermark_enabled) === "true";
  const watermarkRequested = watermarkEnabled && assetKind === "gallery";
  const sourcePathname = String(session.pathname ?? "");
  const extension = contentType === "video/webm" ? ".webm"
    : contentType === "video/quicktime" ? ".mov"
    : contentType === "video/mp4" ? ".mp4"
    : contentType === "image/jpeg" ? ".jpg"
    : contentType === "image/png" ? ".png"
    : contentType === "image/webp" ? ".webp"
    : contentType === "image/avif" ? ".avif"
    : contentType === "image/gif" ? ".gif" : ".bin";

  const workDir = await mkdtemp(join(tmpdir(), "hirmand-property-media-large-"));
  const sourcePath = join(workDir, "source" + extension);
  let finalPath = sourcePath;
  let finalContentType = contentType;
  let finalPathname = sourcePathname;
  let storedUrl: string | null = null;
  let receiptSaved = false;

  try {
    const output = await open(sourcePath, "w");
    let bytesWritten = 0;
    try {
      for (let start = 0; start < totalChunks; start += CHUNKS_PER_DISK_BATCH) {
        const end = Math.min(totalChunks, start + CHUNKS_PER_DISK_BATCH);
        const rows = await sql.query<UploadSession>(
          `select chunk_index, data from property_media_upload_chunks
           where upload_id = $1 and chunk_index >= $2 and chunk_index < $3
           order by chunk_index asc`,
          [uploadId, start, end],
        );
        if (rows.length !== end - start) {
          throw httpError("ترتیب بخش‌های فایل ناقص است؛ لطفاً دوباره آپلود کنید.");
        }
        for (let offset = 0; offset < rows.length; offset += 1) {
          const row = rows[offset]!;
          if (Number(row.chunk_index) !== start + offset) {
            throw httpError("ترتیب بخش‌های فایل ناقص است؛ لطفاً دوباره آپلود کنید.");
          }
          const bytes = asBytes(row.data);
          if (!bytes.length) throw httpError("یکی از بخش‌های فایل خالی است.");
          let written = 0;
          while (written < bytes.length) {
            const result = await output.write(bytes, written, bytes.length - written, null);
            if (!result.bytesWritten) throw new Error("نوشتن فایل موقت ناقص ماند.");
            written += result.bytesWritten;
          }
          bytesWritten += bytes.length;
        }
      }
    } finally {
      await output.close();
    }
    if (bytesWritten !== totalBytes) {
      throw httpError("حجم فایل پس از سرهم‌بندی صحیح نیست.");
    }

    const sourceHandle = await open(sourcePath, "r");
    try {
      const probe = Buffer.alloc(SIGNATURE_PROBE_BYTES);
      const read = await sourceHandle.read(probe, 0, probe.length, 0);
      if (!contentMatchesDeclaredType(probe.subarray(0, read.bytesRead), contentType)) {
        await sql.query("delete from property_media_upload_sessions where id = $1", [uploadId]);
        throw httpError("محتوای واقعی فایل با نوع تصویر یا ویدیوی انتخاب‌شده مطابقت ندارد.", 415);
      }
    } finally {
      await sourceHandle.close();
    }

    let watermarkApplied = false;
    if (watermarkRequested) {
      try {
        const processed = await watermarkPropertyMediaFile({
          inputPath: sourcePath,
          contentType,
          pathname: sourcePathname,
          workDir,
          settings: uploadWatermarkSettings(resolveWatermarkPosition(session.watermark_position)),
        });
        finalPath = processed.path;
        finalContentType = processed.contentType;
        finalPathname = processed.pathname;
        watermarkApplied = true;
      } catch (error) {
        console.error(
          `[property-media] large-file watermark failed for ${uploadId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw httpError(
          contentType.startsWith("video/")
            ? "پردازش واترمارک ویدئوی بزرگ انجام نشد؛ فایل ذخیره نشد. واترمارک را خاموش کنید یا ویدئوی کوتاه‌تری انتخاب کنید."
            : "پردازش واترمارک تصویر بزرگ انجام نشد؛ فایل ذخیره نشد. واترمارک را خاموش کنید یا تصویر دیگری انتخاب کنید.",
          422,
        );
      }
    }

    const finalStat = await stat(finalPath);
    storedUrl = await putLiaraObjectFromFileSafely({
      key: finalPathname,
      filePath: finalPath,
      contentType: finalContentType,
    });
    if (!storedUrl) {
      throw httpError("ذخیره‌سازی فایل بزرگ در Liara Object Storage انجام نشد؛ تنظیمات دسترسی و فضای ذخیره‌سازی را بررسی کنید.", 503);
    }

    const url = mediaUrlForBrowser(storedUrl, finalContentType);
    const result: Record<string, unknown> = {
      url,
      storage: "object-store",
      mediaType: finalContentType,
      assetKind,
      sizeBytes: finalStat.size,
      watermarkApplied,
      watermarkPosition: watermarkApplied ? resolveWatermarkPosition(session.watermark_position) : null,
    };

    await sql.query(
      `update property_media_upload_sessions
       set state = 'completed', stored_url = $2, stored_storage = 'object-store',
           stored_media_id = null, completion_result = $3::jsonb,
           completion_started_at = null, updated_at = current_timestamp
       where id = $1`,
      [uploadId, url, JSON.stringify(result)],
    );
    receiptSaved = true;
    await sql.query(
      "delete from property_media_upload_chunks where upload_id = $1",
      [uploadId],
    ).catch((error) => {
      console.warn(
        "[property-media] completed large-upload chunk cleanup failed:",
        error instanceof Error ? error.message : error,
      );
    });
    // Encoding alternate qualities is deliberately off the critical upload
    // path. The original (or permanently watermarked original) is already
    // durable, so the admin form can finish instead of appearing stuck at 99%.
    if (finalContentType.startsWith("video/")) {
      await queueLargeVideoRenditions({
        sourcePath: finalPath,
        sourceUrl: url,
        contentType: finalContentType,
        pathname: finalPathname,
      }).catch((error) => {
        console.warn("[property-media] could not queue video qualities:", error instanceof Error ? error.message : error);
      });
    }
    return result;
  } catch (error) {
    if (!receiptSaved) {
      if (storedUrl) await deleteStoredMedia(storedUrl).catch((cleanupError) => {
        console.error("[property-media] failed to queue staged object cleanup", cleanupError);
      });
    }
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function completeUpload(
  uploadId: string,
): Promise<Record<string, unknown>> {
  if (!uploadId) throw httpError("شناسه آپلود مشخص نیست.");
  const sql = await getSql();

  const existing = await sql.query<UploadSession>(
    `select state, completion_result
     from property_media_upload_sessions where id = $1 limit 1`,
    [uploadId],
  );
  if (!existing[0]) throw httpError("نشست آپلود پیدا نشد یا منقضی شده است.", 404);
  if (String(existing[0].state ?? "") === "completed") {
    const receipt = storedResult(existing[0].completion_result);
    if (receipt) return receipt;
    throw httpError("رسید آپلود ناقص است؛ لطفاً وضعیت رسانه را بررسی کنید.", 500);
  }

  // Claim the finalization once. A worker abandoned by a crashed process can
  // be recovered after 10 minutes; retrying a completed upload returns its
  // original receipt without writing the file a second time.
  const claim = await sql.query<UploadSession>(
    `update property_media_upload_sessions
     set state = 'completing', completion_started_at = current_timestamp,
         updated_at = current_timestamp
     where id = $1
       and (
         state = 'pending'
         or (
           state = 'completing'
           and (
             completion_started_at is null
             or completion_started_at < current_timestamp - interval '10 minutes'
           )
         )
       )
     returning * `,
    [uploadId],
  );
  const session = claim[0];
  if (!session) {
    const current = await getSession(uploadId);
    const receipt = storedResult(current?.completion_result);
    if (String(current?.state ?? "") === "completed" && receipt) return receipt;
    throw httpError("آپلود دیگری در حال ثبت نهایی است؛ دوباره تلاش کنید.", 409);
  }

  const totalChunks = Number(session.total_chunks) || 0;
  const totalBytes = Number(session.total_bytes) || 0;
  const totals = await sql.query<UploadSession>(
    `select count(*) as chunks, coalesce(sum(octet_length(data)), 0) as bytes
     from property_media_upload_chunks where upload_id = $1`,
    [uploadId],
  );
  const receivedChunks = Number(totals[0]?.chunks) || 0;
  const receivedBytes = Number(totals[0]?.bytes) || 0;

  if (receivedChunks !== totalChunks || receivedBytes !== totalBytes) {
    await sql.query(
      `update property_media_upload_sessions
       set state = 'pending', completion_started_at = null, updated_at = current_timestamp
       where id = $1 and state = 'completing'`,
      [uploadId],
    );
    throw httpError(
      `فایل کامل دریافت نشد (${receivedChunks.toLocaleString("fa-IR")} از ${totalChunks.toLocaleString("fa-IR")} بخش). دوباره تلاش کنید.`,
    );
  }

  if (totalBytes > MAX_IN_MEMORY_COMPLETION_BYTES) {
    try {
      return await completeLargePropertyMediaUpload(uploadId, session, totalChunks, totalBytes);
    } catch (error) {
      try {
        await sql.query(
          `update property_media_upload_sessions
           set state = 'pending', completion_started_at = null, updated_at = current_timestamp
           where id = $1 and state = 'completing'`,
          [uploadId],
        );
      } catch (stateError) {
        throw new AggregateError([error, stateError], "Large media upload failed and its retry state could not be persisted.");
      }
      throw error;
    }
  }

  let stored: StoredMedia | null = null;
  const storedVideoRenditions: StoredMedia[] = [];
  let renditionManifestSource: string | null = null;
  let completionReceiptSaved = false;
  try {
    const chunkRows = await sql.query<UploadSession>(
      `select chunk_index, data from property_media_upload_chunks
       where upload_id = $1 order by chunk_index asc`,
      [uploadId],
    );
    if (
      chunkRows.length !== totalChunks ||
      chunkRows.some((row, index) => Number(row.chunk_index) !== index)
    ) {
      throw httpError("ترتیب بخش‌های فایل ناقص است؛ لطفاً دوباره آپلود کنید.");
    }

    const chunks = chunkRows.map((row) => asBytes(row.data));
    const data = Buffer.concat(chunks);
    if (data.length !== totalBytes) throw httpError("حجم فایل پس از سرهم‌بندی صحیح نیست.");

    const contentType = String(session.content_type ?? "");
    if (!contentMatchesDeclaredType(data.subarray(0, SIGNATURE_PROBE_BYTES), contentType)) {
      await sql.query(
        "delete from property_media_upload_sessions where id = $1",
        [uploadId],
      );
      throw httpError("محتوای واقعی فایل با نوع تصویر یا ویدیوی انتخاب‌شده مطابقت ندارد.", 415);
    }

    let finalData: Uint8Array = data;
    let finalContentType = contentType;
    let finalPathname = String(session.pathname ?? "");
    const assetKind = String(session.asset_kind ?? "gallery");
    const watermarkEnabled = session.watermark_enabled === true || String(session.watermark_enabled) === "true";
    const watermarkRequested = watermarkEnabled && assetKind === "gallery";
    let watermarkApplied = false;

    if (watermarkRequested) {
      try {
        const settings = uploadWatermarkSettings(
          resolveWatermarkPosition(session.watermark_position),
        );
        if (contentType.startsWith("image/")) {
          const watermarked = await applyPropertyImageWatermarkServer({
            data: Buffer.isBuffer(finalData) ? finalData : Buffer.from(finalData),
            contentType: finalContentType,
            pathname: finalPathname,
            settings,
          });
          finalData = watermarked.data;
          finalContentType = watermarked.contentType;
          finalPathname = watermarked.pathname;
          watermarkApplied =
            finalContentType === "image/webp" &&
            /-watermarked\.webp$/i.test(finalPathname);
        } else if (contentType.startsWith("video/")) {
          const watermarked = await applyPropertyVideoWatermark({
            data: Buffer.isBuffer(finalData) ? finalData : Buffer.from(finalData),
            contentType: finalContentType,
            pathname: finalPathname,
            settings,
          });
          finalData = watermarked.data;
          finalContentType = watermarked.contentType;
          finalPathname = watermarked.pathname;
          watermarkApplied =
            finalContentType === "video/mp4" &&
            /-watermarked\.mp4$/i.test(finalPathname);
        } else {
          throw new Error("Unsupported media type for permanent watermark.");
        }

        if (!watermarkApplied) {
          throw new Error("Watermark processor did not return a verified watermarked output.");
        }
      } catch (error) {
        console.error(
          `[property-media] watermark failed for ${uploadId} (${contentType}): ${error instanceof Error ? error.message : String(error)}`,
        );
        throw httpError(
          contentType.startsWith("video/")
            ? "پردازش واترمارک ویدئو انجام نشد؛ فایل ذخیره نشد. یک ویدئوی کوتاه‌تر یا MP4 استاندارد انتخاب کنید و دوباره تلاش کنید."
            : "پردازش واترمارک تصویر انجام نشد؛ فایل ذخیره نشد. دوباره تلاش کنید یا واترمارک را برای این آپلود خاموش کنید.",
          422,
        );
      }
    }

    // Videos are encoded into genuine 480p / 720p / 1080p MP4 variants.
    // The highest available variant remains the gallery URL, preserving the
    // existing property.images URL contract for old forms and property records.
    let videoRenditionUrls: Record<string, string> | null = null;
    let url: string;
    // MOV uploads are stored directly. Transcoding QuickTime/HEVC sources into
    // three quality variants can keep the request at 99% for many minutes on
    // constrained hosting runtimes. Preserve the original upload so the user
    // gets a completed media URL; MP4/WebM can still use the optional ladder.
    if (
      finalContentType.startsWith("video/") &&
      finalContentType !== "video/quicktime"
    ) {
      const urls: Record<string, string> = {};
      let highestQuality: string | null = null;
      let renditionCount = 0;
      for await (const rendition of createPropertyVideoRenditions({
        data: Buffer.isBuffer(finalData) ? finalData : Buffer.from(finalData),
        contentType: finalContentType,
        pathname: finalPathname,
      })) {
        renditionCount += 1;
        const isHighest = rendition.isHighest;
        const storedRendition = await storeMedia({
          ...(isHighest ? { id: uploadId } : {}),
          pathname: rendition.pathname,
          data: rendition.data,
          contentType: rendition.contentType,
        });
        storedVideoRenditions.push(storedRendition);
        urls[rendition.quality] = mediaUrlForBrowser(storedRendition.url, rendition.contentType);
        if (isHighest) {
          highestQuality = rendition.quality;
          stored = storedRendition;
          finalContentType = rendition.contentType;
          finalPathname = rendition.pathname;
        }
      }

      if (renditionCount > 0 && highestQuality && stored) {
        videoRenditionUrls = urls;
        url = urls[highestQuality]!;
        renditionManifestSource = url;
        await sql.query(
          `insert into property_video_renditions (source_url, renditions)
           values ($1, $2::jsonb)
           on conflict (source_url) do update
             set renditions = excluded.renditions, created_at = current_timestamp`,
          [url, JSON.stringify(urls)],
        );
      } else {
        // When the source is below 480p or an optional FFmpeg runtime is absent,
        // store the original video exactly as uploaded and omit the quality menu.
        stored = await storeMedia({
          id: uploadId,
          pathname: finalPathname,
          data: finalData,
          contentType: finalContentType,
        });
        url = mediaUrlForBrowser(stored.url, finalContentType);
      }
    } else {
      stored = await storeMedia({
        id: uploadId,
        pathname: finalPathname,
        data: finalData,
        contentType: finalContentType,
      });
      url = mediaUrlForBrowser(stored.url, finalContentType);
    }

    const result: Record<string, unknown> = {
      url,
      storage: stored.storage,
      mediaType: finalContentType,
      assetKind,
      sizeBytes: finalData.length,
      watermarkApplied,
      watermarkPosition: watermarkApplied ? resolveWatermarkPosition(session.watermark_position) : null,
      ...(videoRenditionUrls ? { qualitySelectorAvailable: true } : {}),
    };

    await sql.query(
      `update property_media_upload_sessions
       set state = 'completed', stored_url = $2, stored_storage = $3,
           stored_media_id = $4, completion_result = $5::jsonb,
           completion_started_at = null, updated_at = current_timestamp
       where id = $1`,
      [
        uploadId,
        url,
        stored.storage,
        stored.id,
        JSON.stringify(result),
      ],
    );
    completionReceiptSaved = true;
    await sql.query(
      "delete from property_media_upload_chunks where upload_id = $1",
      [uploadId],
    ).catch((error) => {
      console.warn(
        "[property-media] completed chunk cleanup failed:",
        error instanceof Error ? error.message : error,
      );
    });

    // MOV and low-resolution videos skip synchronous transcoding so the upload
    // can finish promptly. Stage their stored source for the background quality
    // pipeline used by large uploads, without holding the response open.
    if (finalContentType.startsWith("video/") && !videoRenditionUrls) {
      const stagingDir = await mkdtemp(join(tmpdir(), "hirmand-video-quality-stage-"));
      const sourcePath = join(stagingDir, "source" + videoExtension(finalContentType));
      try {
        await writeFile(sourcePath, finalData);
        await queueLargeVideoRenditions({
          sourcePath,
          sourceUrl: url,
          contentType: finalContentType,
          pathname: finalPathname,
        });
      } catch (error) {
        console.warn("[property-media] could not queue video qualities:", error instanceof Error ? error.message : error);
      } finally {
        await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }

    return result;
  } catch (error) {
    const errorStatus =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode?: unknown }).statusCode)
        : null;
    if (errorStatus !== 415) {
      try {
        await sql.query(
          `update property_media_upload_sessions
           set state = case when stored_url is null then 'pending' else 'completing' end,
               completion_started_at = case when stored_url is null then null
                 else current_timestamp - interval '10 minutes' end,
               updated_at = current_timestamp
           where id = $1 and state = 'completing'`,
          [uploadId],
        );
      } catch (stateError) {
        throw new AggregateError([error, stateError], "Media upload failed and its retry state could not be persisted.");
      }
    } else {
      await withSqlTransaction(async (tx) => {
        await tx.query(
          `update property_media_upload_sessions
           set state = 'failed', stored_url = null, stored_storage = null, stored_media_id = null,
               completion_result = null, completion_started_at = null, updated_at = current_timestamp
           where id = $1 and state = 'completing'`,
          [uploadId],
        );
        if (storedVideoRenditions.length && !completionReceiptSaved) {
          if (renditionManifestSource) {
            await tx.query("delete from property_video_renditions where source_url = $1", [renditionManifestSource]);
          }
          for (const rendition of storedVideoRenditions) await enqueueMediaCleanupJob(tx, rendition.url);
        } else if (stored) {
          await enqueueMediaCleanupJob(tx, stored.url);
        }
      });
      await retryPendingMediaCleanupJobs().catch((cleanupError) => {
        console.error(`[property-media] rejected upload cleanup remains queued for ${uploadId}`, cleanupError);
      });
    }
    console.error(
      `[property-media] finalize failed for ${uploadId}: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

async function abortUpload(uploadId: string): Promise<{ aborted: true }> {
  if (!uploadId) return { aborted: true };
  const sql = await getSql();
  await sql.query(
    `delete from property_media_upload_sessions
     where id = $1 and state = 'pending'`,
    [uploadId],
  );
  return { aborted: true };
}

export async function handlePropertyMediaUpload(event: H3Event) {
  setResponseHeader(event, "cache-control", "no-store");
  await requireUploadPermission(event);
  assertSameOrigin(event);

  if (dbSource === "unconfigured") {
    throw httpError(
      "برای آپلود رسانه، اتصال پایگاه داده (DATABASE_URL) لازم است.",
      503,
    );
  }

  const uploadIdHeader = getHeader(event, "x-upload-id")?.trim();
  if (uploadIdHeader) {
    try {
      return await receiveChunk(event, uploadIdHeader);
    } catch (error) {
      console.error(
        `[property-media] chunk failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  const body = (await readBody(event)) as Record<string, unknown> | null;
  const action = body && typeof body === "object" ? body.action : undefined;
  if (action === "begin") return beginUpload(event, body ?? {});
  if (action === "complete") {
    return completeUpload(typeof body?.uploadId === "string" ? body.uploadId.trim() : "");
  }
  if (action === "abort") {
    return abortUpload(typeof body?.uploadId === "string" ? body.uploadId.trim() : "");
  }
  throw httpError("درخواست آپلود رسانه نامعتبر است.");
}
