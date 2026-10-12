import { createError, defineEventHandler, getCookie, getHeader, readBody, setResponseHeader, type H3Event } from "h3";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { clearPropertyReadCache } from "@/lib/property-read-cache.server";

const bodySchema = z.object({
  action: z.enum(["scan", "verify"]),
  propertyId: z.string().trim().min(1).max(120).optional(),
});

type MediaIssue = {
  propertyId: string;
  slug: string;
  title: string;
  neighborhood: string;
  url: string;
  status: number | null;
  reason: string;
};

function toPublicUrl(event: H3Event, value: string) {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const proto = getHeader(event, "x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const host = getHeader(event, "x-forwarded-host") || getHeader(event, "host") || "www.hirmandrealestate.ir";
  return new URL(trimmed, proto + "://" + host).toString();
}

async function fetchWithTimeout(url: string, timeoutMs = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const head = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.6" },
    });
    if (head.status !== 405 && head.status !== 501) return head;
  } finally {
    clearTimeout(timer);
  }

  const fallbackController = new AbortController();
  const fallbackTimer = setTimeout(() => fallbackController.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: fallbackController.signal,
      headers: { accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.6" },
    });
  } finally {
    clearTimeout(fallbackTimer);
  }
}

async function inspectMedia(event: H3Event, item: { propertyId: string; slug: string; title: string; neighborhood: string; url: string }): Promise<MediaIssue | null> {
  let response: Response | null = null;
  try {
    const absolute = toPublicUrl(event, item.url);
    response = await fetchWithTimeout(absolute);
    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    const looksImage = /\.(avif|gif|jpe?g|png|webp|svg)(?:$|[?#])/i.test(absolute);
    const looksVideo = /\.(mp4|webm|mov|m4v|ogg)(?:$|[?#])/i.test(absolute);
    const isMediaType = contentType.startsWith("image/") || contentType.startsWith("video/");
    const genericType = contentType === "" || contentType === "application/octet-stream" || contentType === "binary/octet-stream";
    const goodType = isMediaType || (genericType && (looksImage || looksVideo));
    if (!response.ok) {
      return { ...item, status: response.status, reason: "پاسخ HTTP " + response.status };
    }
    if (!goodType) {
      return { ...item, status: response.status, reason: contentType ? "نوع پاسخ رسانه‌ای نیست (" + contentType + ")" : "نوع محتوای پاسخ مشخص نیست" };
    }
    return null;
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError"
      ? "مهلت پاسخ تمام شد"
      : "رسانه قابل دسترسی نیست";
    return { ...item, status: null, reason };
  } finally {
    try { response?.body?.cancel(); } catch { /* no-op */ }
  }
}

async function scanMedia(event: H3Event, rows: Array<Record<string, unknown>>) {
  const queue: Array<{ propertyId: string; slug: string; title: string; neighborhood: string; url: string }> = [];
  for (const row of rows) {
    const images = Array.isArray(row.images) ? row.images : [];
    for (const image of images.slice(0, 4)) {
      if (typeof image !== "string" || !image.trim()) continue;
      queue.push({
        propertyId: String(row.id),
        slug: String(row.slug),
        title: String(row.title ?? ""),
        neighborhood: String(row.neighborhood ?? ""),
        url: image,
      });
    }
  }

  const issues: MediaIssue[] = [];
  let cursor = 0;
  const workers = Array.from({ length: 8 }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= queue.length) return;
      const issue = await inspectMedia(event, queue[index]);
      if (issue) issues.push(issue);
    }
  });
  await Promise.all(workers);
  return { checked: queue.length, issues: issues.slice(0, 60) };
}

function moneyNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  assertSameOrigin(event);
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  }
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "property.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی بررسی کیفیت فایل‌های ملک برای این حساب فعال نیست." });
  }
  if (dbSource === "unconfigured") {
    return { success: true, media: { checked: 0, issues: [] }, priceAnomalies: [], verificationDue: [] };
  }

  const parsedBody = bodySchema.safeParse(await readBody(event).catch(() => ({})));
  if (!parsedBody.success) {
    throw createError({ statusCode: 422, statusMessage: parsedBody.error.issues[0]?.message || "درخواست بررسی کیفیت فایل معتبر نیست." });
  }
  const body = parsedBody.data;
  const sql = await getSql();

  if (body.action === "verify") {
    if (!body.propertyId) throw createError({ statusCode: 400, statusMessage: "شناسه فایل مشخص نیست." });
    const rows = await sql.query<{ id: string; last_verified_at: string; last_verified_by: string }>(
      "update properties set last_verified_at=current_timestamp, last_verified_by='هیرمند' where id=$1 and status='published' returning id,last_verified_at,last_verified_by",
      [body.propertyId],
    );
    if (!rows[0]) throw createError({ statusCode: 404, statusMessage: "فایل منتشرشده پیدا نشد." });
    clearPropertyReadCache();
    return {
      success: true,
      propertyId: String(rows[0].id),
      lastVerifiedAt: new Date(String(rows[0].last_verified_at)).toISOString(),
      lastVerifiedBy: String(rows[0].last_verified_by),
    };
  }

  const rows = await sql.query<Record<string, unknown>>(
    "select id,slug,title,neighborhood,transaction_type,property_type,price,area_m2,images,last_verified_at,last_verified_by,updated_at from properties where status='published' order by updated_at desc limit 80",
  );
  const media = await scanMedia(event, rows);

  const priceRows = await sql.query<Record<string, unknown>>(
    `with base as (
       select
         p.id,p.slug,p.title,p.neighborhood,p.property_type,p.transaction_type,
         nullif(p.price::text,'')::numeric as price,
         p.area_m2,
         case when p.area_m2 > 0 and p.price is not null and p.price > 0 then p.price::numeric / p.area_m2 end as price_per_m2
       from properties p
       where p.status='published' and p.transaction_type in ('buy','sell')
     ),
     stats as (
       select neighborhood,property_type,
              percentile_cont(0.5) within group (order by price_per_m2) as median_per_m2,
              count(*) filter (where price_per_m2 is not null)::int as group_count
       from base
       where price_per_m2 is not null
       group by neighborhood,property_type
     )
     select b.id,b.slug,b.title,b.neighborhood,b.property_type,b.transaction_type,
            b.price,b.area_m2,b.price_per_m2,s.median_per_m2,s.group_count,
            case
              when b.price_per_m2 is null then 'missing'
              when s.group_count >= 3 and (b.price_per_m2 < s.median_per_m2 * 0.50 or b.price_per_m2 > s.median_per_m2 * 1.70) then 'outlier'
              else null
            end as issue
     from base b
     left join stats s on s.neighborhood=b.neighborhood and s.property_type=b.property_type
     where b.price_per_m2 is null
        or (s.group_count >= 3 and (b.price_per_m2 < s.median_per_m2 * 0.50 or b.price_per_m2 > s.median_per_m2 * 1.70))
     order by case when b.price_per_m2 is null then 0 else 1 end,
              abs(coalesce(b.price_per_m2 / nullif(s.median_per_m2,0), 1) - 1) desc
     limit 40`,
  );

  const now = Date.now();
  const verificationDue = rows
    .filter((row) => {
      if (!row.last_verified_at) return true;
      const timestamp = Date.parse(String(row.last_verified_at));
      return !Number.isFinite(timestamp) || now - timestamp > 14 * 24 * 60 * 60 * 1000;
    })
    .slice(0, 30)
    .map((row) => ({
      propertyId: String(row.id),
      slug: String(row.slug),
      title: String(row.title ?? ""),
      neighborhood: String(row.neighborhood ?? ""),
      lastVerifiedAt: row.last_verified_at ? new Date(String(row.last_verified_at)).toISOString() : null,
      lastVerifiedBy: row.last_verified_by ? String(row.last_verified_by) : null,
    }));

  return {
    success: true,
    scannedAt: new Date().toISOString(),
    media,
    priceAnomalies: priceRows.map((row) => {
      const current = moneyNumber(row.price_per_m2);
      const median = moneyNumber(row.median_per_m2);
      return {
        propertyId: String(row.id),
        slug: String(row.slug),
        title: String(row.title ?? ""),
        neighborhood: String(row.neighborhood ?? ""),
        areaM2: row.area_m2 == null ? null : Number(row.area_m2),
        price: row.price == null ? null : Number(row.price),
        pricePerM2: current,
        neighborhoodMedianPerM2: median,
        groupCount: Number(row.group_count) || 0,
        issue: String(row.issue ?? "outlier"),
      };
    }),
    verificationDue,
  };
});
