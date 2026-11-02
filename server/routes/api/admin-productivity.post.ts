import { createError, defineEventHandler, getCookie, readBody, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql, withSqlTransaction } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { loadAdminProductivityTableCounts } from "@/lib/admin-productivity-table-counts";
import { lockActivePropertyForTask, lockTaskLeadReferences } from "@/lib/admin-productivity-task-association";

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
      "count(*) filter (where status='published' and deleted_at is null and featured=true and featured_until is not null and featured_until < current_timestamp)::int as expired_featured " +
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
      "where status='published' and deleted_at is null and featured=true and featured_until is not null and featured_until < current_timestamp " +
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
    loadAdminProductivityTableCounts((statement) => sql.query<{ count: number | string | null }>(statement)),
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
    available: true,
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
      counts: tableHealth,
      generatedAt: new Date().toISOString(),
    },
  };
}

async function validateTaskEntityAssociation(
  sql: Awaited<ReturnType<typeof getSql>>,
  entityType: string,
  entityId: string | null,
) {
  if (!entityType) {
    if (entityId) throw createError({ statusCode: 400, statusMessage: "نوع موجودیت مرتبط با وظیفه مشخص نشده است." });
    return;
  }
  if (entityType !== "lead" && entityType !== "property") throw createError({ statusCode: 400, statusMessage: "نوع ارتباط وظیفه معتبر نیست." });
  if (!entityId) throw createError({ statusCode: 400, statusMessage: "شناسه موجودیت مرتبط با وظیفه الزامی است." });
  const rows = entityType === "lead"
    ? await sql.query<{ id: string }>("select id from leads where id=$1 limit 1", [entityId])
    : await sql.query<{ id: string }>("select id from properties where id=$1 and deleted_at is null and status <> 'archived' limit 1", [entityId]);
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: entityType === "lead" ? "لید مرتبط با وظیفه پیدا نشد." : "فایل ملک مرتبط با وظیفه پیدا نشد." });
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  await requireAdmin(event);

  const body = (await readBody(event).catch(() => ({}))) as {
    action?: "summary" | "list_tasks" | "list_leads" | "list_properties" | "create_task" | "update_task" | "delete_task";
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
  const action = body.action ?? "summary";

  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده در دسترس نیست؛ مرکز بهره‌وری و عملیات وظایف قابل استفاده نیست." });
  }

  const sql = await getSql();

  if (action === "create_task") {
    const title = cleanText(body.title, 180);
    if (!title) throw createError({ statusCode: 400, statusMessage: "عنوان وظیفه را وارد کنید." });
    if (body.status !== undefined && !TASK_STATUSES.includes(body.status as TaskStatus)) throw createError({ statusCode: 400, statusMessage: "وضعیت وظیفه نامعتبر است." });
    if (body.priority !== undefined && !PRIORITIES.includes(body.priority as Priority)) throw createError({ statusCode: 400, statusMessage: "اولویت وظیفه نامعتبر است." });
    const status = body.status === undefined ? "open" : body.status as TaskStatus;
    const priority = body.priority === undefined ? "normal" : body.priority as Priority;
    const dueAt = nullableDate(body.dueAt);
    const entityType = cleanText(body.entityType, 40);
    const entityId = body.entityId == null ? null : cleanText(body.entityId, 160);
    await validateTaskEntityAssociation(sql, entityType, entityId);
    const rows = await withSqlTransaction(async (tx) => {
      if (entityType === "lead" && entityId) {
        const lock = await lockTaskLeadReferences(tx, [entityId], entityId);
        if (lock.kind === "missing") throw createError({ statusCode: 404, statusMessage: "لید مرتبط با وظیفه پیدا نشد." });
        if (lock.kind === "merged") throw createError({ statusCode: 409, statusMessage: `این لید ادغام شده است؛ وظیفه را به لید اصلی ${lock.canonicalId} متصل کنید.` });
        if (lock.kind === "inactive") throw createError({ statusCode: 409, statusMessage: "اتصال وظیفه به لید بسته یا هرزنامه مجاز نیست." });
      }
      if (entityType === "property" && entityId && !await lockActivePropertyForTask(tx, entityId)) return [];
      return tx.query(
        "insert into admin_tasks(id,title,description,status,priority,due_at,assignee,entity_type,entity_id) " +
        "select $1,$2,$3,$4,$5,$6,$7,$8,$9 where ($8 <> 'lead' or exists(select 1 from leads where id=$9 and merged_into_lead_id is null and status not in ('closed','spam'))) and ($8 <> 'property' or exists(select 1 from properties where id=$9 and deleted_at is null and status <> 'archived')) returning *",
        [crypto.randomUUID(), title, cleanText(body.description, 1200), status, priority, dueAt,
         cleanText(body.assignee, 100), entityType, entityId]
      );
    });
    if (!rows[0]) throw createError({ statusCode: 404, statusMessage: "موجودیت مرتبط با وظیفه هنگام ثبت دیگر در دسترس نیست." });
    return { task: serializeTask(rows[0]) };
  }

  if (action === "update_task") {
    const id = cleanText(body.id, 160);
    if (!id) throw createError({ statusCode: 400, statusMessage: "شناسه وظیفه نامعتبر است." });
    const existing = (await sql.query<Record<string, unknown>>("select * from admin_tasks where id=$1 limit 1", [id]))[0];
    if (!existing) throw createError({ statusCode: 404, statusMessage: "وظیفه پیدا نشد." });
    if (body.status !== undefined && !TASK_STATUSES.includes(body.status as TaskStatus)) throw createError({ statusCode: 400, statusMessage: "وضعیت وظیفه نامعتبر است." });
    if (body.priority !== undefined && !PRIORITIES.includes(body.priority as Priority)) throw createError({ statusCode: 400, statusMessage: "اولویت وظیفه نامعتبر است." });
    const status = body.status === undefined ? String(existing.status) as TaskStatus : body.status as TaskStatus;
    const priority = body.priority === undefined ? String(existing.priority) as Priority : body.priority as Priority;
    const dueAt = body.dueAt !== undefined ? nullableDate(body.dueAt) : (existing.due_at == null ? null : new Date(String(existing.due_at)).toISOString());
    const title = body.title === undefined ? String(existing.title ?? "") : cleanText(body.title, 180);
    if (!title) throw createError({ statusCode: 400, statusMessage: "عنوان وظیفه نمی‌تواند خالی باشد." });
    const entityType = body.entityType === undefined ? String(existing.entity_type ?? "") : cleanText(body.entityType, 40);
    const entityId = body.entityId === undefined ? (existing.entity_id == null ? null : String(existing.entity_id)) : (body.entityId == null ? null : cleanText(body.entityId, 160));
    await validateTaskEntityAssociation(sql, entityType, entityId);
    const rows = await withSqlTransaction(async (tx) => {
      const leadReferences = [
        String(existing.entity_type ?? "") === "lead" ? String(existing.entity_id ?? "") : "",
        entityType === "lead" ? String(entityId ?? "") : "",
      ];
      const associationChanged = entityType !== String(existing.entity_type ?? "") || String(entityId ?? "") !== String(existing.entity_id ?? "");
      const lock = await lockTaskLeadReferences(tx, leadReferences, associationChanged && entityType === "lead" ? entityId : null);
      if (lock.kind === "missing") throw createError({ statusCode: 404, statusMessage: "لید مرتبط با وظیفه پیدا نشد." });
      if (lock.kind === "merged") throw createError({ statusCode: 409, statusMessage: `این لید ادغام شده است؛ وظیفه را به لید اصلی ${lock.canonicalId} متصل کنید.` });
      if (lock.kind === "inactive") throw createError({ statusCode: 409, statusMessage: "اتصال وظیفه به لید بسته یا هرزنامه مجاز نیست." });
      if (entityType === "property" && entityId && !await lockActivePropertyForTask(tx, entityId)) return [];
      const current = (await tx.query<Record<string, unknown>>("select entity_type,entity_id from admin_tasks where id=$1 for update", [id]))[0];
      if (!current || String(current.entity_type ?? "") !== String(existing.entity_type ?? "") || String(current.entity_id ?? "") !== String(existing.entity_id ?? "")) {
        return [];
      }
      return tx.query(
        "update admin_tasks set title=$2, description=$3, status=$4, priority=$5, due_at=$6, assignee=$7, entity_type=$8, entity_id=$9, updated_at=current_timestamp " +
        "where id=$1 and ($8 <> 'lead' or not $10::boolean or exists(select 1 from leads where id=$9 and merged_into_lead_id is null and status not in ('closed','spam'))) and ($8 <> 'property' or exists(select 1 from properties where id=$9 and deleted_at is null and status <> 'archived')) returning *",
        [id, title,
         body.description === undefined ? String(existing.description ?? "") : cleanText(body.description, 1200),
         status, priority, dueAt,
         body.assignee === undefined ? String(existing.assignee ?? "") : cleanText(body.assignee, 100),
         entityType, entityId, associationChanged && entityType === "lead"]
      );
    });
    if (!rows[0]) throw createError({ statusCode: 404, statusMessage: "وظیفه هنگام به‌روزرسانی پیدا نشد." });
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
    return { available: true, tasks: rows.map(serializeTask) };
  }

  if (action === "list_leads") {
    const rows = await sql.query<Record<string, unknown>>(
      "select id,name,phone,status from leads where status not in ('closed','spam') order by created_at desc limit 250",
    );
    return { available: true, leads: rows.map((row) => ({ id: String(row.id), name: String(row.name ?? "مشتری"), phone: String(row.phone ?? ""), status: String(row.status ?? "new") })) };
  }

  if (action === "list_properties") {
    const rows = await sql.query<Record<string, unknown>>(
      "select id,slug,title,neighborhood,status from properties where deleted_at is null and status <> 'archived' order by updated_at desc limit 250",
    );
    return { available: true, properties: rows.map((row) => ({ id: String(row.id), slug: String(row.slug ?? ""), title: String(row.title ?? "فایل ملک"), neighborhood: String(row.neighborhood ?? ""), status: String(row.status ?? "draft") })) };
  }

  return loadSummary(sql);
});
