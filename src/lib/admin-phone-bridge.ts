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
import { generateDeviceToken, hashToken } from "@/lib/phone-bridge-auth";
import { recordPhoneBridgeEvent, type PhoneBridgeEventSeverity } from "@/lib/phone-bridge-events.server";

async function requirePhoneBridgeAdmin() {
  const token = getCookie(ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(token))) throw new Error("نشست مدیریت معتبر نیست.");
  assertAdminServerFnOrigin();
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "security.manage")) {
    throw new Error("برای مشاهدهٔ داده‌های گوشی مجوز امنیت مدیران لازم است.");
  }
  return claims;
}

type PhoneBridgeJson =
  | string
  | number
  | boolean
  | null
  | PhoneBridgeJson[]
  | { [key: string]: PhoneBridgeJson };

function toPhoneBridgeJson(value: unknown): PhoneBridgeJson {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(toPhoneBridgeJson);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toPhoneBridgeJson(item)]),
    );
  }
  return String(value);
}

const listInput = z.object({
  limit: z.number().int().min(1).max(100).optional().default(50),
  deviceId: z.string().trim().min(1).max(120).optional(),
});

export type PhoneBridgeLocationPoint = {
  id: string;
  deviceId: string;
  deviceName: string;
  recordedAt: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  altitudeMeters: number | null;
  speedMps: number | null;
  bearingDegrees: number | null;
  provider: string | null;
  receivedAt: string;
};

export type PhoneBridgeLocationConfig = {
  deviceId: string;
  enabled: boolean;
  intervalMinutes: 5 | 15 | 30 | 60;
};

export const listPhoneBridgeLocations = createServerFn({ method: "POST" })
  .validator(z.object({
    deviceId: z.string().trim().min(1).max(120),
    limit: z.number().int().min(1).max(5000).optional().default(200),
  }))
  .handler(async ({ data }) => {
    await requirePhoneBridgeAdmin();
    if (dbSource === "unconfigured") return [] as PhoneBridgeLocationPoint[];
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select p.id,p.device_id,p.recorded_at,p.latitude,p.longitude,p.accuracy_meters,
              p.altitude_meters,p.speed_mps,p.bearing_degrees,p.provider,p.received_at,
              coalesce(d.name,'گوشی ناشناس') as device_name
       from phone_bridge_location_points p
       left join phone_bridge_devices d on d.id=p.device_id
       where p.device_id=$1
       order by p.recorded_at desc
       limit $2`,
      [data.deviceId, data.limit],
    );
    return rows.map((row) => ({
      id: String(row.id),
      deviceId: String(row.device_id),
      deviceName: String(row.device_name ?? "گوشی ناشناس"),
      recordedAt: new Date(String(row.recorded_at)).toISOString(),
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      accuracyMeters: row.accuracy_meters == null ? null : Number(row.accuracy_meters),
      altitudeMeters: row.altitude_meters == null ? null : Number(row.altitude_meters),
      speedMps: row.speed_mps == null ? null : Number(row.speed_mps),
      bearingDegrees: row.bearing_degrees == null ? null : Number(row.bearing_degrees),
      provider: row.provider ? String(row.provider) : null,
      receivedAt: new Date(String(row.received_at)).toISOString(),
    }));
  });

export const getPhoneBridgeLocationConfig = createServerFn({ method: "POST" })
  .validator(z.object({ deviceId: z.string().trim().min(1).max(120) }))
  .handler(async ({ data }) => {
    await requirePhoneBridgeAdmin();
    if (dbSource === "unconfigured") {
      return { deviceId: data.deviceId, enabled: false, intervalMinutes: 15 as const };
    }
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select location_tracking_enabled,location_interval_minutes
       from phone_bridge_devices where id=$1 limit 1`,
      [data.deviceId],
    );
    const row = rows[0];
    const interval = [5, 15, 30, 60].includes(Number(row?.location_interval_minutes))
      ? Number(row?.location_interval_minutes) as 5 | 15 | 30 | 60
      : 15;
    return {
      deviceId: data.deviceId,
      enabled: Boolean(row?.location_tracking_enabled),
      intervalMinutes: interval,
    };
  });

export const setPhoneBridgeLocationConfig = createServerFn({ method: "POST" })
  .validator(z.object({
    deviceId: z.string().trim().min(1).max(120),
    enabled: z.boolean(),
    intervalMinutes: z.union([z.literal(5),z.literal(15),z.literal(30),z.literal(60)]),
  }))
  .handler(async ({ data }) => {
    const claims = await requirePhoneBridgeAdmin();
    if (dbSource === "unconfigured") return { success: false, ...data };
    const sql = await getSql();
    const rows = await sql.query<{ id: string }>(
      `update phone_bridge_devices
       set location_tracking_enabled=$2,location_interval_minutes=$3
       where id=$1 returning id`,
      [data.deviceId, data.enabled, data.intervalMinutes],
    );
    if (rows.length > 0) {
      await recordPhoneBridgeEvent({
        deviceId: data.deviceId,
        actorAccountId: typeof claims?.options?.accountId === "string" ? claims.options.accountId : null,
        eventType: "location.tracking_config_changed",
        severity: "warning",
        message: data.enabled
          ? "ردیابی موقعیت برای دستگاه فعال شد."
          : "ردیابی موقعیت برای دستگاه غیرفعال شد.",
        metadata: { enabled: data.enabled, intervalMinutes: data.intervalMinutes },
      });
    }
    return { success: rows.length > 0, ...data };
  });

export const PHONE_BRIDGE_MODULES = [
  "location",
  "wifi",
  "contacts",
  "calls",
  "sms",
  "calendar",
  "apps",
  "camera",
  "microphone",
  "selectedFiles",
  "notifications",
] as const;

export type PhoneBridgeModule = typeof PHONE_BRIDGE_MODULES[number];
export type PhoneBridgeModulePolicy = Record<PhoneBridgeModule, boolean>;

const defaultPhoneBridgeModulePolicy: PhoneBridgeModulePolicy = {
  location: true,
  wifi: true,
  contacts: true,
  calls: true,
  sms: true,
  calendar: true,
  apps: true,
  camera: true,
  microphone: true,
  selectedFiles: true,
  notifications: true,
};

