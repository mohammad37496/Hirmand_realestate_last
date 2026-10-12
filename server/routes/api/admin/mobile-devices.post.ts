import { createError, defineEventHandler, getCookie, readBody, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { writeAdminAuditLog } from "@/lib/admin-audit-log.server";

async function requireSecurityAdmin(event: H3Event) {
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(token))) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  }
  assertSameOrigin(event);

  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "security.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی مدیریت دستگاه‌ها برای این حساب فعال نیست." });
  }
  return claims;
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "private, no-store");

  const claims = await requireSecurityAdmin(event);
  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده آماده نیست." });
  }

  const body = (await readBody(event).catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";
  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";

  if (!["approve", "revoke"].includes(action) || !deviceId) {
    throw createError({ statusCode: 400, statusMessage: "عملیات یا شناسه دستگاه نامعتبر است." });
  }

  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>(
    "select d.id,d.device_id,d.staff_id,c.name as staff_name " +
      "from staff_mobile_devices d left join consultants c on c.id=d.staff_id " +
      "where d.device_id=$1 limit 1",
    [deviceId],
  );
  const device = rows[0];

  if (!device) {
    throw createError({ statusCode: 404, statusMessage: "دستگاه پیدا نشد." });
  }

  const nextStatus = action === "approve" ? "active" : "revoked";
  await sql.query(
    "update staff_mobile_devices set status=$1,updated_at=current_timestamp," +
      "approved_at=case when $1='active' then current_timestamp else null end," +
      "revoked_at=case when $1='revoked' then current_timestamp else null end " +
      "where id=$2",
    [nextStatus, String(device.id)],
  );

  const actor = claims?.accountId
    ? String(claims.accountId)
    : normalizeAdminRole(claims?.role);

  await writeAdminAuditLog({
    action: action === "approve" ? "staff_mobile_device.approve" : "staff_mobile_device.revoke",
    entityType: "staff_mobile_device",
    entityId: String(device.id),
    entityTitle: String(device.staff_name ?? device.staff_id) + " / " + deviceId.slice(0, 12),
    actor,
    metadata: {
      deviceId,
      staffId: String(device.staff_id),
      status: nextStatus,
    },
  });

  return {
    success: true,
    status: nextStatus,
    deviceId,
  };
});
