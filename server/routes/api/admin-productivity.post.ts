import { createError, defineEventHandler, getCookie, readBody, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";

type TaskStatus = "open" | "done" | "cancelled";
type Priority = "low" | "normal" | "high" | "urgent";

const TASK_STATUSES: TaskStatus[] = ["open", "done", "cancelled"];
const PRIORITIES: Priority[] = ["low", "normal", "high", "urgent"];

async function requireAdmin(event: H3Event) {
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست. دوباره وارد پنل شوید." });
  }
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "lead.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی مدیریت وظایف و بهره‌وری برای این حساب فعال نیست." });
  }
}

function cleanText(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function nullableDate(value: unknown) {
  if (value == null || value === "") return null;
  const raw = String(value);
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) {
    throw createError({ statusCode: 400, statusMessage: "تاریخ یا زمان نامعتبر است." });
  }
  return date.toISOString();
}

function serializeTask(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    status: String(row.status) as TaskStatus,
    priority: String(row.priority) as Priority,
    dueAt: row.due_at == null ? null : new Date(String(row.due_at)).toISOString(),
    assignee: String(row.assignee ?? ""),
    entityType: String(row.entity_type ?? ""),
    entityId: row.entity_id == null ? null : String(row.entity_id),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

async function loadSummary(sql: Awaited<ReturnType<typeof getSql>>) {
  const results = await Promise.all([
    sql.query<Record<string, unknown>>(
      "select count(*) filter (where status='open')::int as open, " +
      "count(*) filter (where status='open' and due_at is not null and due_at <= current_timestamp)::int as overdue, " +
      "count(*) filter (where status='open' and due_at >= (current_timestamp at time zone 'Asia/Tehran')::date at time zone 'Asia/Tehran' " +
      "and due_at < ((current_timestamp at time zone 'Asia/Tehran')::date + 1) at time zone 'Asia/Tehran')::int as today, " +
      "count(*) filter (where status='open' and due_at > current_timestamp and due_at <= current_timestamp + interval '7 days')::int as next7 " +
      "from admin_tasks"
    ),
    sql.query<Record<string, unknown>>(
      "select count(*)::int as total, " +
      "count(*) filter (where status='published')::int as published, " +
      "count(*) filter (where status='published' and coalesce(jsonb_array_length(images),0)=0)::int as without_images, " +
      "count(*) filter (where status='published' and (coalesce(jsonb_array_length(images),0)=0 or " +
      "coalesce(length(trim(description)),0) < 120 or coalesce(trim(neighborhood),'')='' or coalesce(trim(contact_name),'')=''))::int as incomplete, " +
      "count(*) filter (where status='published' and updated_at < current_timestamp - interval '30 days')::int as stale, " +
      "count(*) filter (where featured=true and featured_until is not null and featured_until < current_timestamp)::int as expired_featured " +
      "from properties"
    ),
    sql.query<Record<string, unknown>>(
      "select coalesce(nullif(trim(owner_phone),''),'') as owner_phone, count(*)::int as file_count, " +
      "min(trim(coalesce(neighborhood,''))) as neighborhood, " +
      "jsonb_agg(jsonb_build_object('id',id,'slug',slug,'title',title) order by updated_at desc) as files " +
      "from properties where status <> 'archived' and coalesce(trim(owner_phone),'') <> '' " +
      "group by coalesce(nullif(trim(owner_phone),''),'') having count(*) > 1 order by file_count desc limit 12"
    ),
    sql.query<Record<string, unknown>>(
      "select lower(trim(title)) as title_key, min(trim(title)) as title, min(trim(neighborhood)) as neighborhood, " +
      "count(*)::int as file_count, jsonb_agg(jsonb_build_object('id',id,'slug',slug,'title',title) order by updated_at desc) as files " +
      "from properties where status <> 'archived' and coalesce(trim(title),'') <> '' " +
      "group by lower(trim(title)) having count(*) > 1 order by file_count desc limit 12"
    ),
    sql.query<Record<string, unknown>>(
      "select id, slug, title, neighborhood, updated_at from properties " +
      "where status='published' and updated_at < current_timestamp - interval '30 days' " +
      "order by updated_at asc limit 12"
    ),
    sql.query<Record<string, unknown>>(
      "select id, slug, title, featured_until from properties " +
      "where featured=true and featured_until is not null and featured_until < current_timestamp " +
      "order by featured_until asc limit 12"
    ),
    sql.query<Record<string, unknown>>(
      "select source, item_id, event_name, title, created_at from (" +
      "select 'property'::text as source, id::text as item_id, action::text as event_name, " +
      "coalesce(after_state->>'title', before_state->>'title', 'فایل')::text as title, changed_at as created_at from property_change_history " +
      "union all select 'lead'::text, id::text, activity_type::text, nullif(trim(title),'')::text, created_at from lead_activities " +
      "union all select 'partner'::text, id::text, action::text, nullif(trim(note),'')::text, created_at from partner_audit_logs " +
      "union all select 'task'::text, id::text, status::text, nullif(trim(title),'')::text, updated_at from admin_tasks" +
      ") activity order by created_at desc limit 36"
    ),
    Promise.all([
      sql.query("select count(*)::int as count from properties").catch(() => [{ count: null }]),
      sql.query("select count(*)::int as count from leads").catch(() => [{ count: null }]),
      sql.query("select count(*)::int as count from consultants").catch(() => [{ count: null }]),
      sql.query("select count(*)::int as count from media_objects").catch(() => [{ count: null }]),
      sql.query("select count(*)::int as count from admin_tasks").catch(() => [{ count: null }]),
    ]),
  ]);

  const taskStats = results[0];
  const propertyStats = results[1];
  const duplicateOwnerGroups = results[2];
  const duplicateTitleGroups = results[3];
  const staleProperties = results[4];
  const expiredFeatured = results[5];
  const recentActivity = results[6];
  const tableHealth = results[7];
  const p = propertyStats[0] ?? {};
  const t = taskStats[0] ?? {};

  function normalizeDuplicate(rows: Record<string, unknown>[], kind: "owner" | "title") {
    return rows.map((row) => ({
      kind,
      key: kind === "owner" ? String(row.owner_phone ?? "") : String(row.title_key ?? ""),
      label: kind === "owner"
        ? "مالک/تلفن مشترک · " + String(row.owner_phone ?? "")
        : "عنوان مشترک · " + String(row.title ?? ""),
      neighborhood: String(row.neighborhood ?? ""),
      fileCount: Number(row.file_count) || 0,
      files: Array.isArray(row.files)
        ? row.files.map((file) => ({ id: String(file.id), slug: String(file.slug), title: String(file.title) }))
        : [],
    }));
  }

  const duplicateGroups = normalizeDuplicate(duplicateOwnerGroups, "owner")
    .concat(normalizeDuplicate(duplicateTitleGroups, "title"))
    .sort((a, b) => b.fileCount - a.fileCount)
    .slice(0, 18);

  return {
    tasks: { open: Number(t.open) || 0, overdue: Number(t.overdue) || 0, today: Number(t.today) || 0, next7: Number(t.next7) || 0 },
    propertyHealth: {
      total: Number(p.total) || 0,
      published: Number(p.published) || 0,
      withoutImages: Number(p.without_images) || 0,
      incomplete: Number(p.incomplete) || 0,
      stale: Number(p.stale) || 0,
      expiredFeatured: Number(p.expired_featured) || 0,
    },
    staleProperties: staleProperties.map((row) => ({
      id: String(row.id), slug: String(row.slug), title: String(row.title ?? ""),
      neighborhood: String(row.neighborhood ?? ""), updatedAt: new Date(String(row.updated_at)).toISOString(),
    })),
    expiredFeatured: expiredFeatured.map((row) => ({
      id: String(row.id), slug: String(row.slug), title: String(row.title ?? ""),
      featuredUntil: new Date(String(row.featured_until)).toISOString(),
    })),
    duplicateGroups,
    recentActivity: recentActivity.map((row) => ({
      source: String(row.source), itemId: String(row.item_id), event: String(row.event_name),
      title: String(row.title ?? ""), createdAt: new Date(String(row.created_at)).toISOString(),
    })),
    system: {
      database: "connected",
      counts: {
        properties: Number(tableHealth[0]?.[0]?.count) || 0,
        leads: Number(tableHealth[1]?.[0]?.count) || 0,
        consultants: Number(tableHealth[2]?.[0]?.count) || 0,
        media: Number(tableHealth[3]?.[0]?.count) || 0,
        tasks: Number(tableHealth[4]?.[0]?.count) || 0,
      },
      generatedAt: new Date().toISOString(),
    },
  };
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  await requireAdmin(event);

  const body = (await readBody(event).catch(() => ({}))) as {
    action?: "summary" | "list_tasks" | "create_task" | "update_task" | "delete_task";
    id?: string;
    title?: string;
    description?: string;
    status?: TaskStatus;
    priority?: Priority;
    dueAt?: string | null;
    assignee?: string;
    entityType?: string;
    entityId?: string | null;
  };

  if (dbSource === "unconfigured") {
    return {
      tasks: { open: 0, overdue: 0, today: 0, next7: 0, items: [] },
      propertyHealth: { total: 0, published: 0, withoutImages: 0, incomplete: 0, stale: 0, expiredFeatured: 0 },
      staleProperties: [], expiredFeatured: [], duplicateGroups: [], recentActivity: [],
      system: { database: "unconfigured", counts: {}, generatedAt: new Date().toISOString() },
    };
  }

  const sql = await getSql();
  const action = body.action ?? "summary";

  if (action === "create_task") {
    const title = cleanText(body.title, 180);
    if (!title) throw createError({ statusCode: 400, statusMessage: "عنوان وظیفه را وارد کنید." });
    const status = TASK_STATUSES.includes(body.status as TaskStatus) ? body.status as TaskStatus : "open";
    const priority = PRIORITIES.includes(body.priority as Priority) ? body.priority as Priority : "normal";
    const dueAt = nullableDate(body.dueAt);
    const rows = await sql.query(
      "insert into admin_tasks(id,title,description,status,priority,due_at,assignee,entity_type,entity_id) " +
      "values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *",
      [crypto.randomUUID(), title, cleanText(body.description, 1200), status, priority, dueAt,
       cleanText(body.assignee, 100), cleanText(body.entityType, 40), body.entityId == null ? null : cleanText(body.entityId, 160)]
    );
    return { task: serializeTask(rows[0]) };
  }

  if (action === "update_task") {
    const id = cleanText(body.id, 160);
    if (!id) throw createError({ statusCode: 400, statusMessage: "شناسه وظیفه نامعتبر است." });
    const existing = (await sql.query<Record<string, unknown>>("select * from admin_tasks where id=$1 limit 1", [id]))[0];
    if (!existing) throw createError({ statusCode: 404, statusMessage: "وظیفه پیدا نشد." });
    const status = TASK_STATUSES.includes(body.status as TaskStatus) ? body.status as TaskStatus : String(existing.status) as TaskStatus;
    const priority = PRIORITIES.includes(body.priority as Priority) ? body.priority as Priority : String(existing.priority) as Priority;
    const dueAt = body.dueAt !== undefined ? nullableDate(body.dueAt) : (existing.due_at == null ? null : new Date(String(existing.due_at)).toISOString());
    const rows = await sql.query(
      "update admin_tasks set title=$2, description=$3, status=$4, priority=$5, due_at=$6, assignee=$7, entity_type=$8, entity_id=$9, updated_at=current_timestamp " +
      "where id=$1 returning *",
      [id, body.title === undefined ? String(existing.title ?? "") : cleanText(body.title, 180),
       body.description === undefined ? String(existing.description ?? "") : cleanText(body.description, 1200),
       status, priority, dueAt,
       body.assignee === undefined ? String(existing.assignee ?? "") : cleanText(body.assignee, 100),
       body.entityType === undefined ? String(existing.entity_type ?? "") : cleanText(body.entityType, 40),
       body.entityId === undefined ? (existing.entity_id == null ? null : String(existing.entity_id)) : (body.entityId == null ? null : cleanText(body.entityId, 160))]
    );
    return { task: serializeTask(rows[0]) };
  }

  if (action === "delete_task") {
    const id = cleanText(body.id, 160);
    if (!id) throw createError({ statusCode: 400, statusMessage: "شناسه وظیفه نامعتبر است." });
    const rows = await sql.query("delete from admin_tasks where id=$1 returning id", [id]);
    if (!rows[0]) throw createError({ statusCode: 404, statusMessage: "وظیفه پیدا نشد." });
    return { success: true };
  }

  if (action === "list_tasks") {
    const rows = await sql.query<Record<string, unknown>>(
      "select * from admin_tasks where status <> 'cancelled' order by " +
      "case when status='open' and due_at is not null and due_at < current_timestamp then 0 " +
      "when status='open' and due_at is not null then 1 else 2 end, due_at asc nulls last, created_at desc limit 300"
    );
    return { tasks: rows.map(serializeTask) };
  }

  return loadSummary(sql);
});