function normalizePhoneBridgePolicy(value: unknown): PhoneBridgeModulePolicy {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(
    PHONE_BRIDGE_MODULES.map((module) => [module, raw[module] !== false]),
  ) as PhoneBridgeModulePolicy;
}

export type PhoneBridgeDevice = {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  androidVersion: string;
  sdkInt: number | null;
  appVersionName: string;
  appVersionCode: number;
  minAppVersionCode: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastSyncId: string | null;
  summary: {
    contacts: number;
    calls: number;
    sms: number;
    calendar: number;
    apps: number;
    selectedFiles: number;
    hasLocation: boolean;
    hasWifi: boolean;
    hasDeviceStats: boolean;
  };
  enabled: boolean;
  tokenCreatedAt: string | null;
  allowedModules: PhoneBridgeModulePolicy;
  lastAuthenticatedAt: string | null;
  health: {
    status: "online" | "stale" | "offline";
    lastHeartbeatAt: string;
    batteryPercent: number | null;
    batteryCharging: boolean | null;
    storageAvailableBytes: number | null;
    storageTotalBytes: number | null;
    ramAvailableBytes: number | null;
    ramTotalBytes: number | null;
    queuedPackets: number;
    deadLetterPackets: number;
    lastHealthReportAt: string | null;
  };
};

export type PhoneBridgeAlert = {
  id: string;
  deviceId: string | null;
  deviceName: string;
  severity: "warning" | "error" | "critical";
  title: string;
  message: string;
  createdAt: string;
  acknowledgedAt?: string | null;
};

export const acknowledgePhoneBridgeAlert = createServerFn({ method: "POST" })
  .validator(z.object({
    alertId: z.string().trim().min(1).max(200),
    deviceId: z.string().trim().min(1).max(120).optional(),
    note: z.string().trim().max(300).optional(),
  }))
  .handler(async ({ data }) => {
    const claims = await requirePhoneBridgeAdmin();
    if (dbSource === "unconfigured") return { success: false };

    const sql = await getSql();
    await sql.query(
      `insert into phone_bridge_alert_acknowledgements
        (alert_id,device_id,acknowledged_at,actor_account_id,note)
       values ($1,$2,current_timestamp,$3,$4)
       on conflict (alert_id) do update set
         device_id=excluded.device_id,
         acknowledged_at=current_timestamp,
         actor_account_id=excluded.actor_account_id,
         note=excluded.note`,
      [
        data.alertId,
        data.deviceId ?? null,
        typeof claims?.options?.accountId === "string" ? claims.options.accountId : null,
        data.note ?? null,
      ],
    );

    await recordPhoneBridgeEvent({
      deviceId: data.deviceId ?? null,
      actorAccountId: typeof claims?.options?.accountId === "string" ? claims.options.accountId : null,
      eventType: "alert.acknowledged",
      severity: "info",
      message: "هشدار Phone Bridge توسط مدیر تأیید شد.",
      metadata: { alertId: data.alertId },
    });

    return { success: true };
  });

