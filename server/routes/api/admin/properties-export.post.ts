import { createError, defineEventHandler, getCookie, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { propertyExportCsv } from "@/lib/property-export";

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  assertSameOrigin(event);
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  }
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "property.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی خروجی گرفتن از فایل‌ها برای این حساب فعال نیست." });
  }
  if (dbSource === "unconfigured") {
    setResponseHeader(event, "content-type", "text/csv; charset=utf-8");
    return "\uFEFF";
  }

  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>(
    "select id, title, slug, status, featured, featured_until, transaction_type, property_type, " +
    "neighborhood, address, area_m2, bedrooms, bathrooms, floor, floor_label, total_floors, " +
    "built_year, parking, elevator, storage, painted, wallpaper, orientation, convertible, price, deposit, rent, " +
    "contact_name, contact_phone, owner_name, owner_phone, owner_info, created_at, updated_at " +
    "from properties order by created_at desc",
  );

  setResponseHeader(event, "content-type", "text/csv; charset=utf-8");
  setResponseHeader(event, "content-disposition", "attachment; filename=\"hirmand-properties.csv\"");
  return propertyExportCsv(rows);
});
