import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import {
  ADMIN_SESSION_COOKIE,
  getAdminSessionClaims,
  verifyAdminSessionToken,
} from "@/lib/admin-session.server";
import { assertAdminServerFnOrigin } from "@/lib/admin-server-fn-guard.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { recordPhoneBridgeEvent } from "@/lib/phone-bridge-events.server";
import { randomUUID } from "node:crypto";

async function requireRemoteControlAdmin() {
  const token = getCookie(ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(token))) throw new Error("نشست مدیریت معتبر نیست.");
  assertAdminServerFnOrigin();
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "security.manage")) {
    throw new Error("برای استفاده از کنترل ریموت Phone Bridge مجوز امنیت مدیران لازم است.");
  }
  return claims;
}

export type RemoteCommandAction = "get_location" | "restore_data" | "take_photo" | "record_audio" | "manage_files" | "list_apps" | "list_notifications";
export type RemoteDataType = "sms" | "incoming_calls";
export type RemoteCamera = "front" | "back";

type RemoteJsonPrimitive = string | number | boolean | null;
export type RemoteJsonValue = RemoteJsonPrimitive | RemoteJsonValue[] | { [key: string]: RemoteJsonValue };
export type RemoteJsonObject = { [key: string]: RemoteJsonValue };

function toRemoteJson(value: unknown): RemoteJsonValue {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(toRemoteJson);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, toRemoteJson(item)]),
    );
  }
  return String(value);
}

function toRemoteJsonObject(value: unknown): RemoteJsonObject {
  const normalized = toRemoteJson(value);
  return normalized && typeof normalized === "object" && !Array.isArray(normalized)
    ? normalized as RemoteJsonObject
    : {};
}

export type PhoneBridgeRemoteCommand = {
  id: string;
  deviceId: string;
  deviceName: string;
  action: RemoteCommandAction;
  status: "queued" | "running" | "succeeded" | "failed" | "expired";
  payload: {
    dataType?: RemoteDataType;
    requestedCount?: number;
    camera?: RemoteCamera;
    flash?: boolean;
    operation?: "pick_folder" | "download";
    uri?: string;
  };
  result: {
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number | null;
    altitudeMeters?: number | null;
    speedMps?: number | null;
    bearingDegrees?: number | null;
    provider?: string;
    recordedAt?: string;
    dataType?: RemoteDataType;
    requestedCount?: number;
    receivedCount?: number;
    chunkCount?: number;
    fileId?: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
    sha256?: string;
    camera?: RemoteCamera;
    flash?: boolean;
    operation?: "pick_folder" | "download";
    uri?: string;
    rootUri?: string;
    entries?: number;
    apps?: RemoteJsonObject[];
    notifications?: RemoteJsonObject[];
    audioFormat?: string;
  } | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: string;
};

const VALID_COUNTS = [15, 30, 60, 100, 250, 500, 1000, 5000, 10000] as const;

