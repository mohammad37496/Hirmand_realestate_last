import { createError, defineEventHandler, getQuery, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "public, max-age=60, s-maxage=300");
  if (dbSource === "unconfigured") throw createError({ statusCode: 503, statusMessage: "اشتراک آنلاین در حال حاضر فعال نیست." });

  const query = getQuery(event) as Record<string, unknown>;
  const token = String(query.token ?? "").trim();
  if (!/^[a-f0-9]{40,60}$/i.test(token)) throw createError({ statusCode: 422, statusMessage: "لینک اشتراکی نامعتبر است." });

  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>(
    "select token,title,property_slugs,created_at,expires_at,view_count from shared_shortlists where token=$1 and expires_at > current_timestamp limit 1",
    [token],
  );
  const row = rows[0];
  if (!row) throw createError({ statusCode: 404, statusMessage: "این لینک اشتراکی منقضی یا حذف شده است." });

  const slugs = Array.isArray(row.property_slugs)
    ? row.property_slugs.filter((item): item is string => typeof item === "string").slice(0, 6)
    : [];

  const availableRows = slugs.length
    ? await sql.query<{ slug: string }>("select slug from properties where deleted_at is null and status='published' and (unpublish_at is null or unpublish_at > current_timestamp) and slug=any($1::text[])",[slugs])
    : [];
  const available = availableRows.map((item) => String(item.slug));

  await sql.query("update shared_shortlists set view_count=view_count+1 where token=$1",[token]).catch(()=>{});

  return {
    ok: true,
    token,
    title: String(row.title || "سبد منتخب هیرمند"),
    createdAt: new Date(String(row.created_at)).toISOString(),
    expiresAt: new Date(String(row.expires_at)).toISOString(),
    viewCount: Number(row.view_count || 0) + 1,
    slugs: available,
  };
});
