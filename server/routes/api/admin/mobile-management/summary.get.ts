import { createError, defineEventHandler, getCookie, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import {
  ADMIN_SESSION_COOKIE,
  getAdminSessionClaims,
  verifyAdminSessionToken,
} from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import {
  getMobilePresence,
  managementModeLabel,
  mobilePresenceLabel,
  parseManagementMode,
  permissionHealthFromPayload,
  type MobileManagementMode,
} from "@/lib/mobile-management";

async function requireSecurityAdmin(event: H3Event) {
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(token))) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  }
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "security.manage")) {
    throw createError({
      statusCode: 403,
      statusMessage: "دسترسی مدیریت تلفن همراه برای این حساب فعال نیست.",
    });
  }
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function iso(value: unknown): string | null {
  if (value == null || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type Severity = "critical" | "warning" | "info";

type Alert = {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  deviceId: string;
  staffId: string;
};

function buildAlerts(
  row: Record<string, unknown>,
  mode: MobileManagementMode,
  permissionPayload: unknown,
  now: number,
): Alert[] {
  const alerts: Alert[] = [];
  const deviceId = String(row.device_id);
  const staffId = String(row.staff_id);
  const status = String(row.status);
  const lastSeenAt = iso(row.last_seen_at);
  const presence = getMobilePresence(lastSeenAt, now);

  if (status === "revoked") {
    alerts.push({
      id: deviceId + "-revoked",
      severity: "critical",
      title: "دسترسی دستگاه لغو شده",
      description: "این دستگاه دیگر در وضعیت فعال نیست و باید وضعیت آن بررسی شود.",
      deviceId,
      staffId,
    });
  } else if (status === "pending") {
    alerts.push({
      id: deviceId + "-pending",
      severity: "warning",
      title: "در انتظار تأیید",
      description: "دستگاه ثبت شده اما هنوز توسط مدیریت فعال نشده است.",
      deviceId,
      staffId,
    });
  }

  if (status === "active" && presence === "offline") {
    alerts.push({
      id: deviceId + "-offline",
      severity: "warning",
      title: "دستگاه آفلاین",
      description: "آخرین heartbeat دستگاه قدیمی است و اتصال اخیر تأیید نشده است.",
      deviceId,
      staffId,
    });
  } else if (status === "active" && presence === "stale") {
    alerts.push({
      id: deviceId + "-stale",
      severity: "warning",
      title: "نیازمند توجه",
      description: "مدتی از آخرین مشاهده دستگاه گذشته است.",
      deviceId,
      staffId,
    });
  }

  if (status === "active" && mode === "unknown") {
    alerts.push({
      id: deviceId + "-mode",
      severity: "warning",
      title: "حالت مدیریت نامشخص",
      description: "اپ هنوز نوع مدیریت Android Enterprise را برای این دستگاه گزارش نکرده است.",
      deviceId,
      staffId,
    });
  }

  const permissionItems = permissionHealthFromPayload(permissionPayload);
  const denied = permissionItems.filter((item) => item.status === "denied");
  if (denied.length) {
    alerts.push({
      id: deviceId + "-permissions",
      severity: "warning",
      title: "مجوز نیازمند بررسی",
      description: denied.map((item) => item.label).join("، ") + " در آخرین گزارش فعال نبوده است.",
      deviceId,
      staffId,
    });
  }

  if (status === "active" && !permissionItems.length) {
    alerts.push({
      id: deviceId + "-permission-telemetry",
      severity: "info",
      title: "در انتظار وضعیت مجوزها",
      description: "هنوز گزارش permission_state از اپ برای این دستگاه دریافت نشده است.",
      deviceId,
      staffId,
    });
  }

  return alerts;
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "private, no-store");
  await requireSecurityAdmin(event);

  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده آماده نیست." });
  }

  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>(
    "select d.id,d.device_id,d.staff_id,d.status,d.app_version_name,d.app_version_code," +
      "d.management_mode,d.manufacturer,d.model,d.android_version,d.sdk_int,d.created_at,d.updated_at," +
      "d.approved_at,d.revoked_at,d.last_seen_at,d.last_sync_at," +
      "c.name as staff_name,c.role as staff_role," +
      "lp.payload as latest_permission_payload,lp.observed_at as latest_permission_at," +
      "hb.observed_at as latest_heartbeat_at," +
      "loc.observed_at as latest_location_at " +
      "from staff_mobile_devices d " +
      "left join consultants c on c.id=d.staff_id " +
      "left join lateral (" +
      "select payload,observed_at from staff_mobile_telemetry " +
      "where device_id=d.device_id and event_type='permission_state' " +
      "order by observed_at desc limit 1" +
      ") lp on true " +
      "left join lateral (" +
      "select observed_at from staff_mobile_telemetry " +
      "where device_id=d.device_id and event_type='app_heartbeat' " +
      "order by observed_at desc limit 1" +
      ") hb on true " +
      "left join lateral (" +
      "select observed_at from staff_mobile_locations " +
      "where device_id=d.device_id " +
      "order by observed_at desc limit 1" +
      ") loc on true " +
      "order by d.updated_at desc",
  );

  const now = Date.now();
  const devices = rows.map((row) => {
    const mode = parseManagementMode(row.management_mode);
    const lastSeenAt = iso(row.last_seen_at);
    const presence = getMobilePresence(lastSeenAt, now);
    const permissionPayload = jsonObject(row.latest_permission_payload);
    const permissions = permissionHealthFromPayload(permissionPayload);
    const alerts = buildAlerts(row, mode, permissionPayload, now);

    return {
      id: String(row.id),
      deviceId: String(row.device_id),
      staffId: String(row.staff_id),
      staffName: String(row.staff_name ?? row.staff_id),
      staffRole: String(row.staff_role ?? ""),
      status: String(row.status),
      appVersionName: String(row.app_version_name ?? ""),
      appVersionCode: Number(row.app_version_code ?? 0),
      managementMode: mode,
      managementModeLabel: managementModeLabel(mode),
      manufacturer: String(row.manufacturer ?? ""),
      model: String(row.model ?? ""),
      androidVersion: String(row.android_version ?? ""),
      sdkInt: row.sdk_int == null ? null : Number(row.sdk_int),
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      approvedAt: iso(row.approved_at),
      revokedAt: iso(row.revoked_at),
      lastSeenAt,
      lastSyncAt: iso(row.last_sync_at),
      latestPermissionAt: iso(row.latest_permission_at),
      latestHeartbeatAt: iso(row.latest_heartbeat_at),
      latestLocationAt: iso(row.latest_location_at),
      presence,
      presenceLabel: mobilePresenceLabel(presence),
      permissions,
      locationCapability: row.latest_location_at ? "available" : "not_active",
      policy: {
        management: mode === "unknown" ? "needs_setup" : "operational",
        permissions: permissions.length ? "operational" : "pending_telemetry",
        sync: lastSeenAt ? "operational" : "pending",
        retention: "configured_manual_cleanup",
        location: row.latest_location_at ? "available" : "not_active",
      },
      alerts,
      needsAttention: alerts.some((alert) => alert.severity !== "info"),
    };
  });

  const counts = {
    total: devices.length,
    active: devices.filter((d) => d.status === "active").length,
    pending: devices.filter((d) => d.status === "pending").length,
    revoked: devices.filter((d) => d.status === "revoked").length,
    online: devices.filter((d) => d.presence === "online").length,
    attention: devices.filter((d) => d.needsAttention).length,
    deviceOwner: devices.filter((d) => d.managementMode === "device_owner").length,
    profileOwner: devices.filter((d) => d.managementMode === "profile_owner").length,
  };

  const alerts = devices.flatMap((device) => device.alerts);
  alerts.sort((a, b) => {
    const rank = (value: Severity) => value === "critical" ? 0 : value === "warning" ? 1 : 2;
    return rank(a.severity) - rank(b.severity);
  });

  return {
    success: true,
    generatedAt: new Date(now).toISOString(),
    counts,
    devices,
    alerts: alerts.slice(0, 60),
    policy: {
      managementMode: "برای دستگاه‌های جدید از Android گزارش می‌شود؛ دستگاه‌های قدیمی ممکن است نامشخص باشند.",
      permissionPolicy: "فقط وضعیت واقعی permission_state اپ نمایش داده می‌شود.",
      securityPolicy: "مشاهده و عملیات مدیریتی به security.manage محدود است و عملیات حساس audit می‌شوند.",
      appPolicy: "نسخه و هویت اپ از registration و heartbeat واقعی خوانده می‌شود؛ enforcement نسخه در این پنل فعال نیست.",
      syncPolicy: "heartbeat دوره‌ای اپ و last_seen_at سرور مبنای سلامت sync هستند.",
      retentionPolicy: "قوانین نگهداری در migration تعریف شده و پاک‌سازی دستی endpoint موجود را استفاده می‌کند.",
      locationPolicy: "collector موقعیت در این نسخه فعال نیست؛ وجود قابلیت schema به معنی tracking فعال نیست.",
    },
  };
});
