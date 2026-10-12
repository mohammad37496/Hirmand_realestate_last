import { createHash, randomUUID } from "node:crypto";
import {
  createError,
  defineEventHandler,
  getHeader,
  readRawBody,
  setResponseHeader,
} from "h3";
import { dbSource, getSql } from "@/lib/db";
import { authenticateDevice } from "@/lib/phone-bridge-auth";
import { requirePhoneBridgeSignedRequest } from "@/lib/phone-bridge-signature.server";
import { enforcePhoneBridgeRateLimit } from "@/lib/phone-bridge-rate-limit.server";
import { recordPhoneBridgeEvent } from "@/lib/phone-bridge-events.server";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

function safeName(value: string) {
  const sanitized = [...value].map((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || char === "/" || char === "\\" ? "-" : char;
  }).join("");
  return sanitized.trim().slice(-180) || "remote-photo.jpg";
}

function decodeName(value: string | undefined) {
  if (!value) return "remote-photo.jpg";
  try {
    return safeName(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    return "remote-photo.jpg";
  }
}

function validSha(value: string) {
  return /^[a-f0-9]{64}$/i.test(value);
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده آماده نیست." });
  }

  const deviceId = getHeader(event, "x-hirmand-device-id")?.trim().slice(0, 120) ?? "";
  const commandId = getHeader(event, "x-hirmand-command-id")?.trim().slice(0, 120) ?? "";
  const declaredSha = getHeader(event, "x-hirmand-file-sha256")?.trim().toLowerCase() ?? "";
  const declaredSize = Number(getHeader(event, "x-hirmand-file-size") ?? "");
  const mimeType = getHeader(event, "x-hirmand-file-mime")?.trim().toLowerCase().slice(0, 100) || "";
  const name = decodeName(getHeader(event, "x-hirmand-file-name"));

  if (!deviceId || !commandId) {
    throw createError({ statusCode: 400, statusMessage: "شناسهٔ دستگاه یا فرمان ارسال نشده است." });
  }

  await enforcePhoneBridgeRateLimit(event, "remote-photo-upload", deviceId, {
    windowMs: 10 * 60 * 1000,
    maxHits: 20,
    blockMs: 10 * 60 * 1000,
  });

  const auth = await authenticateDevice(event, deviceId);
  if (auth.mode === "device") {
    const raw = await readRawBody(event);
    const content = Buffer.isBuffer(raw) ? raw : Buffer.from(raw ?? "");
    if (content.length > MAX_PHOTO_BYTES) {
      throw createError({ statusCode: 413, statusMessage: "حجم عکس بیش از حد مجاز است." });
    }
    await requirePhoneBridgeSignedRequest(event, deviceId, content);
    if (auth.allowedModules.camera === false) {
      throw createError({ statusCode: 403, statusMessage: "ماژول دوربین برای این دستگاه غیرفعال است." });
    }

    if (mimeType !== "image/jpeg") {
      throw createError({ statusCode: 415, statusMessage: "فرمت عکس باید JPEG باشد." });
    }
    if (!validSha(declaredSha)) throw createError({ statusCode: 400, statusMessage: "SHA-256 عکس معتبر نیست." });
    if (!Number.isInteger(declaredSize) || declaredSize < 1 || declaredSize > MAX_PHOTO_BYTES) {
      throw createError({ statusCode: 413, statusMessage: "حجم عکس معتبر نیست." });
    }
    if (content.length !== declaredSize) throw createError({ statusCode: 400, statusMessage: "حجم واقعی عکس با مقدار اعلام‌شده یکسان نیست." });

    const actualSha = createHash("sha256").update(content).digest("hex");
    if (actualSha !== declaredSha) throw createError({ statusCode: 400, statusMessage: "صحت فایل عکس تأیید نشد." });

    const sql = await getSql();
    const commandRows = await sql.query<{ action: string; status: string; payload: unknown; expires_at: string }>(
      "select action,status,payload,expires_at from phone_bridge_remote_commands where id=$1 and device_id=$2 limit 1",
      [commandId, deviceId],
    );
    const command = commandRows[0];
    if (!command || command.status !== "running" || command.action !== "take_photo" || new Date(String(command.expires_at)).getTime() < Date.now()) {
      throw createError({ statusCode: 409, statusMessage: "فرمان عکس دیگر فعال نیست." });
    }

    const payload = command.payload && typeof command.payload === "object"
      ? command.payload as Record<string, unknown>
      : {};
    const camera = String(payload.camera ?? "");
    if (camera !== "front" && camera !== "back") {
      throw createError({ statusCode: 409, statusMessage: "پارامتر دوربین فرمان معتبر نیست." });
    }

    const inserted = await sql.query<{ id: string }>(
      "insert into phone_bridge_files (id,device_id,name,mime_type,size_bytes,sha256,content) values ($1,$2,$3,'image/jpeg',$4,$5,$6) on conflict (device_id,sha256) do nothing returning id",
      [randomUUID(), deviceId, name, content.length, actualSha, content],
    );

    let fileId = inserted[0]?.id ?? null;
    if (!fileId) {
      const existing = await sql.query<{ id: string }>(
        "select id from phone_bridge_files where device_id=$1 and sha256=$2 limit 1",
        [deviceId, actualSha],
      );
      fileId = existing[0]?.id ?? null;
    }

    await recordPhoneBridgeEvent({
      deviceId,
      eventType: "remote.photo_uploaded",
      severity: "info",
      message: "عکس ریموت از دستگاه دریافت و ذخیره شد.",
      metadata: { commandId, camera, fileId },
    }).catch(() => undefined);

    return {
      ok: true,
      fileId,
      name,
      sizeBytes: content.length,
      sha256: actualSha,
    };
  }

  throw createError({ statusCode: 401, statusMessage: "احراز هویت دستگاه معتبر نیست." });
});