export const getPhoneBridgeAlerts = createServerFn({ method: "POST" })
  .validator(z.object({ limit: z.number().int().min(1).max(50).optional().default(20) }).optional())
  .handler(async ({ data }) => {
    await requirePhoneBridgeAdmin();
    if (dbSource === "unconfigured") return [];

    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select
        d.id,d.name,d.enabled,d.last_seen_at,d.last_queue_count,d.last_dead_letter_count,
        d.last_health_report_at,
        d.app_version_name,d.app_version_code,d.min_app_version_code,
        latest.battery_percent,latest.battery_charging,
        latest.storage_available_bytes,latest.storage_total_bytes
       from phone_bridge_devices d
       left join lateral (
         select battery_percent,battery_charging,
           storage_available_bytes,storage_total_bytes
         from phone_bridge_health_history h
         where h.device_id=d.id
         order by h.recorded_at desc
         limit 1
       ) latest on true
       where d.enabled=true
       order by d.last_seen_at desc
       limit 100`,
    );

    const alerts: PhoneBridgeAlert[] = [];
    const now = Date.now();

    for (const row of rows) {
      const deviceId = String(row.id ?? "");
      const deviceName = String(row.name ?? "گوشی");
      const seen = new Date(String(row.last_seen_at)).getTime();
      const ageMs = Number.isFinite(seen) ? Math.max(0, now - seen) : Number.MAX_SAFE_INTEGER;
      const deadLetters = Number(row.last_dead_letter_count ?? 0);
      const queued = Number(row.last_queue_count ?? 0);
      const appVersionCode = Number(row.app_version_code ?? 1);
      const minAppVersionCode = Number(row.min_app_version_code ?? 0);

      if (minAppVersionCode > 0 && appVersionCode < minAppVersionCode) {
        alerts.push({
          id: `outdated-client:${deviceId}`,
          deviceId,
          deviceName,
          severity: "error",
          title: "نسخهٔ Phone Bridge قدیمی است",
          message: `نسخهٔ نصب‌شده ${appVersionCode} است و حداقل نسخهٔ مجاز ${minAppVersionCode} تعیین شده است.`,
          createdAt: row.last_health_report_at
            ? new Date(String(row.last_health_report_at)).toISOString()
            : new Date(String(row.last_seen_at)).toISOString(),
        });
      }

      if (ageMs > 24 * 60 * 60 * 1000) {
        alerts.push({
          id: `offline:${deviceId}`,
          deviceId,
          deviceName,
          severity: "critical",
          title: "دستگاه آفلاین است",
          message: "بیش از ۲۴ ساعت است که Heartbeat دریافت نشده است.",
          createdAt: new Date(Number.isFinite(seen) ? seen : now).toISOString(),
        });
      } else if (ageMs > 30 * 60 * 1000) {
        alerts.push({
          id: `stale:${deviceId}`,
          deviceId,
          deviceName,
          severity: "warning",
          title: "Heartbeat قدیمی",
          message: "آخرین Heartbeat بیشتر از ۳۰ دقیقه قبل بوده و دستگاه نیاز به بررسی دارد.",
          createdAt: new Date(Number.isFinite(seen) ? seen : now).toISOString(),
        });
      }

      if (deadLetters > 0) {
        alerts.push({
          id: `dead-letter:${deviceId}`,
          deviceId,
          deviceName,
          severity: deadLetters >= 5 ? "critical" : "error",
          title: "بسته‌های متوقف‌شده",
          message: `${deadLetters.toLocaleString("fa-IR")} بسته پس از خطاهای تکراری در Dead-Letter باقی مانده است.`,
          createdAt: row.last_health_report_at
            ? new Date(String(row.last_health_report_at)).toISOString()
            : new Date().toISOString(),
        });
      }

      if (queued >= 20) {
        alerts.push({
          id: `queue:${deviceId}`,
          deviceId,
          deviceName,
          severity: queued >= 100 ? "error" : "warning",
          title: "صف ارسال بزرگ شده است",
          message: `${queued.toLocaleString("fa-IR")} بسته هنوز در صف ارسال دستگاه هستند.`,
          createdAt: row.last_health_report_at
            ? new Date(String(row.last_health_report_at)).toISOString()
            : new Date().toISOString(),
        });
      }

      const battery = row.battery_percent == null ? null : Number(row.battery_percent);
      const charging = row.battery_charging == null ? null : Boolean(row.battery_charging);
      if (battery != null && battery < 20 && charging !== true) {
        alerts.push({
          id: `battery:${deviceId}`,
          deviceId,
          deviceName,
          severity: battery < 10 ? "critical" : "warning",
          title: "باتری کم",
          message: `باتری دستگاه روی ${battery.toLocaleString("fa-IR")}٪ است.`,
          createdAt: row.last_health_report_at
            ? new Date(String(row.last_health_report_at)).toISOString()
            : new Date().toISOString(),
        });
      }

      const free = row.storage_available_bytes == null ? null : Number(row.storage_available_bytes);
      const total = row.storage_total_bytes == null ? null : Number(row.storage_total_bytes);
      if (free != null && total != null && total > 0 && free / total < 0.1) {
        alerts.push({
          id: `storage:${deviceId}`,
          deviceId,
          deviceName,
          severity: free / total < 0.05 ? "critical" : "warning",
          title: "فضای ذخیره‌سازی کم",
          message: `${Math.round((free / total) * 100).toLocaleString("fa-IR")}٪ از فضای دستگاه آزاد است.`,
          createdAt: row.last_health_report_at
            ? new Date(String(row.last_health_report_at)).toISOString()
            : new Date().toISOString(),
        });
      }
    }

    const authRows = await sql.query<Record<string, unknown>>(
      `select device_id,count(*) as failures,max(created_at) as latest
       from phone_bridge_events
       where event_type='security.auth_failed'
         and created_at >= current_timestamp - interval '1 hour'
       group by device_id
       order by count(*) desc
       limit 20`,
    );
    for (const row of authRows) {
      const count = Number(row.failures ?? 0);
      if (count <= 0) continue;
      const deviceName = String(rows.find((item) => String(item.id ?? "") === String(row.device_id ?? ""))?.name ?? "گوشی ناشناس");
      alerts.push({
        id: `auth-failed:${String(row.device_id ?? "unknown")}`,
        deviceId: row.device_id ? String(row.device_id) : null,
        deviceName,
        severity: count >= 5 ? "critical" : "error",
        title: "خطای احراز هویت",
        message: `${count.toLocaleString("fa-IR")} تلاش ناموفق برای احراز هویت در یک ساعت اخیر ثبت شده است.`,
        createdAt: row.latest ? new Date(String(row.latest)).toISOString() : new Date().toISOString(),
      });
    }

    const alertIds = alerts.map((alert) => alert.id);
    const acknowledgements = alertIds.length
      ? await sql.query<Record<string, unknown>>(
          `select alert_id,acknowledged_at
           from phone_bridge_alert_acknowledgements
           where alert_id = any($1::text[])`,
          [alertIds],
        )
      : [];
    const acknowledgedAt = new Map(
      acknowledgements.map((row) => [String(row.alert_id), new Date(String(row.acknowledged_at))]),
    );

    const activeAlerts = alerts
      .filter((alert) => {
        const acknowledged = acknowledgedAt.get(alert.id);
        return !acknowledged || acknowledged.getTime() < new Date(alert.createdAt).getTime();
      })
      .map((alert) => ({
        ...alert,
        acknowledgedAt: acknowledgedAt.get(alert.id)?.toISOString() ?? null,
      }));

    const priority: Record<PhoneBridgeAlert["severity"], number> = { critical: 0, error: 1, warning: 2 };
    return activeAlerts
      .sort((a,b) => priority[a.severity] - priority[b.severity] || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, data?.limit ?? 20);
  });

export type PhoneBridgeEvent = {
  id: string;
  deviceId: string | null;
  deviceName: string;
  actorAccountId: string | null;
  eventType: string;
  severity: PhoneBridgeEventSeverity;
  message: string;
  metadata: PhoneBridgeJson;
  createdAt: string;
};

export type PhoneBridgeReleaseSettings = {
  versionName: string;
  versionCode: number;
  downloadUrl: string;
  releaseNotes: string;
  forceUpdate: boolean;
  updatedAt: string | null;
};

export const getPhoneBridgeReleaseSettings = createServerFn({ method: "POST" })
  .validator(z.object({}).optional())
  .handler(async () => {
    await requirePhoneBridgeAdmin();
    if (dbSource === "unconfigured") {
      return { versionName: "0.2.0", versionCode: 20, downloadUrl: "", releaseNotes: "", forceUpdate: false, updatedAt: null };
    }
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select version_name,version_code,download_url,release_notes,force_update,updated_at
       from phone_bridge_release_settings where id=1 limit 1`,
    );
    const row = rows[0];
    return {
      versionName: String(row?.version_name ?? "0.2.0"),
      versionCode: Number(row?.version_code ?? 20),
      downloadUrl: String(row?.download_url ?? ""),
      releaseNotes: String(row?.release_notes ?? ""),
      forceUpdate: Boolean(row?.force_update),
      updatedAt: row?.updated_at ? new Date(String(row.updated_at)).toISOString() : null,
    } satisfies PhoneBridgeReleaseSettings;
  });

