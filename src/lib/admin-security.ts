import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import {
  ADMIN_SESSION_COOKIE,
  getAdminSessionClaims,
  revokeAdminSession,
  verifyAdminSessionToken,
} from "@/lib/admin-session.server";
import { assertAdminServerFnOrigin } from "@/lib/admin-server-fn-guard.server";
import { writeAdminAuditLog } from "@/lib/admin-audit-log.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

async function requireAdmin() {
  const token = getCookie(ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(token))) throw new Error("نشست مدیریت معتبر نیست.");
  assertAdminServerFnOrigin();
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "security.manage")) throw new Error("سطح دسترسی امنیت مدیران برای این حساب فعال نیست.");
  return claims;
}

export type AdminSecuritySession = {
  id: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
  clientHash: string;
  userAgent: string;
  isCurrent: boolean;
};

export const listAdminSecuritySessions = createServerFn({ method: "POST" })
  .validator(z.object({ limit: z.number().int().min(1).max(100).optional().default(50) }))
  .handler(async ({ data }) => {
    const current = await requireAdmin();
    if (dbSource === "unconfigured") return { sessions: [], currentSessionId: current?.sessionId ?? null };
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select id, created_at, expires_at, last_seen_at, revoked_at, client_hash, user_agent
       from admin_sessions
       where created_at > current_timestamp - interval '30 days'
       order by revoked_at is null desc, last_seen_at desc, created_at desc
       limit $1`,
      [data.limit],
    );
    return {
      currentSessionId: current?.sessionId ?? null,
      sessions: rows.map((row) => ({
        id: String(row.id ?? ""),
        createdAt: new Date(String(row.created_at)).toISOString(),
        expiresAt: new Date(String(row.expires_at)).toISOString(),
        lastSeenAt: new Date(String(row.last_seen_at)).toISOString(),
        revokedAt: row.revoked_at ? new Date(String(row.revoked_at)).toISOString() : null,
        clientHash: String(row.client_hash ?? ""),
        userAgent: String(row.user_agent ?? ""),
        isCurrent: String(row.id ?? "") === (current?.sessionId ?? ""),
      })),
    };
  });

export const revokeAdminSessionById = createServerFn({ method: "POST" })
  .validator(z.object({ sessionId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const current = await requireAdmin();
    if (!current?.sessionId) throw new Error("نشست فعلی قابل مدیریت نیست.");
    if (data.sessionId === current.sessionId) throw new Error("برای بستن نشست فعلی از گزینه خروج استفاده کنید.");
    const changed = await revokeAdminSession(data.sessionId);
    if (changed) {
      await writeAdminAuditLog({
        action: "admin_session_revoked",
        entityType: "admin_session",
        entityId: data.sessionId,
      });
    }
    return { success: true, revoked: changed };
  });

export const revokeOtherAdminSessions = createServerFn({ method: "POST" })
  .validator(z.object({}).optional())
  .handler(async () => {
    const current = await requireAdmin();
    if (dbSource === "unconfigured" || !current?.sessionId) return { success: true, revoked: 0 };
    const sql = await getSql();
    const rows = await sql.query<{ id: string }>(
      `update admin_sessions
       set revoked_at = current_timestamp
       where revoked_at is null
         and id <> $1
       returning id`,
      [current.sessionId],
    );
    await writeAdminAuditLog({
      action: "admin_other_sessions_revoked",
      entityType: "admin_session",
      metadata: { count: rows.length },
    });
    return { success: true, revoked: rows.length };
  });

export const purgeExpiredAdminSessions = createServerFn({ method: "POST" })
  .validator(z.object({}).optional())
  .handler(async () => {
    await requireAdmin();
    if (dbSource === "unconfigured") return { success: true, deleted: 0 };
    const sql = await getSql();
    const rows = await sql.query<{ id: string }>(
      `delete from admin_sessions
       where expires_at < current_timestamp - interval '7 days'
       returning id`,
    );
    return { success: true, deleted: rows.length };
  });