function mapRow(row: Record<string, unknown>): PhoneBridgeRemoteCommand {
  const raw = row.result && typeof row.result === "object" ? row.result as Record<string, unknown> : null;
  const rawPayload = row.payload && typeof row.payload === "object" ? row.payload as Record<string, unknown> : {};
  const action = String(row.action) as RemoteCommandAction;
  return {
    id: String(row.id),
    deviceId: String(row.device_id),
    deviceName: String(row.device_name ?? "گوشی ناشناس"),
    action,
    status: String(row.status) as PhoneBridgeRemoteCommand["status"],
    payload: {
      dataType: rawPayload.dataType === "sms" || rawPayload.dataType === "incoming_calls" ? rawPayload.dataType as RemoteDataType : undefined,
      requestedCount: typeof rawPayload.requestedCount === "number" ? rawPayload.requestedCount : undefined,
      camera: rawPayload.camera === "front" || rawPayload.camera === "back" ? rawPayload.camera as RemoteCamera : undefined,
      flash: typeof rawPayload.flash === "boolean" ? rawPayload.flash : undefined,
      operation: rawPayload.operation === "pick_folder" || rawPayload.operation === "download" ? rawPayload.operation : undefined,
      uri: typeof rawPayload.uri === "string" ? rawPayload.uri : undefined,
    },
    result: raw ? {
      latitude: typeof raw.latitude === "number" ? raw.latitude : undefined,
      longitude: typeof raw.longitude === "number" ? raw.longitude : undefined,
      accuracyMeters: typeof raw.accuracyMeters === "number" ? raw.accuracyMeters : null,
      altitudeMeters: typeof raw.altitudeMeters === "number" ? raw.altitudeMeters : null,
      speedMps: typeof raw.speedMps === "number" ? raw.speedMps : null,
      bearingDegrees: typeof raw.bearingDegrees === "number" ? raw.bearingDegrees : null,
      provider: typeof raw.provider === "string" ? raw.provider : undefined,
      recordedAt: typeof raw.recordedAt === "string"
        ? raw.recordedAt
        : (typeof raw.recordedAt === "number" ? new Date(raw.recordedAt).toISOString() : undefined),
      dataType: raw.dataType === "sms" || raw.dataType === "incoming_calls" ? raw.dataType as RemoteDataType : undefined,
      requestedCount: typeof raw.requestedCount === "number" ? raw.requestedCount : undefined,
      receivedCount: typeof raw.receivedCount === "number" ? raw.receivedCount : undefined,
      chunkCount: typeof raw.chunkCount === "number" ? raw.chunkCount : undefined,
      fileId: typeof raw.fileId === "string" ? raw.fileId : undefined,
      fileName: typeof raw.fileName === "string" ? raw.fileName : undefined,
      mimeType: typeof raw.mimeType === "string" ? raw.mimeType : undefined,
      sizeBytes: typeof raw.sizeBytes === "number" ? raw.sizeBytes : undefined,
      sha256: typeof raw.sha256 === "string" ? raw.sha256 : undefined,
      camera: raw.camera === "front" || raw.camera === "back" ? raw.camera as RemoteCamera : undefined,
      flash: typeof raw.flash === "boolean" ? raw.flash : undefined,
      operation: raw.operation === "pick_folder" || raw.operation === "download" ? raw.operation : undefined,
      uri: typeof raw.uri === "string" ? raw.uri : undefined,
      rootUri: typeof raw.rootUri === "string" ? raw.rootUri : undefined,
      entries: typeof raw.entries === "number" ? raw.entries : undefined,
      apps: Array.isArray(raw.apps) ? raw.apps.map(toRemoteJsonObject) : undefined,
      notifications: Array.isArray(raw.notifications) ? raw.notifications.map(toRemoteJsonObject) : undefined,
      audioFormat: typeof raw.audioFormat === "string" ? raw.audioFormat : undefined,
    } : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    startedAt: row.started_at ? new Date(String(row.started_at)).toISOString() : null,
    completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : null,
    expiresAt: new Date(String(row.expires_at)).toISOString(),
  };
}