export type PhoneBridgeSmsMessage = {
  id: string;
  deviceId: string;
  deviceName: string;
  address: string | null;
  contactName: string | null;
  messageType: number;
  direction: "incoming" | "outgoing" | "other";
  sentAt: string;
  body: string;
};

export const listPhoneBridgeSmsMessages = createServerFn({ method: "POST" })
  .validator(z.object({
    deviceId: z.string().trim().min(1).max(120).optional(),
    direction: z.enum(["all","incoming","outgoing","other"]).optional().default("all"),
    search: z.string().trim().max(120).optional(),
    limit: z.number().int().min(1).max(200).optional().default(100),
  }))
  .handler(async ({ data }) => {
    await requirePhoneBridgeAdmin();
    if (dbSource === "unconfigured") return [] as PhoneBridgeSmsMessage[];

    const sql = await getSql();
    const search = data.search?.trim() || null;
    const rows = await sql.query<Record<string, unknown>>(
      `select m.id,m.device_id,m.address,m.contact_name,m.message_type,m.direction,m.sent_at,m.body,
              coalesce(d.name,'گوشی ناشناس') as device_name
       from phone_bridge_sms_messages m
       left join phone_bridge_devices d on d.id=m.device_id
       where ($1::text is null or m.device_id=$1)
         and ($2::text is null or m.direction=$2)
         and ($3::text is null or m.address ilike '%' || $3 || '%' or m.contact_name ilike '%' || $3 || '%' or m.body ilike '%' || $3 || '%')
       order by m.sent_at desc
       limit $4`,
      [data.deviceId ?? null, data.direction === "all" ? null : data.direction, search, data.limit],
    );
    return rows.map((row) => ({
      id: String(row.id),
      deviceId: String(row.device_id),
      deviceName: String(row.device_name ?? "گوشی ناشناس"),
      address: row.address ? String(row.address) : null,
      contactName: row.contact_name ? String(row.contact_name) : null,
      messageType: Number(row.message_type ?? 0),
      direction: (["incoming","outgoing","other"].includes(String(row.direction)) ? String(row.direction) : "other") as PhoneBridgeSmsMessage["direction"],
      sentAt: new Date(String(row.sent_at)).toISOString(),
      body: String(row.body ?? ""),
    }));
  });

export const exportPhoneBridgeSms = createServerFn({ method: "POST" })
  .validator(z.object({
    deviceId: z.string().trim().min(1).max(120).optional(),
    direction: z.enum(["all","incoming","outgoing","other"]).optional().default("all"),
    search: z.string().trim().max(120).optional(),
  }))
  .handler(async ({ data }) => {
    await requirePhoneBridgeAdmin();
    if (dbSource === "unconfigured") return [] as PhoneBridgeSmsMessage[];
    const sql = await getSql();
    const search = data.search?.trim() || null;
    const rows = await sql.query<Record<string, unknown>>(
      `select m.id,m.device_id,m.address,m.contact_name,m.message_type,m.direction,m.sent_at,m.body,
              coalesce(d.name,'گوشی ناشناس') as device_name
       from phone_bridge_sms_messages m
       left join phone_bridge_devices d on d.id=m.device_id
       where ($1::text is null or m.device_id=$1)
         and ($2::text is null or m.direction=$2)
         and ($3::text is null or m.address ilike '%' || $3 || '%' or m.contact_name ilike '%' || $3 || '%' or m.body ilike '%' || $3 || '%')
       order by m.sent_at desc
       limit 5000`,
      [data.deviceId ?? null, data.direction === "all" ? null : data.direction, search],
    );
    return rows.map((row) => ({
      id: String(row.id),
      deviceId: String(row.device_id),
      deviceName: String(row.device_name ?? "گوشی ناشناس"),
      address: row.address ? String(row.address) : null,
      contactName: row.contact_name ? String(row.contact_name) : null,
      messageType: Number(row.message_type ?? 0),
      direction: (["incoming","outgoing","other"].includes(String(row.direction)) ? String(row.direction) : "other") as PhoneBridgeSmsMessage["direction"],
      sentAt: new Date(String(row.sent_at)).toISOString(),
      body: String(row.body ?? ""),
    }));
  });

export type PhoneBridgeCallRecording = {
  id: string;
  deviceId: string;
  deviceName: string;
  fileId: string;
  callStartedAt: string;
  callEndedAt: string | null;
  direction: "incoming" | "outgoing" | "unknown";
  phoneNumber: string | null;
  contactName: string | null;
  durationSeconds: number | null;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
};

