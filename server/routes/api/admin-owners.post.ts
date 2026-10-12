import { createError, defineEventHandler, getCookie, readBody, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

async function requireAdmin(event: H3Event) {
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست. دوباره وارد پنل شوید." });
  }
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "property.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی اطلاعات مالکین برای این حساب فعال نیست." });
  }
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  await requireAdmin(event);
  if (dbSource === "unconfigured") return { owners: [] };

  const body = (await readBody(event).catch(() => ({}))) as { action?: "list"; query?: string };
  if ((body.action ?? "list") !== "list") {
    throw createError({ statusCode: 400, statusMessage: "عملیات نامعتبر است." });
  }

  const query = typeof body.query === "string" ? body.query.trim().slice(0, 80) : "";
  const params: unknown[] = [];
  const filter = query
    ? (() => {
        params.push("%" + query + "%");
        return "where coalesce(owner_name,'') ilike $" + params.length + " or coalesce(owner_phone,'') ilike $" + params.length + " or coalesce(owner_info,'') ilike $" + params.length;
      })()
    : "";

  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>(
    `select
       coalesce(nullif(trim(owner_name),''),'بدون نام') as owner_name,
       coalesce(nullif(trim(owner_phone),''),'') as owner_phone,
       count(*)::int as file_count,
       count(*) filter (where status='published')::int as published_count,
       max(updated_at) as last_updated,
       jsonb_agg(jsonb_build_object('id',id,'slug',slug,'title',title,'status',status,'transaction_type',transaction_type,'price',price,'deposit',deposit,'rent',rent) order by updated_at desc) as files
     from properties
     ${filter}
     group by coalesce(nullif(trim(owner_name),''),'بدون نام'), coalesce(nullif(trim(owner_phone),''),'')
     order by file_count desc, last_updated desc
     limit 500`,
    params,
  );

  return {
    owners: rows.map((row) => ({
      name: String(row.owner_name ?? ""),
      phone: String(row.owner_phone ?? ""),
      fileCount: Number(row.file_count) || 0,
      publishedCount: Number(row.published_count) || 0,
      lastUpdated: row.last_updated == null ? null : new Date(String(row.last_updated)).toISOString(),
      files: Array.isArray(row.files)
        ? row.files.map((file) => ({
            id: String(file.id),
            slug: String(file.slug),
            title: String(file.title),
            status: String(file.status),
            transactionType: String(file.transaction_type),
            price: file.price == null ? null : String(file.price),
            deposit: file.deposit == null ? null : String(file.deposit),
            rent: file.rent == null ? null : String(file.rent),
          }))
        : [],
    })),
  };
});
