import { createError, defineEventHandler, getCookie, readBody, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

type ActionItem = {
  id: string;
  kind: "task" | "lead" | "visit" | "property" | "featured";
  priority: "urgent" | "high" | "normal";
  title: string;
  description: string;
  createdAt: string;
  dueAt: string | null;
  entityId: string | null;
  target: "productivity" | "leads" | "properties";
};

async function requireAdmin(event: H3Event) {
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  }
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "lead.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی مدیریت پیگیری‌ها برای این حساب فعال نیست." });
  }
}

function iso(value: unknown) {
  if (value == null) return null;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  await requireAdmin(event);
  if (dbSource === "unconfigured") return { summary: { urgent: 0, high: 0, total: 0 }, items: [] as ActionItem[] };

  const body = (await readBody(event).catch(() => ({}))) as { action?: "list" | "completeTask"; id?: string };
  const sql = await getSql();

  if (body.action === "completeTask") {
    const id = String(body.id ?? "").trim();
    if (!id) throw createError({ statusCode: 400, statusMessage: "شناسه وظیفه نامعتبر است." });
    const rows = await sql.query<{ id: string }>(
      "update admin_tasks set status='done', updated_at=current_timestamp where id=$1 and status='open' returning id",
      [id],
    );
    if (!rows[0]) throw createError({ statusCode: 404, statusMessage: "وظیفه باز پیدا نشد." });
    return { success: true, id };
  }

  const [taskRows, leadRows, visitRows, staleRows, featuredRows] = await Promise.all([
    sql.query<Record<string, unknown>>(
      "select id,title,description,priority,due_at,created_at from admin_tasks where status='open' " +
      "order by case priority when 'urgent' then 0 when 'high' then 1 else 2 end, due_at asc nulls last, created_at desc limit 12",
    ),
    sql.query<Record<string, unknown>>(
      "select l.id,l.name,l.phone,l.created_at,l.follow_up_at,l.neighborhood,l.deal from leads l " +
      "where l.status in ('new','contacted','follow_up') and l.created_at < current_timestamp - interval '4 hours' " +
      "and not exists (select 1 from lead_activities a where a.lead_id=l.id and a.activity_type in ('call','whatsapp','visit')) " +
      "order by l.created_at asc limit 10",
    ),
    sql.query<Record<string, unknown>>(
      "select l.id,l.name,l.phone,l.visit_preferred_at,l.visit_requested_at,l.visit_status,coalesce(p.title,'فایل بدون عنوان') as property_title " +
      "from leads l left join properties p on p.id::text=l.property_id::text " +
      "where l.visit_status='requested' order by l.visit_preferred_at asc nulls last,l.visit_requested_at asc limit 10",
    ),
    sql.query<Record<string, unknown>>(
      "select id,title,neighborhood,slug,updated_at from properties where status='published' " +
      "and updated_at < current_timestamp - interval '30 days' order by updated_at asc limit 8",
    ),
    sql.query<Record<string, unknown>>(
      "select id,title,slug,featured_until from properties where featured=true and featured_until is not null " +
      "and featured_until < current_timestamp order by featured_until asc limit 6",
    ),
  ]);

  const items: ActionItem[] = [
    ...taskRows.map((row) => ({
      id: String(row.id),
      kind: "task" as const,
      priority: row.priority === "urgent" ? "urgent" as const : row.priority === "high" ? "high" as const : "normal" as const,
      title: String(row.title ?? "وظیفه باز"),
      description: String(row.description ?? ""),
      createdAt: iso(row.created_at) ?? new Date().toISOString(),
      dueAt: iso(row.due_at),
      entityId: String(row.id),
      target: "productivity" as const,
    })),
    ...leadRows.map((row) => ({
      id: "lead:" + String(row.id),
      kind: "lead" as const,
      priority: "high" as const,
      title: "لید بدون تماس: " + String(row.name ?? "مشتری"),
      description: [row.neighborhood, row.deal, row.phone].map((v) => String(v ?? "").trim()).filter(Boolean).join(" · "),
      createdAt: iso(row.created_at) ?? new Date().toISOString(),
      dueAt: iso(row.follow_up_at),
      entityId: String(row.id),
      target: "leads" as const,
    })),
    ...visitRows.map((row) => ({
      id: "visit:" + String(row.id),
      kind: "visit" as const,
      priority: "urgent" as const,
      title: "درخواست بازدید: " + String(row.property_title ?? "فایل"),
      description: [row.name, row.visit_preferred_at].map((v) => String(v ?? "").trim()).filter(Boolean).join(" · "),
      createdAt: iso(row.visit_requested_at) ?? new Date().toISOString(),
      dueAt: iso(row.visit_preferred_at),
      entityId: String(row.id),
      target: "leads" as const,
    })),
    ...staleRows.map((row) => ({
      id: "property:" + String(row.id),
      kind: "property" as const,
      priority: "high" as const,
      title: "فایل نیازمند تازه‌سازی: " + String(row.title ?? "فایل"),
      description: [row.neighborhood, row.updated_at ? "آخرین بروزرسانی: " + new Date(String(row.updated_at)).toLocaleDateString("fa-IR") : ""].filter(Boolean).join(" · "),
      createdAt: iso(row.updated_at) ?? new Date().toISOString(),
      dueAt: null,
      entityId: String(row.id),
      target: "properties" as const,
    })),
    ...featuredRows.map((row) => ({
      id: "featured:" + String(row.id),
      kind: "featured" as const,
      priority: "normal" as const,
      title: "ویژه منقضی‌شده: " + String(row.title ?? "فایل"),
      description: "پایان نمایش ویژه: " + new Date(String(row.featured_until)).toLocaleDateString("fa-IR"),
      createdAt: iso(row.featured_until) ?? new Date().toISOString(),
      dueAt: null,
      entityId: String(row.id),
      target: "properties" as const,
    })),
  ];

  const weight = { urgent: 0, high: 1, normal: 2 } as const;
  items.sort((a, b) => weight[a.priority] - weight[b.priority] || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return {
    summary: {
      urgent: items.filter((item) => item.priority === "urgent").length,
      high: items.filter((item) => item.priority === "high").length,
      total: items.length,
    },
    items: items.slice(0, 18),
  };
});