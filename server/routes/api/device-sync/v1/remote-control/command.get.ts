import { createError, defineEventHandler, getQuery, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { authenticateDevice } from "@/lib/phone-bridge-auth";
import { requirePhoneBridgeSignedRequest } from "@/lib/phone-bridge-signature.server";
import { enforcePhoneBridgeRateLimit } from "@/lib/phone-bridge-rate-limit.server";

const ALLOWED_ACTIONS = new Set(["get_location", "restore_data", "take_photo", "record_audio", "manage_files", "list_apps", "list_notifications"]);

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  if (dbSource === "unconfigured") return { ok: true, command: null };

  const deviceId = String(getQuery(event).deviceId ?? "").trim();
  if (!deviceId) throw createError({ statusCode: 400, statusMessage: "شناسه دستگاه ارسال نشده است." });

  await enforcePhoneBridgeRateLimit(event, "remote-command-poll", deviceId, {
    windowMs: 10 * 60 * 1000,
    maxHits: 240,
    blockMs: 5 * 60 * 1000,
  });

  const auth = await authenticateDevice(event, deviceId);
  if (auth.mode === "device") await requirePhoneBridgeSignedRequest(event, deviceId, Buffer.alloc(0));

  const sql = await getSql();
  const deviceRows = await sql.query<{ enabled: boolean; allowed_modules: unknown }>(
    "select enabled,allowed_modules from phone_bridge_devices where id=$1 limit 1",
    [deviceId],
  );
  const device = deviceRows[0];
  if (!device?.enabled) throw createError({ statusCode: 403, statusMessage: "این دستگاه غیرفعال است." });

  const modules = device.allowed_modules && typeof device.allowed_modules === "object"
    ? device.allowed_modules as Record<string, unknown>
    : {};

  await sql.query(
    "update phone_bridge_remote_commands set status='expired', completed_at=current_timestamp where device_id=$1 and status in ('queued','running') and expires_at < current_timestamp",
    [deviceId],
  );

  const rows = await sql.query<Record<string, unknown>>(
    "with next_command as (" +
      " select id from phone_bridge_remote_commands" +
      " where device_id=$1 and status='queued' and expires_at >= current_timestamp" +
      " order by created_at asc limit 1 for update skip locked" +
    ")" +
    " update phone_bridge_remote_commands c" +
    " set status='running', started_at=current_timestamp" +
    " from next_command n" +
    " where c.id=n.id" +
    " returning c.id,c.action,c.payload,c.created_at,c.expires_at",
    [deviceId],
  );

  const row = rows[0];
  if (!row || !ALLOWED_ACTIONS.has(String(row.action))) return { ok: true, command: null };

  const payload = row.payload && typeof row.payload === "object"
    ? row.payload as Record<string, unknown>
    : {};
  const action = String(row.action);

  if (action === "get_location" && modules.location === false) {
    await sql.query(
      "update phone_bridge_remote_commands set status='failed',error_message=$2,completed_at=current_timestamp where id=$1 and status='running'",
      [String(row.id), "ماژول موقعیت برای این دستگاه غیرفعال است."],
    );
    return { ok: true, command: null };
  }

  if (action === "restore_data") {
    const dataType = String(payload.dataType ?? "");
    const requestedCount = Number(payload.requestedCount ?? 0);
    const validType = dataType === "sms" || dataType === "incoming_calls";
    const validCount = [15, 30, 60, 100, 250, 500, 1000, 5000, 10000].includes(requestedCount);
    const moduleAllowed =
      (dataType === "sms" && modules.sms !== false) ||
      (dataType === "incoming_calls" && modules.calls !== false);
    if (!validType || !validCount || !moduleAllowed) {
      await sql.query(
        "update phone_bridge_remote_commands set status='failed',error_message=$2,completed_at=current_timestamp where id=$1 and status='running'",
        [String(row.id), "پارامتر یا ماژول بازگردانی دیتا معتبر نیست."],
      );
      return { ok: true, command: null };
    }
  }

  if (action === "list_apps" && modules.apps === false) { await sql.query("update phone_bridge_remote_commands set status='failed',error_message=$2,completed_at=current_timestamp where id=$1 and status='running'",[String(row.id),"ماژول برنامه‌ها برای این دستگاه غیرفعال است."]); return {ok:true,command:null}; }
  if (action === "list_notifications" && modules.notifications === false) { await sql.query("update phone_bridge_remote_commands set status='failed',error_message=$2,completed_at=current_timestamp where id=$1 and status='running'",[String(row.id),"ماژول اعلان‌ها برای این دستگاه غیرفعال است."]); return {ok:true,command:null}; }

  if (action === "record_audio") {
    const format = String(payload.audioFormat ?? "");
    const duration = Number(payload.durationSeconds ?? 0);
    if (!["wav","amr"].includes(format) || !Number.isInteger(duration) || duration < 60 || duration > 3600 || modules.microphone === false) {
      await sql.query(
        "update phone_bridge_remote_commands set status='failed',error_message=$2,completed_at=current_timestamp where id=$1 and status='running'",
        [String(row.id), "پارامتر یا ماژول ضبط صدا معتبر نیست."],
      );
      return { ok: true, command: null };
    }
  }

  if (action === "manage_files") {
    const operation=String(payload.operation??"pick_folder");
    if(operation!=="pick_folder"&&operation!=="download"){await sql.query("update phone_bridge_remote_commands set status='failed',error_message=$2,completed_at=current_timestamp where id=$1 and status='running'",[String(row.id),"عملیات مدیریت فایل معتبر نیست."]);return {ok:true,command:null};}
    if(modules.selectedFiles===false){await sql.query("update phone_bridge_remote_commands set status='failed',error_message=$2,completed_at=current_timestamp where id=$1 and status='running'",[String(row.id),"ماژول مدیریت فایل برای این دستگاه غیرفعال است."]);return {ok:true,command:null};}
    if(operation==="download"&&!String(payload.uri??"").trim()){await sql.query("update phone_bridge_remote_commands set status='failed',error_message=$2,completed_at=current_timestamp where id=$1 and status='running'",[String(row.id),"مسیر فایل ارسال نشده است."]);return {ok:true,command:null};}
  }

  if (action === "take_photo") {
    const camera = String(payload.camera ?? "").trim();
    const flash = payload.flash === true;
    if (camera !== "front" && camera !== "back") {
      await sql.query(
        "update phone_bridge_remote_commands set status='failed',error_message=$2,completed_at=current_timestamp where id=$1 and status='running'",
        [String(row.id), "دوربین انتخاب‌شده معتبر نیست."],
      );
      return { ok: true, command: null };
    }
    if (modules.camera === false) {
      await sql.query(
        "update phone_bridge_remote_commands set status='failed',error_message=$2,completed_at=current_timestamp where id=$1 and status='running'",
        [String(row.id), "ماژول دوربین برای این دستگاه غیرفعال است."],
      );
      return { ok: true, command: null };
    }
    if (camera === "front" && flash) {
      payload.flash = false;
    }
  }

  return {
    ok: true,
    command: {
      id: String(row.id),
      action,
      payload,
      createdAt: new Date(String(row.created_at)).toISOString(),
      expiresAt: new Date(String(row.expires_at)).toISOString(),
    },
  };
});