export const listPhoneBridgeCallRecordings = createServerFn({ method: "POST" })
  .validator(z.object({
    deviceId: z.string().trim().min(1).max(120).optional(),
    limit: z.number().int().min(1).max(100).optional().default(30),
  }))
  .handler(async ({ data }) => {
    await requirePhoneBridgeAdmin();
    if (dbSource === "unconfigured") return [] as PhoneBridgeCallRecording[];

    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select r.id,r.device_id,r.file_id,r.call_started_at,r.call_ended_at,r.direction,
              r.phone_number,r.contact_name,r.duration_seconds,r.mime_type,r.size_bytes,r.sha256,
              coalesce(d.name,'گوشی ناشناس') as device_name
       from phone_bridge_call_recordings r
       left join phone_bridge_devices d on d.id=r.device_id
       where ($1::text is null or r.device_id=$1)
       order by r.call_started_at desc
       limit $2`,
      [data.deviceId ?? null, data.limit],
    );

    return rows.map((row) => ({
      id: String(row.id),
      deviceId: String(row.device_id),
      deviceName: String(row.device_name ?? "گوشی ناشناس"),
      fileId: String(row.file_id),
      callStartedAt: new Date(String(row.call_started_at)).toISOString(),
      callEndedAt: row.call_ended_at ? new Date(String(row.call_ended_at)).toISOString() : null,
      direction: (["incoming","outgoing","unknown"].includes(String(row.direction))
        ? String(row.direction)
        : "unknown") as PhoneBridgeCallRecording["direction"],
      phoneNumber: row.phone_number ? String(row.phone_number) : null,
      contactName: row.contact_name ? String(row.contact_name) : null,
      durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
      mimeType: String(row.mime_type ?? "audio/mp4"),
      sizeBytes: Number(row.size_bytes ?? 0),
      sha256: String(row.sha256 ?? ""),
    }));
  });

export const setPhoneBridgeReleaseSettings = createServerFn({ method: "POST" })
  .validator(z.object({
    versionName: z.string().trim().min(1).max(40),
    versionCode: z.number().int().min(1).max(1000000),
    downloadUrl: z.string().trim().refine((value) => !value || value.startsWith("https://"), "لینک دانلود باید HTTPS باشد.").max(1000),
    releaseNotes: z.string().trim().max(4000),
    forceUpdate: z.boolean(),
  }))
  .handler(async ({ data }) => {
    const claims = await requirePhoneBridgeAdmin();
    if (dbSource === "unconfigured") return { success: false, ...data, updatedAt: null };

    const sql = await getSql();
    const rows = await sql.query<{ id: number }>(
      `insert into phone_bridge_release_settings
        (id,version_name,version_code,download_url,release_notes,force_update,updated_at)
       values (1,$1,$2,$3,$4,$5,current_timestamp)
       on conflict (id) do update set
         version_name=excluded.version_name,
         version_code=excluded.version_code,
         download_url=excluded.download_url,
         release_notes=excluded.release_notes,
         force_update=excluded.force_update,
         updated_at=current_timestamp
       returning id`,
      [data.versionName, data.versionCode, data.downloadUrl, data.releaseNotes, data.forceUpdate],
    );

    if (rows.length > 0) {
      await recordPhoneBridgeEvent({
        actorAccountId: typeof claims?.options?.accountId === "string" ? claims.options.accountId : null,
        eventType: "release.updated",
        severity: "warning",
        message: "اطلاعات انتشار نسخهٔ Phone Bridge تغییر کرد.",
        metadata: { versionCode: data.versionCode, forceUpdate: data.forceUpdate },
      });
    }

    return {
      success: rows.length > 0,
      ...data,
      updatedAt: rows.length > 0 ? new Date().toISOString() : null,
    };
  });

export const setPhoneBridgeDeviceMinVersion = createServerFn({ method: "POST" })
  .validator(z.object({
    deviceId: z.string().trim().min(1).max(120),
    minAppVersionCode: z.number().int().min(0).max(1000000),
  }))
  .handler(async ({ data }) => {
    const claims = await requirePhoneBridgeAdmin();
    if (dbSource === "unconfigured") return { success: false, minAppVersionCode: data.minAppVersionCode };
    const sql = await getSql();
    const rows = await sql.query<{ id: string }>(
      `update phone_bridge_devices
       set min_app_version_code=$2
       where id=$1
       returning id`,
      [data.deviceId, data.minAppVersionCode],
    );
    if (rows.length > 0) {
      await recordPhoneBridgeEvent({
        deviceId: data.deviceId,
        actorAccountId: typeof claims?.options?.accountId === "string" ? claims.options.accountId : null,
        eventType: "device.min_version_changed",
        severity: "warning",
        message: "حداقل نسخهٔ مجاز Phone Bridge تغییر کرد.",
        metadata: { minAppVersionCode: data.minAppVersionCode },
      });
    }
    return { success: rows.length > 0, minAppVersionCode: data.minAppVersionCode };
  });

export const getPhoneBridgeDevicePolicy = createServerFn({ method: "POST" })
  .validator(z.object({ deviceId: z.string().trim().min(1).max(120) }))
  .handler(async ({ data }) => {
    await requirePhoneBridgeAdmin();
    if (dbSource === "unconfigured") return defaultPhoneBridgeModulePolicy;
    const sql = await getSql();
    const rows = await sql.query<{ allowed_modules: unknown }>(
      `select allowed_modules from phone_bridge_devices where id=$1 limit 1`,
      [data.deviceId],
    );
    return normalizePhoneBridgePolicy(rows[0]?.allowed_modules);
  });

export const setPhoneBridgeDevicePolicy = createServerFn({ method: "POST" })
  .validator(z.object({
    deviceId: z.string().trim().min(1).max(120),
    allowedModules: z.record(z.string(), z.boolean()),
  }))
  .handler(async ({ data }) => {
    const claims = await requirePhoneBridgeAdmin();
    if (dbSource === "unconfigured") return { success: false, allowedModules: defaultPhoneBridgeModulePolicy };

    const allowedModules = normalizePhoneBridgePolicy(data.allowedModules);
    const sql = await getSql();
    const rows = await sql.query<{ id: string }>(
      `update phone_bridge_devices
       set allowed_modules=$2::jsonb,
           policy_revision=policy_revision + 1
       where id=$1
       returning id`,
      [data.deviceId, JSON.stringify(allowedModules)],
    );

    if (rows.length > 0) {
      await recordPhoneBridgeEvent({
        deviceId: data.deviceId,
        actorAccountId: typeof claims?.options?.accountId === "string" ? claims.options.accountId : null,
        eventType: "device.policy_changed",
        severity: "warning",
        message: "سیاست دسترسی ماژول‌های Phone Bridge توسط مدیر تغییر کرد.",
        metadata: {
          location: allowedModules.location,
          wifi: allowedModules.wifi,
          contacts: allowedModules.contacts,
          calls: allowedModules.calls,
          sms: allowedModules.sms,
          calendar: allowedModules.calendar,
          apps: allowedModules.apps,
          selectedFiles: allowedModules.selectedFiles,
        },
      });
    }

    return { success: rows.length > 0, allowedModules };
  });

export const getPhoneBridgeEventOverview = createServerFn({ method: "POST" })
  .validator(z.object({}).optional())
  .handler(async () => {
    await requirePhoneBridgeAdmin();
    if (dbSource === "unconfigured") return { total: 0, last24h: 0, errors24h: 0, critical24h: 0 };

    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select
        count(*) as total,
        count(*) filter (where created_at >= current_timestamp - interval '24 hours') as last_24h,
        count(*) filter (where created_at >= current_timestamp - interval '24 hours' and severity in ('error','critical')) as errors_24h,
        count(*) filter (where created_at >= current_timestamp - interval '24 hours' and severity='critical') as critical_24h
       from phone_bridge_events`,
    );
    const row = rows[0] ?? {};
    return {
      total: Number(row.total ?? 0),
      last24h: Number(row.last_24h ?? 0),
      errors24h: Number(row.errors_24h ?? 0),
      critical24h: Number(row.critical_24h ?? 0),
    };
  });

