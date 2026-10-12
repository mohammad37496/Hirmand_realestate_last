import { createError, defineEventHandler, getHeader, readRawBody, setResponseHeader } from "h3";
import { randomUUID } from "node:crypto";
import { authenticateDevice } from "@/lib/phone-bridge-auth";
import { requirePhoneBridgeSignedRequest } from "@/lib/phone-bridge-signature.server";
import { enforcePhoneBridgeRateLimit } from "@/lib/phone-bridge-rate-limit.server";
import { getSql, dbSource } from "@/lib/db";
import { recordPhoneBridgeEvent } from "@/lib/phone-bridge-events.server";
import { createHash } from "node:crypto";

const MAX_BYTES = 50 * 1024 * 1024;
const allowedMime = new Set(["audio/mp4","audio/m4a","audio/aac","audio/3gpp","audio/amr","audio/wav","audio/x-wav","audio/ogg","audio/webm"]);

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  const deviceId = String(getHeader(event, "x-hirmand-device-id") || "").trim();
  if (!deviceId) throw createError({ statusCode: 400, statusMessage: "شناسه دستگاه ارسال نشده است." });

  await enforcePhoneBridgeRateLimit(event, "call-recording-upload", deviceId, {
    windowMs: 10 * 60 * 1000,
    maxHits: 20,
    blockMs: 10 * 60 * 1000,
  });
  const raw = await readRawBody(event);
  const bytes = raw ? Buffer.from(raw) : Buffer.alloc(0);
  if (!bytes.length || bytes.length > MAX_BYTES) throw createError({ statusCode: 413, statusMessage: "اندازه فایل صوتی مجاز نیست." });

  const auth = await authenticateDevice(event, deviceId);
  if (auth.mode === "device") await requirePhoneBridgeSignedRequest(event, deviceId, bytes);

  if (dbSource === "unconfigured") throw createError({ statusCode: 503, statusMessage: "پایگاه داده آماده نیست." });

  const mime = String(getHeader(event, "x-hirmand-file-mime") || getHeader(event, "content-type") || "").split(";")[0].toLowerCase();
  if (!allowedMime.has(mime)) throw createError({ statusCode: 415, statusMessage: "فرمت فایل صوتی مجاز نیست." });

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const declaredSha = String(getHeader(event, "x-hirmand-file-sha256") || "");
  if (declaredSha && declaredSha !== sha256) throw createError({ statusCode: 422, statusMessage: "هش فایل صحیح نیست." });

  const started = String(getHeader(event, "x-hirmand-call-started-at") || "");
  const ended = String(getHeader(event, "x-hirmand-call-ended-at") || "");
  const direction = String(getHeader(event, "x-hirmand-call-direction") || "unknown");
  const phoneNumber = String(getHeader(event, "x-hirmand-call-number") || "").slice(0, 80);
  const contactName = String(getHeader(event, "x-hirmand-call-contact") || "").slice(0, 160);
  const duration = Number(getHeader(event, "x-hirmand-call-duration") || 0);

  if (!["incoming","outgoing","unknown"].includes(direction)) {
    throw createError({ statusCode: 400, statusMessage: "جهت تماس نامعتبر است." });
  }

  const sql = await getSql();
  const existing = await sql.query<{ id: string; file_id: string }>(
    `select id,file_id from phone_bridge_call_recordings where device_id=$1 and sha256=$2 limit 1`,
    [deviceId, sha256],
  );
  if (existing[0]) {
    return { ok: true, duplicate: true, recordingId: existing[0].id, fileId: existing[0].file_id };
  }

  const recordingId = randomUUID();
  const fileId = randomUUID();
  const extension = mime.includes("wav") ? "wav" : mime.includes("ogg") ? "ogg" : mime.includes("webm") ? "webm" : "m4a";
  const fileName = `call-recording-${recordingId}.${extension}`;

  await sql.query(
    `insert into phone_bridge_files
      (id,device_id,name,mime_type,size_bytes,sha256,content)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [fileId, deviceId, fileName, mime, bytes.length, sha256, bytes],
  );

  await sql.query(
    `insert into phone_bridge_call_recordings
      (id,device_id,file_id,call_started_at,call_ended_at,direction,phone_number,contact_name,duration_seconds,mime_type,size_bytes,sha256)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      recordingId, deviceId, fileId,
      started ? new Date(started) : new Date(),
      ended ? new Date(ended) : null,
      direction,
      phoneNumber || null,
      contactName || null,
      Number.isFinite(duration) ? Math.max(0, Math.min(Math.trunc(duration), 86400)) : null,
      mime, bytes.length, sha256,
    ],
  );

  await recordPhoneBridgeEvent({
    deviceId,
    eventType: "call_recording.uploaded",
    severity: "info",
    message: "فایل ضبط تماس با موفقیت دریافت شد.",
    metadata: { recordingId, fileId, sizeBytes: bytes.length, mimeType: mime },
  });

  return { ok: true, duplicate: false, recordingId, fileId };
});
