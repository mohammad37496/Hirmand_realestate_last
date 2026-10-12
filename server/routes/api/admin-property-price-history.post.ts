import { createError, defineEventHandler, getCookie, readBody, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

const clean = (value: unknown, max = 120) => typeof value === "string" ? value.trim().slice(0, max) : "";
function num(value: unknown) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function diffPercent(before: number | null, after: number | null) {
  if (before == null || after == null || before <= 0) return null;
  return Math.round(((after - before) / before) * 1000) / 10;
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(token))) throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "property.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی تاریخچه قیمت برای این حساب فعال نیست." });
  }
  if (dbSource === "unconfigured") return { property: null, history: [] };

  const body = (await readBody(event).catch(() => ({}))) as Record<string, unknown>;
  const propertyId = clean(body.propertyId);
  if (!propertyId) throw createError({ statusCode: 400, statusMessage: "شناسه فایل مشخص نیست." });
  const sql = await getSql();
  const propertyRows = await sql.query<Record<string, unknown>>(
    "select id,title,price,deposit,rent,price_changed_at,price_drop_percent from properties where id=$1 limit 1",
    [propertyId],
  );
  if (!propertyRows[0]) throw createError({ statusCode: 404, statusMessage: "فایل پیدا نشد." });

  const rows = await sql.query<Record<string, unknown>>(
    "select id,price_before,price_after,deposit_before,deposit_after,rent_before,rent_after,note,created_by,created_at from admin_property_price_history where property_id=$1 order by created_at desc,id desc limit 100",
    [propertyId],
  );
  return {
    property: {
      id: String(propertyRows[0].id),
      title: String(propertyRows[0].title),
      price: num(propertyRows[0].price),
      deposit: num(propertyRows[0].deposit),
      rent: num(propertyRows[0].rent),
      priceChangedAt: propertyRows[0].price_changed_at ? new Date(String(propertyRows[0].price_changed_at)).toISOString() : null,
      priceDropPercent: num(propertyRows[0].price_drop_percent),
    },
    history: rows.map((row) => ({
      id: Number(row.id),
      priceBefore: num(row.price_before),
      priceAfter: num(row.price_after),
      depositBefore: num(row.deposit_before),
      depositAfter: num(row.deposit_after),
      rentBefore: num(row.rent_before),
      rentAfter: num(row.rent_after),
      pricePercent: diffPercent(num(row.price_before), num(row.price_after)),
      depositPercent: diffPercent(num(row.deposit_before), num(row.deposit_after)),
      rentPercent: diffPercent(num(row.rent_before), num(row.rent_after)),
      note: String(row.note ?? ""),
      createdBy: String(row.created_by ?? ""),
      createdAt: new Date(String(row.created_at)).toISOString(),
    })),
  };
});
