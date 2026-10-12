import { createError, defineEventHandler, getCookie, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { managementModeLabel, parseManagementMode } from "@/lib/mobile-management";

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "private, no-store");

  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(token))) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  }

  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "security.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی مدیریت دستگاه‌ها برای این حساب فعال نیست." });
  }

  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده آماده نیست." });
  }

  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>(
    "select d.id,d.device_id,d.staff_id,d.status,d.app_version_name,d.app_version_code," +
      "d.management_mode,d.manufacturer,d.model,d.android_version,d.sdk_int,d.last_sync_at," +
      "d.created_at,d.updated_at,d.approved_at,d.revoked_at,d.last_seen_at," +
      "c.name as staff_name,c.role as staff_role " +
      "from staff_mobile_devices d " +
      "left join consultants c on c.id=d.staff_id " +
      "order by case d.status when 'pending' then 0 when 'active' then 1 else 2 end,d.updated_at desc",
  );

  return {
    success: true,
    devices: rows.map((row) => ({
      id: String(row.id),
      deviceId: String(row.device_id),
      staffId: String(row.staff_id),
      staffName: String(row.staff_name ?? row.staff_id),
      staffRole: String(row.staff_role ?? ""),
      status: String(row.status),
      appVersionName: String(row.app_version_name ?? ""),
      appVersionCode: Number(row.app_version_code ?? 0),
      managementMode: parseManagementMode(row.management_mode),
      managementModeLabel: managementModeLabel(parseManagementMode(row.management_mode)),
      manufacturer: String(row.manufacturer ?? ""),
      model: String(row.model ?? ""),
      androidVersion: String(row.android_version ?? ""),
      sdkInt: row.sdk_int == null ? null : Number(row.sdk_int),
      createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : null,
      updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : null,
      approvedAt: row.approved_at ? new Date(String(row.approved_at)).toISOString() : null,
      revokedAt: row.revoked_at ? new Date(String(row.revoked_at)).toISOString() : null,
      lastSeenAt: row.last_seen_at ? new Date(String(row.last_seen_at)).toISOString() : null,
      lastSyncAt: row.last_sync_at ? new Date(String(row.last_sync_at)).toISOString() : null,
    })),
  };
});
