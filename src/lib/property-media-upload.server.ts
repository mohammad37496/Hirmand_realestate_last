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
import { dbSource, getSql } from "@/lib/db";
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
import { applyPropertyImageWatermarkServer } from "@/lib/property-image-watermark.server";
import { applyPropertyVideoWatermark } from "@/lib/property-video-watermark.server";
import { createPropertyVideoRenditions } from "@/lib/property-video-renditions.server";
import type { PropertyWatermarkPosition, PropertyWatermarkSettings } from "@/lib/property-watermark";
import {
  deleteStoredMedia,
  mediaUrlForBrowser,
  storeMedia,
  type StoredMedia,
} from "@/lib/media-store.server";

const CHUNK_SIZE = 2 * 1024 * 1024;
const MAX_GALLERY_IMAGE_BYTES = 100 * 1024 * 1024;
const MAX_GALLERY_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_FLOOR_PLAN_BYTES = 30 * 1024 * 1024;
const SIGNATURE_PROBE_BYTES = 32;

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
      `حجم فایل بیش از ${Math.round(maxBytes / 1024 / 1024)} مگابایت است.`,
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
  await sql.query(
    `delete from property_media_upload_sessions
     where created_at < current_timestamp - interval '24 hours'
       and (
         state <> 'completing'
         or completion_started_at is null
         or completion_started_at < current_timestamp - interval '15 minutes'
       )`,
  ).catch((error) => {
    console.warn(
      "[property-media] stale session cleanup failed:",
      error instanceof Error ? error.message : error,
    );
  });

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
  const inserted = await sql.query<UploadSession>(
    `insert into property_media_upload_chunks (upload_id, chunk_index, data)
     select $1, $2, $3
     where exists (
       select 1 from property_media_upload_sessions
       where id = $1 and state = 'pending'
     )
     on conflict (upload_id, chunk_index) do update set data = excluded.data
     returning upload_id`,
    [uploadId, index, bytes],
  );
  if (!inserted.length) throw httpError("نشست آپلود بسته شده است؛ دوباره تلاش کنید.", 409);

  const totals = await sql.query<UploadSession>(
    `update property_media_upload_sessions
     set received_chunks = (
           select count(*) from property_media_upload_chunks where upload_id = $1
         ),
         bytes_received = (
           select coalesce(sum(octet_length(data)), 0)
           from property_media_upload_chunks where upload_id = $1
         ),
         updated_at = current_timestamp
     where id = $1 and state = 'pending'
     returning received_chunks, bytes_received, total_chunks, total_bytes`,
    [uploadId],
  );
  const row = totals[0];
  if (!row) throw httpError("نشست آپلود در حال نهایی‌سازی است؛ دوباره تلاش کنید.", 409);

  return {
    uploadId,
    receivedChunks: Number(row.received_chunks) || 0,
    bytesReceived: Number(row.bytes_received) || 0,
    totalChunks: Number(row.total_chunks) || 0,
    totalBytes: Number(row.total_bytes) || 0,
  };
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
    if (finalContentType.startsWith("video/")) {
      const generated = await createPropertyVideoRenditions({
        data: Buffer.isBuffer(finalData) ? finalData : Buffer.from(finalData),
        contentType: finalContentType,
        pathname: finalPathname,
      });

      if (generated?.length) {
        const highestQuality = generated[generated.length - 1]!;
        const urls: Record<string, string> = {};
        let highestStored: StoredMedia | null = null;

        for (const rendition of generated) {
          const isHighest = rendition.quality === highestQuality.quality;
          const storedRendition = await storeMedia({
            ...(isHighest ? { id: uploadId } : {}),
            pathname: rendition.pathname,
            data: rendition.data,
            contentType: rendition.contentType,
          });
          storedVideoRenditions.push(storedRendition);
          urls[rendition.quality] = mediaUrlForBrowser(storedRendition.url, rendition.contentType);
          if (isHighest) {
            highestStored = storedRendition;
            finalData = rendition.data;
            finalContentType = rendition.contentType;
            finalPathname = rendition.pathname;
          }
        }

        if (!highestStored) throw new Error("نسخه اصلی ویدئو ساخته نشد.");
        stored = highestStored;
        videoRenditionUrls = urls;
        url = urls[highestQuality.quality]!;
        renditionManifestSource = url;
        await sql.query(
          `insert into property_video_renditions (source_url, renditions)
           values ($1, $2::jsonb)
           on conflict (source_url) do update
             set renditions = excluded.renditions, created_at = current_timestamp`,
          [url, JSON.stringify(urls)],
        );
      } else {
        // Very small source videos are preserved without upscaling or pretending
        // to offer a higher playback quality than they contain.
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

    return result;
  } catch (error) {
    const errorStatus =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode?: unknown }).statusCode)
        : null;
    if (errorStatus !== 415) {
      await sql.query(
        `update property_media_upload_sessions
         set state = case when stored_url is null then 'pending' else 'completing' end,
             completion_started_at = case when stored_url is null then null
               else current_timestamp - interval '10 minutes' end,
             updated_at = current_timestamp
         where id = $1 and state = 'completing'`,
        [uploadId],
      ).catch(() => undefined);
    }
    if (storedVideoRenditions.length && !completionReceiptSaved) {
      if (renditionManifestSource) {
        await sql.query(
          "delete from property_video_renditions where source_url = $1",
          [renditionManifestSource],
        ).catch(() => undefined);
      }
      await Promise.all(
        storedVideoRenditions.map((rendition) =>
          deleteStoredMedia(rendition.url).catch(() => undefined),
        ),
      );
    } else if (stored && errorStatus === 415) {
      await deleteStoredMedia(stored.url).catch(() => undefined);
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