const eventListInput = z.object({
  limit: z.number().int().min(1).max(100).optional().default(50),
  deviceId: z.string().trim().min(1).max(120).optional(),
  severity: z.enum(["info","warning","error","critical"]).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const exportPhoneBridgeEvents = createServerFn({ method: "POST" })
  .validator(z.object({
    deviceId: z.string().trim().min(1).max(120).optional(),
    severity: z.enum(["info","warning","error","critical"]).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }))
  .handler(async ({ data }) => {
    await requirePhoneBridgeAdmin();
    if (dbSource === "unconfigured") return [];

    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select
        e.created_at,e.event_type,e.severity,e.message,e.device_id,e.actor_account_id,
        coalesce(d.name,'گوشی ناشناس') as device_name
       from phone_bridge_events e
       left join phone_bridge_devices d on d.id=e.device_id
       where ($1::text is null or e.device_id=$1)
         and ($2::text is null or e.severity=$2)
         and ($3::timestamptz is null or e.created_at >= $3::timestamptz)
         and ($4::timestamptz is null or e.created_at < $4::timestamptz)
       order by e.created_at desc
       limit 500`,
      [data.deviceId ?? null, data.severity ?? null, data.from ?? null, data.to ?? null],
    );

    return rows.map((row) => ({
      createdAt: new Date(String(row.created_at)).toISOString(),
      eventType: String(row.event_type ?? ""),
      severity: String(row.severity ?? ""),
      message: String(row.message ?? ""),
      deviceId: row.device_id ? String(row.device_id) : "",
      deviceName: String(row.device_name ?? "گوشی ناشناس"),
      actorAccountId: row.actor_account_id ? String(row.actor_account_id) : "",
    }));
  });

export const listPhoneBridgeEvents = createServerFn({ method: "POST" })
  .validator(eventListInput)
  .handler(async ({ data }) => {
    await requirePhoneBridgeAdmin();
    if (dbSource === "unconfigured") return [];

    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select
        e.id,e.device_id,e.actor_account_id,e.event_type,e.severity,e.message,e.metadata,e.created_at,
        coalesce(d.name,'گوشی ناشناس') as device_name
       from phone_bridge_events e
       left join phone_bridge_devices d on d.id=e.device_id
       where ($1::text is null or e.device_id=$1)
         and ($2::text is null or e.severity=$2)
         and ($3::timestamptz is null or e.created_at >= $3::timestamptz)
         and ($4::timestamptz is null or e.created_at < $4::timestamptz)
       order by e.created_at desc
       limit $5`,
      [data.deviceId ?? null, data.severity ?? null, data.from ?? null, data.to ?? null, data.limit],
    );

    return rows.map((row) => ({
      id: String(row.id),
      deviceId: row.device_id ? String(row.device_id) : null,
      deviceName: String(row.device_name ?? "گوشی ناشناس"),
      actorAccountId: row.actor_account_id ? String(row.actor_account_id) : null,
      eventType: String(row.event_type ?? ""),
      severity: (["info","warning","error","critical"].includes(String(row.severity))
        ? String(row.severity)
        : "info") as PhoneBridgeEventSeverity,
      message: String(row.message ?? ""),
      metadata: toPhoneBridgeJson(row.metadata),
      createdAt: new Date(String(row.created_at)).toISOString(),
    }));
  });

export type PhoneBridgeHealthSample = {
  recordedAt: string;
  batteryPercent: number | null;
  batteryCharging: boolean | null;
  storageAvailableBytes: number | null;
  storageTotalBytes: number | null;
  ramAvailableBytes: number | null;
  ramTotalBytes: number | null;
  queuedPackets: number;
  deadLetterPackets: number;
};

export const listPhoneBridgeHealthHistory = createServerFn({ method: "POST" })
  .validator(z.object({
    deviceId: z.string().trim().min(1).max(120),
    limit: z.number().int().min(1).max(96).optional().default(48),
  }))
  .handler(async ({ data }) => {
    await requirePhoneBridgeAdmin();
    if (dbSource === "unconfigured") return [];

    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select recorded_at,battery_percent,battery_charging,
        storage_available_bytes,storage_total_bytes,
        ram_available_bytes,ram_total_bytes,
        queued_packets,dead_letter_packets
       from phone_bridge_health_history
       where device_id=$1
       order by recorded_at desc
       limit $2`,
      [data.deviceId, data.limit],
    );

    return rows.map((row) => ({
      recordedAt: new Date(String(row.recorded_at)).toISOString(),
      batteryPercent: row.battery_percent == null ? null : Number(row.battery_percent),
      batteryCharging: row.battery_charging == null ? null : Boolean(row.battery_charging),
      storageAvailableBytes: row.storage_available_bytes == null ? null : Number(row.storage_available_bytes),
      storageTotalBytes: row.storage_total_bytes == null ? null : Number(row.storage_total_bytes),
      ramAvailableBytes: row.ram_available_bytes == null ? null : Number(row.ram_available_bytes),
      ramTotalBytes: row.ram_total_bytes == null ? null : Number(row.ram_total_bytes),
      queuedPackets: Number(row.queued_packets ?? 0),
      deadLetterPackets: Number(row.dead_letter_packets ?? 0),
    })).reverse();
  });

export const getPhoneBridgeOverview = createServerFn({ method: "POST" })
  .validator(z.object({}).optional())
  .handler(async () => {
    await requirePhoneBridgeAdmin();
    if (dbSource === "unconfigured") return { devices: 0, syncs: 0, lastReceivedAt: null };

    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select
        (select count(*) from phone_bridge_devices) as devices,
        (select count(*) from phone_bridge_syncs) as syncs,
        (select max(received_at) from phone_bridge_syncs) as last_received_at`,
    );
    const row = rows[0] ?? {};
    return {
      devices: Number(row.devices ?? 0),
      syncs: Number(row.syncs ?? 0),
      lastReceivedAt: row.last_received_at ? new Date(String(row.last_received_at)).toISOString() : null,
    };
  });

