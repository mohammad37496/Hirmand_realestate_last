import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertAdminServerFnOrigin } from "@/lib/admin-server-fn-guard.server";

async function requireAdmin() {
  const token = getCookie(ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(token))) throw new Error("نشست مدیریت معتبر نیست.");
  assertAdminServerFnOrigin();
}

type Candidate = {
  sourceKey: string;
  kind: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
};

async function syncCandidates(sql: Awaited<ReturnType<typeof getSql>>) {
  const candidates: Candidate[] = [];
  const [leads, visits, messages, staleProperties] = await Promise.all([
    sql.query<Record<string, unknown>>(
      "select id,name,follow_up_at from leads where status not in ('closed','spam') and follow_up_at is not null and follow_up_at <= current_timestamp order by follow_up_at asc limit 40",
    ).catch(() => []),
    sql.query<Record<string, unknown>>(
      "select id,name from leads where visit_status='requested' order by visit_requested_at desc nulls last limit 30",
    ).catch(() => []),
    sql.query<Record<string, unknown>>(
      "select lead_id,count(*)::int as unread_count,max(created_at) as latest from customer_messages where sender_type='customer' and read_by_admin_at is null group by lead_id order by max(created_at) desc limit 30",
    ).catch(() => []),
    sql.query<Record<string, unknown>>(
      "select id,title from properties where deleted_at is null and status='published' and coalesce(jsonb_array_length(images),0)=0 order by updated_at desc limit 20",
    ).catch(() => []),
  ]);

  for (const row of leads) {
    const due = new Date(String(row.follow_up_at));
    candidates.push({
      sourceKey: "lead-overdue:" + String(row.id) + ":" + due.toISOString(),
      kind: "lead",
      severity: "critical",
      title: "پیگیری مشتری عقب افتاده",
      body: String(row.name ?? "مشتری") + " زمان پیگیری‌اش گذشته است.",
      entityType: "lead",
      entityId: String(row.id),
    });
  }

  for (const row of visits) {
    candidates.push({
      sourceKey: "lead-visit:" + String(row.id),
      kind: "visit",
      severity: "warning",
      title: "درخواست بازدید جدید",
      body: String(row.name ?? "مشتری") + " درخواست بازدید ثبت کرده است.",
      entityType: "lead",
      entityId: String(row.id),
    });
  }

  for (const row of messages) {
    candidates.push({
      sourceKey: "customer-message:" + String(row.lead_id) + ":" + String(row.latest),
      kind: "message",
      severity: "warning",
      title: "پیام جدید مشتری",
      body: String(row.unread_count ?? 1) + " پیام خوانده‌نشده در گفت‌وگوی مشتری دارید.",
      entityType: "lead",
      entityId: String(row.lead_id),
    });
  }

  for (const row of staleProperties) {
    candidates.push({
      sourceKey: "property-no-image:" + String(row.id),
      kind: "property",
      severity: "warning",
      title: "فایل منتشرشده بدون تصویر",
      body: String(row.title ?? "فایل") + " هنوز تصویر ندارد.",
      entityType: "property",
      entityId: String(row.id),
    });
  }

  for (const candidate of candidates) {
    await sql.query(
      "insert into admin_notifications (source_key,kind,severity,title,body,entity_type,entity_id) values ($1,$2,$3,$4,$5,$6,$7) on conflict (source_key) do nothing",
      [
        candidate.sourceKey,
        candidate.kind,
        candidate.severity,
        candidate.title,
        candidate.body,
        candidate.entityType ?? null,
        candidate.entityId ?? null,
      ],
    );
  }
}

export type AdminNotification = {
  id: number;
  kind: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  readAt: string | null;
};

export const listAdminNotifications = createServerFn({ method: "POST" })
  .validator(z.object({ limit: z.number().int().min(1).max(100).optional().default(50) }))
  .handler(async ({ data }) => {
    await requireAdmin();
    if (dbSource === "unconfigured") return { notifications: [], unread: 0 };
    const sql = await getSql();
    await syncCandidates(sql);
    const rows = await sql.query<Record<string, unknown>>(
      "select id,kind,severity,title,body,entity_type,entity_id,created_at,read_at from admin_notifications order by (read_at is null) desc, created_at desc limit $1",
      [data.limit],
    );
    const unread = Number((await sql.query<{ count: number }>(
      "select count(*)::int as count from admin_notifications where read_at is null",
    ))[0]?.count) || 0;
    return {
      unread,
      notifications: rows.map((row) => ({
        id: Number(row.id),
        kind: String(row.kind ?? "system"),
        severity: String(row.severity ?? "info") as AdminNotification["severity"],
        title: String(row.title ?? ""),
        body: String(row.body ?? ""),
        entityType: row.entity_type ? String(row.entity_type) : null,
        entityId: row.entity_id ? String(row.entity_id) : null,
        createdAt: new Date(String(row.created_at)).toISOString(),
        readAt: row.read_at ? new Date(String(row.read_at)).toISOString() : null,
      })),
    };
  });

export const markAdminNotificationRead = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ data }) => {
    await requireAdmin();
    if (dbSource === "unconfigured") return { success: true };
    const sql = await getSql();
    await sql.query("update admin_notifications set read_at=current_timestamp where id=$1", [data.id]);
    return { success: true };
  });

export const markAllAdminNotificationsRead = createServerFn({ method: "POST" })
  .validator(z.object({}).optional())
  .handler(async () => {
    await requireAdmin();
    if (dbSource === "unconfigured") return { success: true };
    const sql = await getSql();
    await sql.query("update admin_notifications set read_at=current_timestamp where read_at is null");
    return { success: true };
  });