export const createPhoneBridgeRemoteCommand = createServerFn({ method: "POST" })
  .validator(z.discriminatedUnion("action", [
    z.object({
      deviceId: z.string().trim().min(1).max(120),
      action: z.literal("get_location"),
    }),
    z.object({
      deviceId: z.string().trim().min(1).max(120),
      action: z.literal("restore_data"),
      dataType: z.enum(["sms", "incoming_calls"]),
      requestedCount: z.number().int().refine((v) => VALID_COUNTS.includes(v as typeof VALID_COUNTS[number])),
    }),
    z.object({
      deviceId: z.string().trim().min(1).max(120),
      action: z.literal("take_photo"),
      camera: z.enum(["front", "back"]),
      flash: z.boolean(),
    }),
    z.object({
      deviceId: z.string().trim().min(1).max(120),
      action: z.literal("manage_files"),
      operation: z.enum(["pick_folder","download"]),
      uri: z.string().trim().max(3000).optional(),
    }),
    z.object({
      deviceId: z.string().trim().min(1).max(120),
      action: z.literal("list_apps"),
    }),
    z.object({
      deviceId: z.string().trim().min(1).max(120),
      action: z.literal("list_notifications"),
    }),
    z.object({
      deviceId: z.string().trim().min(1).max(120),
      action: z.literal("record_audio"),
      audioFormat: z.enum(["wav", "amr", "mp3"]),
      durationSeconds: z.number().int().refine((v) => v >= 60 && v <= 3600 && v % 60 === 0),
    }),
  ]))
  .handler(async ({ data }) => {
    const claims = await requireRemoteControlAdmin();
    if (dbSource === "unconfigured") return { success: false, commandId: null };

    const sql = await getSql();
    const deviceRows = await sql.query<{ enabled: boolean; allowed_modules: unknown; name: string }>(
      "select enabled,allowed_modules,name from phone_bridge_devices where id=$1 limit 1",
      [data.deviceId],
    );
    const device = deviceRows[0];
    if (!device) throw new Error("دستگاه پیدا نشد.");
    if (!device.enabled) throw new Error("این دستگاه غیرفعال است.");

    const modules = device.allowed_modules && typeof device.allowed_modules === "object"
      ? device.allowed_modules as Record<string, unknown>
      : {};

    if (data.action === "get_location" && modules.location === false) {
      throw new Error("ماژول موقعیت برای این دستگاه غیرفعال است.");
    }
    if (data.action === "restore_data" && data.dataType === "sms" && modules.sms === false) {
      throw new Error("ماژول پیامک برای این دستگاه غیرفعال است.");
    }
    if (data.action === "restore_data" && data.dataType === "incoming_calls" && modules.calls === false) {
      throw new Error("ماژول تاریخچه تماس‌ها برای این دستگاه غیرفعال است.");
    }
    if (data.action === "take_photo" && modules.camera === false) {
      throw new Error("ماژول دوربین برای این دستگاه غیرفعال است.");
    }
    if (data.action === "manage_files" && modules.selectedFiles === false) throw new Error("ماژول مدیریت فایل برای این دستگاه غیرفعال است.");
    if (data.action === "manage_files" && data.operation === "download" && !data.uri) throw new Error("مسیر فایل برای دانلود مشخص نشده است.");
    if (data.action === "manage_files" && data.operation === "download" && data.uri) {
      const allowedFile = await sql.query<{ id: string }>(
        "select id from phone_bridge_file_entries where device_id=$1 and uri=$2 and is_directory=false limit 1",
        [data.deviceId, data.uri],
      );
      if (!allowedFile.length) throw new Error("این فایل در فهرست مجاز گوشی وجود ندارد؛ ابتدا پوشه را دوباره انتخاب و همگام‌سازی کن.");
    }
    if (data.action === "list_apps" && modules.apps === false) throw new Error("ماژول برنامه‌ها برای این دستگاه غیرفعال است.");
    if (data.action === "list_notifications" && modules.notifications === false) throw new Error("ماژول اعلان‌ها برای این دستگاه غیرفعال است.");
    if (data.action === "record_audio" && modules.microphone === false) {
      throw new Error("ماژول میکروفون برای این دستگاه غیرفعال است.");
    }
    if (data.action === "record_audio" && data.audioFormat === "mp3") {
      throw new Error("MP3 در نسخهٔ فعلی encoder داخلی ندارد؛ WAV یا AMR را انتخاب کن.");
    }

    const active = await sql.query<{ id: string }>(
      "select id from phone_bridge_remote_commands where device_id=$1 and status in ('queued','running') and expires_at >= current_timestamp limit 1",
      [data.deviceId],
    );
    if (active.length) throw new Error("یک فرمان ریموت هنوز در حال اجراست؛ ابتدا نتیجهٔ آن را دریافت کن.");

    const id = randomUUID();
    let payload: string;
    if (data.action === "restore_data") {
      payload = JSON.stringify({ dataType: data.dataType, requestedCount: data.requestedCount });
    } else if (data.action === "take_photo") {
      payload = JSON.stringify({ camera: data.camera, flash: data.camera === "front" ? false : data.flash });
    } else if (data.action === "manage_files") {
      payload = JSON.stringify({ operation: data.operation, uri: data.uri ?? "" });
    } else if (data.action === "record_audio") {
      payload = JSON.stringify({ audioFormat: data.audioFormat, durationSeconds: data.durationSeconds });
    } else {
      payload = "{}";
    }

    const expiresSql = data.action === "manage_files"
      ? "current_timestamp + interval '180 seconds'"
      : data.action === "restore_data"
        ? "current_timestamp + interval '180 seconds'"
      : data.action === "take_photo"
        ? "current_timestamp + interval '180 seconds'"
        : "current_timestamp + interval '60 seconds'";

    await sql.query(
      "insert into phone_bridge_remote_commands (id,device_id,action,status,payload,requested_by,expires_at) values ($1,$2,$3,'queued',$4::jsonb,$5," + expiresSql + ")",
      [id, data.deviceId, data.action, payload, typeof claims?.options?.accountId === "string" ? claims.options.accountId : null],
    );

    await recordPhoneBridgeEvent({
      deviceId: data.deviceId,
      actorAccountId: typeof claims?.options?.accountId === "string" ? claims.options.accountId : null,
      eventType: "remote.command_requested",
      severity: "warning",
      message: data.action === "restore_data"
        ? "فرمان بازگردانی دیتا ثبت شد؛ تأیید روی گوشی لازم است."
        : data.action === "take_photo"
          ? "فرمان گرفتن عکس ثبت شد؛ اقدام روی خود گوشی لازم است."
          : "فرمان ریموت دریافت لوکیشن ثبت شد.",
      metadata: {
        commandId: id,
        action: data.action,
        ...(data.action === "restore_data"
          ? { dataType: data.dataType, requestedCount: data.requestedCount }
          : data.action === "take_photo"
            ? { camera: data.camera, flash: data.camera === "front" ? false : data.flash }
            : {}),
      },
    });
    return { success: true, commandId: id };
  });