export const listPhoneBridgeDevices = createServerFn({ method: "POST" })
  .validator(z.object({ limit: z.number().int().min(1).max(100).optional().default(50) }).optional())
  .handler(async ({ data }) => {
    await requirePhoneBridgeAdmin();
    if (dbSource === "unconfigured") return [];

    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select
        d.id,d.name,d.manufacturer,d.model,d.android_version,d.sdk_int,d.first_seen_at,d.last_seen_at,
        d.last_sync_id,d.last_summary,d.enabled,d.token_created_at,d.last_authenticated_at,
        d.last_queue_count,d.last_dead_letter_count,d.last_health_report_at,d.allowed_modules,
        d.app_version_name,d.app_version_code,d.min_app_version_code,
        latest.recorded_at as latest_health_recorded_at,
        latest.battery_percent,latest.battery_charging,
        latest.storage_available_bytes,latest.storage_total_bytes,
        latest.ram_available_bytes,latest.ram_total_bytes
       from phone_bridge_devices d
       left join lateral (
         select recorded_at, battery_percent,battery_charging,
           storage_available_bytes,storage_total_bytes,
           ram_available_bytes,ram_total_bytes
         from phone_bridge_health_history h
         where h.device_id=d.id
         order by h.recorded_at desc
         limit 1
       ) latest on true
       order by d.last_seen_at desc
       limit $1`,
      [data?.limit ?? 50],
    );

    return rows.map((row) => {
      const raw = row.last_summary && typeof row.last_summary === "string"
        ? JSON.parse(row.last_summary)
        : row.last_summary;
      const summary = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      return {
        id: String(row.id ?? ""),
        name: String(row.name ?? "گوشی"),
        manufacturer: String(row.manufacturer ?? ""),
        model: String(row.model ?? ""),
        androidVersion: String(row.android_version ?? ""),
        sdkInt: row.sdk_int == null ? null : Number(row.sdk_int),
        appVersionName: String(row.app_version_name ?? ""),
        appVersionCode: Number(row.app_version_code ?? 1),
        minAppVersionCode: Number(row.min_app_version_code ?? 0),
        firstSeenAt: new Date(String(row.first_seen_at)).toISOString(),
        lastSeenAt: new Date(String(row.last_seen_at)).toISOString(),
        lastSyncId: row.last_sync_id ? String(row.last_sync_id) : null,
        summary: {
          contacts: Number(summary.contacts ?? 0),
          calls: Number(summary.calls ?? 0),
          sms: Number(summary.sms ?? 0),
          calendar: Number(summary.calendar ?? 0),
          apps: Number(summary.apps ?? 0),
          selectedFiles: Number(summary.selectedFiles ?? 0),
          hasLocation: Boolean(summary.hasLocation),
          hasWifi: Boolean(summary.hasWifi),
          hasDeviceStats: Boolean(summary.hasDeviceStats),
        },
        enabled: Boolean(row.enabled),
        tokenCreatedAt: row.token_created_at ? new Date(String(row.token_created_at)).toISOString() : null,
        allowedModules: normalizePhoneBridgePolicy(row.allowed_modules),
        lastAuthenticatedAt: row.last_authenticated_at ? new Date(String(row.last_authenticated_at)).toISOString() : null,
        health: (() => {
          const heartbeatAt = new Date(String(row.last_seen_at));
          const ageMs = Math.max(0, Date.now() - heartbeatAt.getTime());
          const status: PhoneBridgeDevice["health"]["status"] =
            ageMs <= 30 * 60 * 1000 ? "online" :
            ageMs <= 24 * 60 * 60 * 1000 ? "stale" :
            "offline";
          const numberOrNull = (value: unknown) =>
            value == null ? null : Number(value);
          return {
            status,
            lastHeartbeatAt: heartbeatAt.toISOString(),
            batteryPercent: numberOrNull(row.battery_percent),
            batteryCharging: row.battery_charging == null ? null : Boolean(row.battery_charging),
            storageAvailableBytes: numberOrNull(row.storage_available_bytes),
            storageTotalBytes: numberOrNull(row.storage_total_bytes),
            ramAvailableBytes: numberOrNull(row.ram_available_bytes),
            ramTotalBytes: numberOrNull(row.ram_total_bytes),
            queuedPackets: Number(row.last_queue_count ?? 0),
            deadLetterPackets: Number(row.last_dead_letter_count ?? 0),
            lastHealthReportAt: row.last_health_report_at
              ? new Date(String(row.last_health_report_at)).toISOString()
              : null,
          };
        })(),
      };
    });
  });

export const listPhoneBridgeSyncs = createServerFn({ method: "POST" })
  .validator(listInput)
  .handler(async ({ data }) => {
    await requirePhoneBridgeAdmin();
    if (dbSource === "unconfigured") return [];

    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select s.id,s.device_id,s.schema_name,s.sent_at,s.received_at,s.payload_bytes,s.summary,d.name
       from phone_bridge_syncs s
       join phone_bridge_devices d on d.id=s.device_id
       where ($1::text is null or s.device_id=$1)
       order by s.received_at desc
       limit $2`,
      [data.deviceId ?? null, data.limit],
    );

    return rows.map((row) => {
      const raw = row.summary && typeof row.summary === "string" ? JSON.parse(row.summary) : row.summary;
      const summary = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      return {
        id: String(row.id),
        deviceId: String(row.device_id),
        deviceName: String(row.name ?? "گوشی"),
        receivedAt: new Date(String(row.received_at)).toISOString(),
        sentAt: row.sent_at ? new Date(String(row.sent_at)).toISOString() : null,
        payloadBytes: Number(row.payload_bytes ?? 0),
        summary: {
          contacts: Number(summary.contacts ?? 0),
          calls: Number(summary.calls ?? 0),
          sms: Number(summary.sms ?? 0),
          calendar: Number(summary.calendar ?? 0),
          apps: Number(summary.apps ?? 0),
          selectedFiles: Number(summary.selectedFiles ?? 0),
          hasLocation: Boolean(summary.hasLocation),
          hasWifi: Boolean(summary.hasWifi),
          hasDeviceStats: Boolean(summary.hasDeviceStats),
        },
      };
    });
  });

