import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertAdminServerFnOrigin } from "@/lib/admin-server-fn-guard.server";

async function requireAdmin() {
  if (await verifyAdminSessionToken(getCookie(ADMIN_SESSION_COOKIE))) {
    assertAdminServerFnOrigin();
    return;
  }
  throw new Error("نشست مدیریت معتبر نیست.");
}

// `writeAdminAuditLog` now lives in `./admin-audit-log.server` so that this
// module exports nothing but server functions and TanStack Start can keep
// `@/lib/db` (and `node:fs`) out of the browser bundle.

export const listAdminAuditLog = createServerFn({ method: "POST" })
  .validator(
    z.object({
      limit: z.number().int().min(1).max(200).optional().default(100),
      entityType: z.string().trim().max(80).optional().default(""),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    if (dbSource === "unconfigured") return [];
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select id, action, entity_type, entity_id, entity_title, actor, metadata, created_at
       from admin_audit_log
       where ($1::text = '' or entity_type = $1)
       order by created_at desc, id desc
       limit $2`,
      [data.entityType.trim(), data.limit],
    );
    return rows.map((row) => ({
      id: Number(row.id) || 0,
      action: String(row.action ?? ""),
      entityType: String(row.entity_type ?? ""),
      entityId: row.entity_id == null ? null : String(row.entity_id),
      entityTitle: String(row.entity_title ?? ""),
      actor: String(row.actor ?? "admin"),
      metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
      createdAt: new Date(String(row.created_at)).toISOString(),
    }));
  });

export const clearAdminAuditLog = createServerFn({ method: "POST" })
  .validator(z.object({ beforeDays: z.number().int().min(7).max(3650).optional().default(365) }))
  .handler(async ({ data }) => {
    await requireAdmin();
    if (dbSource === "unconfigured") return { success: true, deleted: 0 };
    const sql = await getSql();
    const rows = await sql.query<{ id: number }>(
      `delete from admin_audit_log
       where created_at < current_timestamp - ($1::text || ' days')::interval
       returning id`,
      [String(data.beforeDays)],
    );
    return { success: true, deleted: rows.length };
  });
