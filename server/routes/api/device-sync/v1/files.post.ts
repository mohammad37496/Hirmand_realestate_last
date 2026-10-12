import { createHash, randomUUID } from "node:crypto";
import {
  createError,
  defineEventHandler,
  getHeader,
  readRawBody,
  setResponseHeader,
  type H3Event,
} from "h3";
import { dbSource, getSql } from "@/lib/db";
import { authenticateDevice } from "@/lib/phone-bridge-auth";
import { requirePhoneBridgeSignedRequest } from "@/lib/phone-bridge-signature.server";
import { recordPhoneBridgeEvent } from "@/lib/phone-bridge-events.server";
import { enforcePhoneBridgeRateLimit } from "@/lib/phone-bridge-rate-limit.server";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
function safeName(value: string) {
  const normalized = [...value].map((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || char === "/" || char === "\\" ? "-" : char;
  }).join("").trim().slice(-180);
  return normalized || "file";
}

function decodeName(value: string | undefined) {
  if (!value) return "file";
  try {
    return safeName(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    return "file";
  }
}

function validSha(value: string) {
  return /^[a-f0-9]{64}$/i.test(value);
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");

  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده برای دریافت فایل در دسترس نیست." });
  }

  const deviceId = getHeader(event, "x-hirmand-device-id")?.trim().slice(0, 120) ?? "";
  const declaredSha = getHeader(event, "x-hirmand-file-sha256")?.trim().toLowerCase() ?? "";
  const declaredSize = Number(getHeader(event, "x-hirmand-file-size") ?? "");
  const mimeType = getHeader(event, "x-hirmand-file-mime")?.trim().slice(0, 180) || "application/octet-stream";
  const name = decodeName(getHeader(event, "x-hirmand-file-name"));

  if (!deviceId) throw createError({ statusCode: 400, statusMessage: "شناسهٔ دستگاه ارسال نشده است." });
  await enforcePhoneBridgeRateLimit(event, "files", deviceId, {
    windowMs: 10 * 60 * 1000,
    maxHits: 40,
    blockMs: 10 * 60 * 1000,
  });

  const raw = await readRawBody(event);
  const content = Buffer.isBuffer(raw) ? raw : Buffer.from(raw ?? "");
  if (content.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "محتوای فایل ارسال نشده است." });
  }

  let authPolicy: Awaited<ReturnType<typeof authenticateDevice>>;
  try {
    authPolicy = await authenticateDevice(event, deviceId);
    if (authPolicy.mode === "device") {
      await requirePhoneBridgeSignedRequest(event, deviceId, content);
    }
  } catch (error) {
    await recordPhoneBridgeEvent({
      deviceId,
      eventType: "security.auth_failed",
      severity: "error",
      message: "احراز هویت دستگاه برای ارسال فایل ناموفق بود.",
      metadata: { route: "/api/device-sync/v1/files" },
    }).catch(() => undefined);
    throw error;
  }
  if (authPolicy.allowedModules.selectedFiles === false) {
    throw createError({ statusCode: 403, statusMessage: "ارسال فایل برای این دستگاه توسط سیاست سرور غیرفعال است." });
  }

  if (!validSha(declaredSha)) throw createError({ statusCode: 400, statusMessage: "SHA-256 فایل معتبر نیست." });
  if (!Number.isInteger(declaredSize) || declaredSize < 1 || declaredSize > MAX_FILE_BYTES) {
    throw createError({ statusCode: 413, statusMessage: "حجم فایل بیش از حد مجاز است." });
  }

  const contentLength = Number(getHeader(event, "content-length") ?? "");
  if (Number.isFinite(contentLength) && contentLength > MAX_FILE_BYTES) {
    throw createError({ statusCode: 413, statusMessage: "حجم فایل بیش از حد مجاز است." });
  }

  if (content.length !== declaredSize) {
    throw createError({ statusCode: 400, statusMessage: "حجم واقعی فایل با مقدار اعلام‌شده یکسان نیست." });
  }
  if (content.length !== declaredSize) {
    throw createError({ statusCode: 400, statusMessage: "حجم واقعی فایل با مقدار اعلام‌شده یکسان نیست." });
  }
  const actualSha = createHash("sha256").update(content).digest("hex");
  if (actualSha !== declaredSha) {
    throw createError({ statusCode: 400, statusMessage: "صحت فایل تأیید نشد؛ SHA-256 متفاوت است." });
  }

  const sql = await getSql();

  // File upload can arrive before the first JSON snapshot, so make sure the
  // device row exists. The next snapshot fills in the real model/details.
  await sql.query(
    `insert into phone_bridge_devices (id,name)
     values ($1,'گوشی')
     on conflict (id) do nothing`,
    [deviceId],
  );

  const inserted = await sql.query<{ id: string }>(
    `insert into phone_bridge_files
      (id,device_id,name,mime_type,size_bytes,sha256,content)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (device_id,sha256) do nothing
     returning id`,
    [randomUUID(), deviceId, name, mimeType, content.length, actualSha, content],
  );

  let fileId = inserted[0]?.id ?? null;
  if (!fileId) {
    const existing = await sql.query<{ id: string }>(
      `select id from phone_bridge_files where device_id=$1 and sha256=$2 limit 1`,
      [deviceId, actualSha],
    );
    fileId = existing[0]?.id ?? null;
  }

  return {
    ok: true,
    stored: Boolean(inserted[0]),
    deduplicated: !inserted[0],
    fileId,
    deviceId,
    name,
    sizeBytes: content.length,
    sha256: actualSha,
  };
});
