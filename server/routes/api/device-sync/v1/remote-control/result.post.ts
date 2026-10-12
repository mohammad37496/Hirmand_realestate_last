import { createError, defineEventHandler, readRawBody, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { authenticateDevice } from "@/lib/phone-bridge-auth";
import { requirePhoneBridgeSignedRequest } from "@/lib/phone-bridge-signature.server";
import { enforcePhoneBridgeRateLimit } from "@/lib/phone-bridge-rate-limit.server";

const ALLOWED_ACTIONS = new Set(["get_location", "take_photo", "record_audio", "manage_files", "list_apps", "list_notifications"]);

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  if (dbSource === "unconfigured") throw createError({ statusCode: 503, statusMessage: "پایگاه داده آماده نیست." });

  const raw = await readRawBody(event);
  const rawBody = raw ? Buffer.from(raw) : Buffer.alloc(0);
  if (!rawBody.length || rawBody.length > 16 * 1024) {
    throw createError({ statusCode: 413, statusMessage: "بدنهٔ نتیجهٔ ریموت معتبر نیست." });
  }
  let body: Record<string, unknown>;
  try {
    body = obj(JSON.parse(rawBody.toString("utf8")));
  } catch {
    throw createError({ statusCode: 400, statusMessage: "نتیجهٔ ریموت معتبر نیست." });
  }

  const deviceId = text(body.deviceId, 120);
  const commandId = text(body.commandId, 120);
  const action = text(body.action, 60);
  if (!deviceId || !commandId || !ALLOWED_ACTIONS.has(action)) {
    throw createError({ statusCode: 400, statusMessage: "نتیجهٔ ریموت معتبر نیست." });
  }

  await enforcePhoneBridgeRateLimit(event, "remote-command-result", deviceId, {
    windowMs: 10 * 60 * 1000,
    maxHits: 120,
    blockMs: 5 * 60 * 1000,
  });

  const auth = await authenticateDevice(event, deviceId);
  if (auth.mode === "device") await requirePhoneBridgeSignedRequest(event, deviceId, rawBody);

  const success = body.success === true;
  const errorMessage = text(body.error, 500);
  const payload = obj(body.result);
  let result: Record<string, unknown> = {};

  if (action === "get_location" && success) {
    const latitude = finite(payload.latitude);
    const longitude = finite(payload.longitude);
    if (
      latitude === null || longitude === null ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
    ) {
      throw createError({ statusCode: 422, statusMessage: "مختصات نتیجهٔ موقعیت معتبر نیست." });
    }
    result = {
      latitude,
      longitude,
      accuracyMeters: finite(payload.accuracyMeters),
      altitudeMeters: finite(payload.altitudeMeters),
      speedMps: finite(payload.speedMps),
      bearingDegrees: finite(payload.bearingDegrees),
      provider: text(payload.provider, 40) || "gps",
      recordedAt: finite(payload.recordedAt) ?? Date.now(),
    };
  }

  if (action === "manage_files" && success) {
    const fileId=text(payload.fileId,120); const fileName=text(payload.fileName,300);
    if(!fileId||!fileName)throw createError({statusCode:422,statusMessage:"نتیجه فایل معتبر نیست."});
    const sql=await getSql(); const rows=await sql.query<{name:string;mime_type:string;size_bytes:number;sha256:string}>("select name,mime_type,size_bytes,sha256 from phone_bridge_files where id=$1 and device_id=$2 limit 1",[fileId,deviceId]);
    const file=rows[0]; if(!file)throw createError({statusCode:422,statusMessage:"فایل ارسال‌شده پیدا نشد."});
    result={fileId,fileName:String(file.name),mimeType:String(file.mime_type),sizeBytes:Number(file.size_bytes),sha256:String(file.sha256)};
  }

  if (action === "list_apps" && success) {
    const count = finite(payload.count);
    const apps = Array.isArray(payload.apps) ? payload.apps.slice(0, 300) : [];
    if (count === null || count < 0 || count > 300) throw createError({ statusCode: 422, statusMessage: "فهرست برنامه‌ها معتبر نیست." });
    result = { count, apps };
  }
  if (action === "list_notifications" && success) {
    const count = finite(payload.count);
    const notifications = Array.isArray(payload.notifications) ? payload.notifications.slice(0, 50) : [];
    if (count === null || count < 0 || count > 50) throw createError({ statusCode: 422, statusMessage: "فهرست اعلان‌ها معتبر نیست." });
    result = { count, notifications };
  }
  if (action === "record_audio" && success) {
    const fileId = text(payload.fileId, 120);
    const audioFormat = text(payload.audioFormat, 12);
    const durationSeconds = finite(payload.durationSeconds);
    if (!fileId || !["wav","amr"].includes(audioFormat) || durationSeconds === null || durationSeconds < 60 || durationSeconds > 3600) {
      throw createError({ statusCode: 422, statusMessage: "نتیجهٔ ضبط صدا معتبر نیست." });
    }
    const sql = await getSql();
    const fileRows = await sql.query<{ name: string; mime_type: string; size_bytes: number; sha256: string }>(
      "select name,mime_type,size_bytes,sha256 from phone_bridge_files where id=$1 and device_id=$2 limit 1",
      [fileId, deviceId],
    );
    const file = fileRows[0];
    if (!file || !["audio/wav","audio/amr"].includes(String(file.mime_type).toLowerCase())) {
      throw createError({ statusCode: 422, statusMessage: "فایل صوتی پیدا نشد یا فرمت آن مجاز نیست." });
    }
    result = { fileId, fileName: String(file.name), mimeType: String(file.mime_type), sizeBytes: Number(file.size_bytes), sha256: String(file.sha256), audioFormat, durationSeconds };
  }

  if (action === "take_photo" && success) {
    const fileId = text(payload.fileId, 120);
    const camera = text(payload.camera, 12);
    const flash = payload.flash === true;
    if (!fileId || (camera !== "front" && camera !== "back")) {
      throw createError({ statusCode: 422, statusMessage: "نتیجهٔ عکس معتبر نیست." });
    }

    const sql = await getSql();
    const fileRows = await sql.query<{ name: string; mime_type: string; size_bytes: number; sha256: string }>(
      "select name,mime_type,size_bytes,sha256 from phone_bridge_files where id=$1 and device_id=$2 limit 1",
      [fileId, deviceId],
    );
    const file = fileRows[0];
    if (!file || String(file.mime_type).toLowerCase() !== "image/jpeg") {
      throw createError({ statusCode: 422, statusMessage: "فایل عکس پیدا نشد یا فرمت آن مجاز نیست." });
    }

    result = {
      fileId,
      fileName: String(file.name),
      mimeType: String(file.mime_type),
      sizeBytes: Number(file.size_bytes),
      sha256: String(file.sha256),
      camera,
      flash,
      recordedAt: finite(payload.recordedAt) ?? Date.now(),
    };
  }

  const sql = await getSql();
  const rows = await sql.query<{ id: string }>(
    "update phone_bridge_remote_commands" +
    " set status=$3, result=$4::jsonb, error_message=$5, completed_at=current_timestamp" +
    " where id=$1 and device_id=$2 and action=$6 and status='running'" +
    " returning id",
    [
      commandId,
      deviceId,
      success ? "succeeded" : "failed",
      JSON.stringify(result),
      success ? null : (errorMessage || "اجرای فرمان ناموفق بود."),
      action,
    ],
  );

  if (!rows.length) throw createError({ statusCode: 409, statusMessage: "فرمان پیدا نشد یا قبلاً تکمیل شده است." });
  return { ok: true, accepted: true, commandId };
});
