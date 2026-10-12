/**
 * Server-only writer for the admin audit trail.
 *
 * It lives apart from `admin-audit.ts` on purpose: that module has to stay a
 * pure server-function module so TanStack Start can strip it from the browser
 * bundle. A plain exported function next to the server functions keeps the
 * whole module — and with it `@/lib/db` and `node:fs` — in the client graph.
 */
import { dbSource, getSql } from "@/lib/db";

export type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  entityTitle?: string;
  actor?: string;
  metadata?: Record<string, unknown>;
};

export async function writeAdminAuditLog(input: AuditInput) {
  if (dbSource === "unconfigured") return;
  try {
    const sql = await getSql();
    await sql.query(
      `insert into admin_audit_log
        (action, entity_type, entity_id, entity_title, actor, metadata)
       values ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        input.action.trim().slice(0, 80),
        input.entityType.trim().slice(0, 80),
        input.entityId?.trim().slice(0, 160) ?? null,
        input.entityTitle?.trim().slice(0, 220) ?? "",
        input.actor?.trim().slice(0, 120) || "admin",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  } catch (error) {
    console.warn("[admin-audit] write failed", error);
  }
}
