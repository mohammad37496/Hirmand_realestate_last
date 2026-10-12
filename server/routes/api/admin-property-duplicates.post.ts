import { createError, defineEventHandler, getCookie, readBody, setResponseHeader } from "h3";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

const schema = z.object({
  id: z.string().trim().max(120).optional(),
  title: z.string().trim().min(3).max(180),
  transactionType: z.enum(["buy", "sell", "rent", "mortgage"]),
  propertyType: z.enum(["apartment", "villa", "office", "heritage", "land", "commercial"]),
  neighborhood: z.string().trim().min(2).max(80),
  areaM2: z.number().int().min(0).max(100000).nullable().optional(),
  price: z.number().int().min(0).max(999999999999999).nullable().optional(),
  deposit: z.number().int().min(0).max(999999999999999).nullable().optional(),
  rent: z.number().int().min(0).max(999999999999999).nullable().optional(),
});

function comparablePrice(input: z.infer<typeof schema>) {
  if (input.transactionType === "rent") return input.rent ?? input.deposit ?? null;
  if (input.transactionType === "mortgage") return input.deposit ?? null;
  return input.price ?? null;
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  }
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "property.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی بررسی فایل‌های مشابه برای این حساب فعال نیست." });
  }

  if (dbSource === "unconfigured") return { matches: [] };

  const parsed = schema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: "اطلاعات فایل برای بررسی کامل نیست." });

  const sql = await getSql();
  const targetPrice = comparablePrice(parsed.data);
  const rows = await sql.query<Record<string, unknown>>(
    "select id, slug, title, transaction_type, property_type, neighborhood, area_m2, price, deposit, rent, status, availability_status, " +
    "case when transaction_type='rent' then coalesce(rent,deposit) when transaction_type='mortgage' then deposit else price end as comparable_price " +
    "from properties where status in ('published','draft') and ($1::text is null or id <> $1) and transaction_type=$2 and property_type=$3 and lower(trim(neighborhood))=lower(trim($4)) " +
    "and (" +
      "($5::int is not null and area_m2 is not null and abs(area_m2-$5) <= greatest(10, $5*0.15)) " +
      "or lower(regexp_replace(coalesce(title,''),'[^[:alnum:]آ-ی]+','','g')) like '%' || lower(regexp_replace($6,'[^[:alnum:]آ-ی]+','','g')) || '%' " +
      "or lower(regexp_replace($6,'[^[:alnum:]آ-ی]+','','g')) like '%' || lower(regexp_replace(coalesce(title,''),'[^[:alnum:]آ-ی]+','','g')) || '%' " +
      "or ($7::numeric is not null and (case when transaction_type='rent' then coalesce(rent,deposit) when transaction_type='mortgage' then deposit else price end) is not null and abs((case when transaction_type='rent' then coalesce(rent,deposit) when transaction_type='mortgage' then deposit else price end)-$7) <= greatest(1000000, $7*0.08))" +
    ") order by case when status='published' then 0 else 1 end, updated_at desc limit 8",
    [
      parsed.data.id || null,
      parsed.data.transactionType,
      parsed.data.propertyType,
      parsed.data.neighborhood,
      parsed.data.areaM2 ?? null,
      parsed.data.title,
      targetPrice,
    ],
  );

  return {
    matches: rows.map((row) => ({
      id: String(row.id),
      slug: String(row.slug),
      title: String(row.title),
      transactionType: String(row.transaction_type),
      propertyType: String(row.property_type),
      neighborhood: String(row.neighborhood),
      areaM2: row.area_m2 == null ? null : Number(row.area_m2),
      comparablePrice: row.comparable_price == null ? null : Number(row.comparable_price),
      status: String(row.status),
      availabilityStatus: String(row.availability_status || "available"),
    })),
  };
});
