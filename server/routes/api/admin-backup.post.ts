import { createError, defineEventHandler, getCookie, readBody, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { writeAdminAuditLog } from "@/lib/admin-audit-log.server";

type Body = { action?: "prune"; retentionDays?: number };

async function requireBackupManager(event: H3Event) {
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  }
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  const role = normalizeAdminRole(claims?.role);
  if (!hasAdminPermission(role, "backup.manage")) {
    throw createError({ statusCode: 403, statusMessage: "سطح دسترسی لازم برای مدیریت پشتیبان وجود ندارد." });
  }
}

export default defineEventHandler(async (event) => {
  await requireBackupManager(event);
  setResponseHeader(event, "cache-control", "no-store");
  if (dbSource === "unconfigured") throw createError({ statusCode: 503, statusMessage: "پایگاه داده تنظیم نشده است." });
  const body = (await readBody(event).catch(() => ({}))) as Body;
  if (body.action !== "prune") {
    throw createError({ statusCode: 400, statusMessage: "عملیات پشتیبان نامعتبر است." });
  }
  const retentionDays = Math.min(3650, Math.max(30, Number(body.retentionDays) || 90));
  const sql = await getSql();
  const rows = await sql.query<{ id: number }>(
    "delete from admin_backup_log where created_at < current_timestamp - ($1::int * interval '1 day') returning id",
    [retentionDays],
  );
  await writeAdminAuditLog({
    action: "admin_backup_history_pruned",
    entityType: "admin_backup",
    metadata: { deleted: rows.length, retentionDays },
  }).catch(() => {});
  return { success: true, deleted: rows.length, retentionDays };
});