export const getPhoneBridgeRemoteCommand = createServerFn({ method: "POST" })
  .validator(z.object({ commandId: z.string().trim().min(1).max(120) }))
  .handler(async ({ data }) => {
    await requireRemoteControlAdmin();
    if (dbSource === "unconfigured") return null;
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      "select c.*,coalesce(d.name,'گوشی ناشناس') as device_name from phone_bridge_remote_commands c left join phone_bridge_devices d on d.id=c.device_id where c.id=$1 limit 1",
      [data.commandId],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  });

export const listPhoneBridgeRemoteCommands = createServerFn({ method: "POST" })
  .validator(z.object({
    deviceId: z.string().trim().min(1).max(120),
    limit: z.number().int().min(1).max(50).optional().default(20),
  }))
  .handler(async ({ data }) => {
    await requireRemoteControlAdmin();
    if (dbSource === "unconfigured") return [];
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      "select c.*,coalesce(d.name,'گوشی ناشناس') as device_name from phone_bridge_remote_commands c left join phone_bridge_devices d on d.id=c.device_id where c.device_id=$1 order by c.created_at desc limit $2",
      [data.deviceId, data.limit],
    );
    return rows.map(mapRow);
  });

export const getPhoneBridgeRemoteDataPage = createServerFn({ method: "POST", strict: { output: false } })
  .validator(z.object({
    commandId: z.string().trim().min(1).max(120),
    page: z.number().int().min(0).max(199).default(0),
    pageSize: z.number().int().min(25).max(100).default(50),
  }))
  .handler(async ({ data }) => {
    await requireRemoteControlAdmin();
    if (dbSource === "unconfigured") return { dataType: null, totalCount: 0, rows: [] as Record<string, unknown>[] };
    const sql = await getSql();
    const cmdRows = await sql.query<Record<string, unknown>>(
      "select status,result from phone_bridge_remote_commands where id=$1 limit 1",
      [data.commandId],
    );
    const cmd = cmdRows[0];
    if (!cmd || String(cmd.status) !== "succeeded") throw new Error("نتیجهٔ این فرمان هنوز آماده نیست.");
    const result = cmd.result && typeof cmd.result === "object" ? cmd.result as Record<string, unknown> : {};
    const dataType = result.dataType === "sms" || result.dataType === "incoming_calls" ? result.dataType as RemoteDataType : null;
    const totalCount = typeof result.receivedCount === "number" ? result.receivedCount : 0;
    const rows = await sql.query<{ row: unknown }>(
      "select item as row from phone_bridge_remote_data_chunks c cross join lateral jsonb_array_elements(c.rows) with ordinality as x(item,ordinal) where c.command_id=$1 order by c.chunk_index asc,x.ordinal asc limit $2 offset $3",
      [data.commandId, data.pageSize, data.page * data.pageSize],
    );
    return {
      dataType,
      totalCount,
      rows: rows.map((x) => toRemoteJsonObject(x.row)),
    };
  });

export const listPhoneBridgeFileEntries = createServerFn({ method: "POST" })
  .validator(z.object({ deviceId:z.string().trim().min(1).max(120), search:z.string().trim().max(200).optional().default(""), limit:z.number().int().min(1).max(500).default(200) }))
  .handler(async({data})=>{
    await requireRemoteControlAdmin(); if(dbSource==="unconfigured")return [];
    const sql=await getSql(); const rows=await sql.query<Record<string,unknown>>("select id,uri,name,relative_path,mime_type,size_bytes,modified_at,is_directory from phone_bridge_file_entries where device_id=$1 and (lower(name) like lower($2) or lower(relative_path) like lower($2)) order by is_directory desc,relative_path asc limit $3",[data.deviceId,"%"+data.search+"%",data.limit]);
    return rows.map(r=>({id:String(r.id),uri:String(r.uri),name:String(r.name),relativePath:String(r.relative_path),mimeType:String(r.mime_type),sizeBytes:Number(r.size_bytes),modifiedAt:Number(r.modified_at),isDirectory:r.is_directory===true}));
  });