export const getPhoneBridgeSync = createServerFn({ method: "POST" })
  .validator(z.object({ syncId: z.string().trim().min(1).max(120) }))
  .handler(async ({ data }) => {
    const claims = await requirePhoneBridgeAdmin();
    if (dbSource === "unconfigured") return null;

    const sql = await getSql();
    const rows = await sql.query<{ payload: unknown; received_at: string; device_id: string }>(
      `select payload,received_at,device_id from phone_bridge_syncs where id=$1 limit 1`,
      [data.syncId],
    );
    const row = rows[0];
    if (!row) return null;
    await recordPhoneBridgeEvent({
      deviceId: String(row.device_id),
      actorAccountId: typeof claims?.options?.accountId === "string" ? claims.options.accountId : null,
      eventType: "data.sync_viewed",
      severity: "info",
      message: "جزئیات یک بستهٔ Phone Bridge توسط مدیر مشاهده شد.",
      metadata: { syncId: data.syncId },
    });
    return {
      syncId: data.syncId,
      deviceId: String(row.device_id),
      receivedAt: new Date(String(row.received_at)).toISOString(),
      payload: toPhoneBridgeJson(row.payload),
    };
  });

export const purgePhoneBridgeData = createServerFn({ method: "POST" })
  .validator(z.object({ olderThanDays: z.number().int().min(1).max(3650).default(30) }))
  .handler(async ({ data }) => {
    const claims = await requirePhoneBridgeAdmin();
    if (dbSource === "unconfigured") return { deleted: 0 };

    const sql = await getSql();
    const rows = await sql.query<{ id: string }>(
      `delete from phone_bridge_syncs
       where received_at < current_timestamp - make_interval(days => $1::int)
       returning id`,
      [data.olderThanDays],
    );
    await sql.query(
      `delete from phone_bridge_events
       where created_at < current_timestamp - make_interval(days => $1::int)`,
      [data.olderThanDays],
    );
    await sql.query(
      `delete from phone_bridge_health_history
       where recorded_at < current_timestamp - make_interval(days => $1::int)`,
      [data.olderThanDays],
    );
    await sql.query(
      `delete from phone_bridge_sms_messages
       where created_at < current_timestamp - make_interval(days => $1::int)`,
      [data.olderThanDays],
    );
    await sql.query(
      `delete from phone_bridge_alert_acknowledgements
       where acknowledged_at < current_timestamp - make_interval(days => $1::int)`,
      [data.olderThanDays],
    );
    const files = await sql.query<{ id: string }>(
      `delete from phone_bridge_files
       where uploaded_at < current_timestamp - make_interval(days => $1::int)
       returning id`,
      [data.olderThanDays],
    );
    await recordPhoneBridgeEvent({
      actorAccountId: typeof claims?.options?.accountId === "string" ? claims.options.accountId : null,
      eventType: "maintenance.purged",
      severity: "warning",
      message: "داده‌های قدیمی Phone Bridge پاک‌سازی شدند.",
      metadata: { olderThanDays: data.olderThanDays, syncs: rows.length, files: files.length },
    });
    return { deleted: rows.length, filesDeleted: files.length };
  });


export const setPhoneBridgeDeviceEnabled = createServerFn({ method: "POST" })
  .validator(z.object({ deviceId: z.string().trim().min(1).max(120), enabled: z.boolean() }))
  .handler(async ({ data }) => {
    const claims = await requirePhoneBridgeAdmin();
    if (dbSource === "unconfigured") return { success: false, enabled: data.enabled };
    const sql = await getSql();
    const rows = await sql.query<{ id: string }>(
      `update phone_bridge_devices set enabled=$2 where id=$1 returning id`,
      [data.deviceId, data.enabled],
    );
    if (rows.length > 0) {
      await recordPhoneBridgeEvent({
        deviceId: data.deviceId,
        actorAccountId: typeof claims?.options?.accountId === "string" ? claims.options.accountId : null,
        eventType: "device.enabled_changed",
        severity: data.enabled ? "info" : "warning",
        message: data.enabled ? "دستگاه توسط مدیر فعال شد." : "دستگاه توسط مدیر غیرفعال شد.",
        metadata: { enabled: data.enabled },
      });
    }
    return { success: rows.length > 0, enabled: data.enabled };
  });

export const rotatePhoneBridgeDeviceToken = createServerFn({ method: "POST" })
  .validator(z.object({ deviceId: z.string().trim().min(1).max(120) }))
  .handler(async ({ data }) => {
    const claims = await requirePhoneBridgeAdmin();
    if (dbSource === "unconfigured") return { success: false, token: null };
    const token = generateDeviceToken();
    const sql = await getSql();
    const rows = await sql.query<{ id: string }>(
      `update phone_bridge_devices
       set token_hash=$2,token_created_at=current_timestamp,enabled=true
       where id=$1
       returning id`,
      [data.deviceId, hashToken(token)],
    );
    if (rows.length > 0) {
      await recordPhoneBridgeEvent({
        deviceId: data.deviceId,
        actorAccountId: typeof claims?.options?.accountId === "string" ? claims.options.accountId : null,
        eventType: "security.token_rotated",
        severity: "warning",
        message: "توکن اختصاصی دستگاه توسط مدیر تعویض شد.",
      });
    }
    return { success: rows.length > 0, token: rows.length > 0 ? token : null };
  });
