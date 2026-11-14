import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { createError } from "h3";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims } from "@/lib/admin-session.server";
import { assertAdminServerFnOrigin } from "@/lib/admin-server-fn-guard.server";
import { assertAdminDatabaseConfigured } from "@/lib/admin-database-availability.server";
import { normalizeAdminRole } from "@/lib/admin-roles";
import { getAdminNotificationAccountKey, getAdminNotificationPermissions } from "@/lib/admin-notification-access";
import { syncAdminNotificationCandidates } from "@/lib/admin-notification-sync";
import {
  dismissAdminNotificationForAccount,
  listAdminNotificationsForAccount,
  markAdminNotificationReadForAccount,
  markAllAdminNotificationsReadForAccount,
} from "@/lib/admin-notification-store";

async function requireAdmin() {
  const token = getCookie(ADMIN_SESSION_COOKIE);
  const claims = await getAdminSessionClaims(token);
  if (!claims) throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  assertAdminServerFnOrigin();
  const role = normalizeAdminRole(claims.role);
  const permissions = getAdminNotificationPermissions(role);
  if (!permissions.some((permission) => permission !== "reports.view")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی مشاهده صندوق اعلان‌ها برای این حساب فعال نیست." });
  }
  return {
    permissions,
    accountId: getAdminNotificationAccountKey(claims.accountId, role),
  };
}

export type AdminNotification = {
  id: number;
  kind: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  entitySlug: string | null;
  createdAt: string;
  readAt: string | null;
};

export const listAdminNotifications = createServerFn({ method: "POST" })
  .validator(z.object({ limit: z.number().int().min(1).max(100).optional().default(60) }))
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    assertAdminDatabaseConfigured(dbSource, "صندوق اعلان‌های مدیریت در دسترس نیست؛ اتصال پایگاه داده را بررسی کنید.");
    const sql = await getSql();
    await syncAdminNotificationCandidates(sql, admin.permissions);
    return listAdminNotificationsForAccount(sql, admin.accountId, admin.permissions, data.limit);
  });

export const markAdminNotificationRead = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    assertAdminDatabaseConfigured(dbSource, "علامت‌گذاری اعلان در دسترس نیست؛ اتصال پایگاه داده را بررسی کنید.");
    const sql = await getSql();
    const success = await markAdminNotificationReadForAccount(sql, data.id, admin.accountId, admin.permissions);
    if (!success) throw createError({ statusCode: 404, statusMessage: "اعلان پیدا نشد یا دسترسی مشاهده آن را ندارید." });
    return { success: true };
  });

export const markAllAdminNotificationsRead = createServerFn({ method: "POST" })
  .validator(z.object({}).optional())
  .handler(async () => {
    const admin = await requireAdmin();
    assertAdminDatabaseConfigured(dbSource, "علامت‌گذاری اعلان‌ها در دسترس نیست؛ اتصال پایگاه داده را بررسی کنید.");
    const sql = await getSql();
    const marked = await markAllAdminNotificationsReadForAccount(sql, admin.accountId, admin.permissions);
    return { success: true, marked };
  });

export const dismissAdminNotification = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    assertAdminDatabaseConfigured(dbSource, "مدیریت اعلان در دسترس نیست؛ اتصال پایگاه داده را بررسی کنید.");
    const sql = await getSql();
    const success = await dismissAdminNotificationForAccount(sql, data.id, admin.accountId, admin.permissions);
    if (!success) throw createError({ statusCode: 404, statusMessage: "اعلان پیدا نشد یا دسترسی مشاهده آن را ندارید." });
    return { success: true };
  });
