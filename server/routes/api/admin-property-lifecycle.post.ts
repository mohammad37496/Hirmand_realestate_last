import { createError, defineEventHandler, getCookie, readBody, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";

async function requireAdmin(event: H3Event) {
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست. دوباره وارد پنل شوید." });
  }
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "property.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی چرخه عمر فایل‌های ملک برای این حساب فعال نیست." });
  }
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  await requireAdmin(event);

  const body = (await readBody(event).catch(() => ({}))) as {
    action?: "list" | "createTasks";
  };

  if (dbSource === "unconfigured") return { items: [], createdTasks: 0 };

  const sql = await getSql();
  const staleDays = 14;
  const criticalDays = 30;

  const rows = await sql.query<Record<string, unknown>>(
    `select
       p.id,
       p.slug,
       p.title,
       p.transaction_type,
       p.property_type,
       p.neighborhood,
       p.area_m2,
       p.bedrooms,
       p.price,
       p.deposit,
       p.rent,
       p.images,
       p.description,
       p.updated_at,
       p.published_at,
       p.contact_name,
       p.availability_status,
       greatest(
         0,
         floor(extract(epoch from (current_timestamp - coalesce(p.updated_at, p.created_at))) / 86400)
       )::int as stale_days,
       exists (
         select 1 from admin_tasks t
         where t.entity_type='property'
           and t.entity_id=p.id
           and t.status='open'
           and t.title like 'تازه‌سازی فایل:%'
       ) as has_open_task
     from properties p
     where p.status='published'
       and (
         p.updated_at < current_timestamp - interval '14 days'
         or p.published_at < current_timestamp - interval '30 days'
         or nullif(trim(p.description),'') is null
         or p.area_m2 is null
         or (
           p.transaction_type in ('buy','sell')
           and p.price is null
         )
         or (
           p.transaction_type in ('rent','mortgage')
           and p.deposit is null
           and p.rent is null
         )
         or jsonb_array_length(coalesce(p.images,'[]'::jsonb)) = 0
       )
     order by
       case when p.updated_at < current_timestamp - interval '30 days' then 0 else 1 end,
       p.updated_at asc nulls first
     limit 80`,
  );

  const items = rows.map((row) => {
    const missing: string[] = [];
    if (!row.area_m2) missing.push("متراژ");
    if (!String(row.description ?? "").trim()) missing.push("توضیحات");
    if (String(row.transaction_type) === "buy" || String(row.transaction_type) === "sell") {
      if (row.price == null) missing.push("قیمت");
    } else if (row.deposit == null && row.rent == null) {
      missing.push("رهن/اجاره");
    }
    if (!Array.isArray(row.images) || row.images.length === 0) missing.push("تصویر");

    const staleDays = Number(row.stale_days) || 0;
    const priority = staleDays >= criticalDays || missing.length >= 2 ? "urgent" : "high";
    return {
      id: String(row.id),
      slug: String(row.slug),
      title: String(row.title),
      neighborhood: String(row.neighborhood ?? ""),
      contactName: String(row.contact_name ?? ""),
      transactionType: String(row.transaction_type),
      propertyType: String(row.property_type),
      availabilityStatus: String(row.availability_status ?? "available"),
      staleDays,
      missing,
      priority,
      hasOpenTask: Boolean(row.has_open_task),
      updatedAt: row.updated_at == null ? null : new Date(String(row.updated_at)).toISOString(),
      publishedAt: row.published_at == null ? null : new Date(String(row.published_at)).toISOString(),
    };
  });

  if (body.action === "createTasks") {
    let createdTasks = 0;
    for (const item of items) {
      if (item.hasOpenTask) continue;
      await sql.query(
        `insert into admin_tasks
          (id,title,description,status,priority,due_at,assignee,entity_type,entity_id)
         values($1,$2,$3,'open',$4,current_timestamp + interval '24 hours',$5,'property',$6)`,
        [
          crypto.randomUUID(),
          "تازه‌سازی فایل: " + item.title,
          "این فایل " + item.staleDays + " روز است که نیاز به بررسی دارد. موارد ناقص: " + (item.missing.join("، ") || "بررسی اطلاعات و قیمت"),
          item.priority,
          item.contactName,
          item.id,
        ],
      );
      createdTasks += 1;
    }
    return { items, createdTasks };
  }

  return { items, createdTasks: 0 };
});
