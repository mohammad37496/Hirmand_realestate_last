import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { dbSource, getSql } from "@/lib/db";
import { createError, defineEventHandler, getCookie, readBody, setResponseHeader } from "h3";

const EVENT_NAMES = [
  "property_view",
  "property_favorite",
  "property_share",
  "property_compare",
  "call_click",
  "whatsapp_click",
  "property_price_watch",
  "visit_request",
  "visit_request_click",
] as const;

type EventName = typeof EVENT_NAMES[number];

function emptyStats() {
  return Object.fromEntries(EVENT_NAMES.map((event) => [event, 0])) as Record<EventName, number>;
}

const TX_LABEL: Record<string, string> = {
  buy: "خرید",
  sell: "فروش",
  rent: "اجاره",
  mortgage: "رهن",
};

const TYPE_LABEL: Record<string, string> = {
  apartment: "آپارتمان",
  villa: "ویلا و باغ",
  office: "اداری",
  heritage: "خانه اصیل",
  land: "زمین",
  commercial: "تجاری",
};

function daysBetween(from: string | Date | null) {
  if (!from) return null;
  const time = new Date(String(from)).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
}

function qualityScore(input: {
  imageCount: number;
  descriptionLength: number;
  neighborhood: string;
  contactName: string;
  contactPhone: string;
  hasPrice: boolean;
  areaM2: number | null;
}) {
  let score = 0;
  if (input.imageCount > 0) score += 25;
  if (input.descriptionLength >= 120) score += 25;
  else if (input.descriptionLength >= 60) score += 12;
  if (input.neighborhood) score += 15;
  if (input.contactName && input.contactPhone) score += 15;
  if (input.hasPrice) score += 15;
  if (input.areaM2 && input.areaM2 > 0) score += 5;
  return Math.min(100, score);
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");

  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({ statusCode: 401, statusMessage: "نیاز به ورود مدیریت دارید." });
  }

  await assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "reports.view")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی گزارش عملکرد فایل برای این حساب فعال نیست." });
  }

  const body = (await readBody(event).catch(() => ({}))) as { propertyId?: unknown };
  const propertyId = typeof body.propertyId === "string" ? body.propertyId.trim().slice(0, 120) : "";
  if (!propertyId) {
    throw createError({ statusCode: 400, statusMessage: "شناسه فایل الزامی است." });
  }

  if (dbSource === "unconfigured") {
    return {
      windowDays: 30,
      property: null,
      events: emptyStats(),
      uniqueVisitors: 0,
      leads: { total: 0, visitRequests: 0, confirmedVisits: 0, completedVisits: 0 },
      conversionRate: 0,
      freshness: { updatedAt: null, publishedAt: null, daysSinceUpdate: null, daysSincePublish: null },
      quality: { score: 0, imageCount: 0, missing: [] },
      market: null,
      leadSources: [],
      recommendations: [],
    };
  }

  const sql = await getSql();

  const propertyRows = await sql.query<{
    id: string;
    slug: string;
    title: string;
    status: string;
    availability_status: string;
    transaction_type: string;
    property_type: string;
    neighborhood: string;
    area_m2: number | string | null;
    price: number | string | null;
    deposit: number | string | null;
    rent: number | string | null;
    description: string | null;
    images: unknown;
    contact_name: string | null;
    contact_phone: string | null;
    updated_at: string | Date;
    published_at: string | Date | null;
  }>(
    "select id::text as id, slug, title, status, availability_status, transaction_type, property_type, neighborhood, area_m2, price, deposit, rent, description, images, contact_name, contact_phone, updated_at, published_at from properties where id::text = $1 limit 1",
    [propertyId],
  );
  const property = propertyRows[0];
  if (!property) {
    throw createError({ statusCode: 404, statusMessage: "فایل موردنظر پیدا نشد." });
  }

  const imageCount = Array.isArray(property.images)
    ? property.images.filter((item) => typeof item === "string" && item.trim()).length
    : 0;
  const areaM2 = property.area_m2 == null ? null : Number(property.area_m2) || null;
  const price = property.price == null ? null : Number(property.price) || null;
  const deposit = property.deposit == null ? null : Number(property.deposit) || null;
  const rent = property.rent == null ? null : Number(property.rent) || null;
  const hasPrice =
    property.transaction_type === "rent"
      ? Boolean(deposit || rent)
      : Boolean(price || (property.transaction_type === "mortgage" && deposit));

  const [eventRows, leadRows, sourceRows, marketRows] = await Promise.all([
    sql.query<{ event_name: string; count: number; unique_visitors: number }>(
      "select event_name, count(*)::int as count, count(distinct visitor_id)::int as unique_visitors " +
        "from site_events " +
        "where property_slug = $1 and day >= (current_timestamp at time zone 'Asia/Tehran')::date - 29 " +
        "group by event_name",
      [property.slug],
    ),
    sql.query<{
      total: number;
      visit_requests: number;
      confirmed_visits: number;
      completed_visits: number;
    }>(
      "select " +
        "count(*)::int as total, " +
        "count(*) filter (where visit_status = 'requested')::int as visit_requests, " +
        "count(*) filter (where visit_status = 'confirmed')::int as confirmed_visits, " +
        "count(*) filter (where visit_status = 'completed')::int as completed_visits " +
        "from leads where property_id = $1 and created_at >= current_timestamp - interval '30 days'",
      [property.id],
    ),
    sql.query<{
      source: string;
      medium: string;
      campaign: string;
      leads: number;
    }>(
      "select " +
        "coalesce(nullif(trim(acquisition_source),''), nullif(trim(source),''), 'direct') as source, " +
        "coalesce(nullif(trim(acquisition_medium),''), '—') as medium, " +
        "coalesce(nullif(trim(acquisition_campaign),''), 'بدون کمپین') as campaign, " +
        "count(*)::int as leads " +
        "from leads " +
        "where property_id = $1 and created_at >= current_timestamp - interval '30 days' " +
        "group by 1,2,3 order by leads desc, source asc limit 8",
      [property.id],
    ),
    sql.query<{
      comparable_count: number;
      average_metric: number | string | null;
      minimum_metric: number | string | null;
      maximum_metric: number | string | null;
    }>(
      "select " +
        "count(*)::int as comparable_count, " +
        "round(avg(metric)::numeric, 0) as average_metric, " +
        "round(min(metric)::numeric, 0) as minimum_metric, " +
        "round(max(metric)::numeric, 0) as maximum_metric " +
        "from (" +
        "  select case " +
        "    when transaction_type in ('buy','sell') and area_m2 > 0 and price is not null then price / area_m2 " +
        "    when transaction_type = 'rent' and area_m2 > 0 and rent is not null then rent / area_m2 " +
        "    when transaction_type = 'mortgage' and area_m2 > 0 and deposit is not null then deposit / area_m2 " +
        "    else null end as metric " +
        "  from properties " +
        "  where status = 'published' and id::text <> $1 and neighborhood = $2 and property_type = $3 and transaction_type = $4" +
        ") comparable where metric is not null",
      [property.id, property.neighborhood, property.property_type, property.transaction_type],
    ),
  ]);

  const events = emptyStats();
  let uniqueVisitors = 0;
  for (const row of eventRows) {
    if (EVENT_NAMES.includes(row.event_name as EventName)) {
      events[row.event_name as EventName] = Number(row.count) || 0;
      uniqueVisitors = Math.max(uniqueVisitors, Number(row.unique_visitors) || 0);
    }
  }

  const leads = leadRows[0] ?? {
    total: 0,
    visit_requests: 0,
    confirmed_visits: 0,
    completed_visits: 0,
  };
  const viewCount = events.property_view;
  const conversionRate = viewCount > 0
    ? Math.min(100, Math.round((Number(leads.total) / viewCount) * 1000) / 10)
    : 0;

  const daysSinceUpdate = daysBetween(property.updated_at);
  const daysSincePublish = daysBetween(property.published_at);
  const missing: string[] = [];
  if (imageCount === 0) missing.push("تصویر");
  if (String(property.description ?? "").trim().length < 120) missing.push("توضیحات کامل");
  if (!String(property.neighborhood ?? "").trim()) missing.push("محله");
  if (!String(property.contact_name ?? "").trim() || !String(property.contact_phone ?? "").trim()) missing.push("اطلاعات مشاور");
  if (!hasPrice) missing.push("قیمت/شرایط مالی");
  if (!areaM2 || areaM2 <= 0) missing.push("متراژ");

  const score = qualityScore({
    imageCount,
    descriptionLength: String(property.description ?? "").trim().length,
    neighborhood: String(property.neighborhood ?? "").trim(),
    contactName: String(property.contact_name ?? "").trim(),
    contactPhone: String(property.contact_phone ?? "").trim(),
    hasPrice,
    areaM2,
  });

  const marketRow = marketRows[0] ?? {};
  const averageMetric = Number(marketRow.average_metric) || 0;
  const currentMetric =
    areaM2 && areaM2 > 0
      ? property.transaction_type === "rent"
        ? (rent ?? deposit ?? 0) / areaM2
        : property.transaction_type === "mortgage"
          ? (deposit ?? 0) / areaM2
          : (price ?? 0) / areaM2
      : 0;

  const market = Number(marketRow.comparable_count) > 0 && averageMetric > 0
    ? {
        comparableCount: Number(marketRow.comparable_count),
        averagePerM2: averageMetric,
        minimumPerM2: Number(marketRow.minimum_metric) || 0,
        maximumPerM2: Number(marketRow.maximum_metric) || 0,
        currentPerM2: currentMetric || null,
        differencePercent: currentMetric > 0
          ? Math.round(((currentMetric - averageMetric) / averageMetric) * 1000) / 10
          : null,
        metric: property.transaction_type === "rent"
          ? "rent"
          : property.transaction_type === "mortgage"
            ? "deposit"
            : "price",
        transactionLabel: TX_LABEL[property.transaction_type] ?? property.transaction_type,
        propertyTypeLabel: TYPE_LABEL[property.property_type] ?? property.property_type,
        neighborhood: property.neighborhood,
      }
    : null;

  const recommendations: Array<{
    key: string;
    tone: "urgent" | "watch" | "opportunity" | "info";
    title: string;
    description: string;
    taskTitle: string;
    priority: "normal" | "high" | "urgent";
  }> = [];

  if (property.status === "published" && daysSinceUpdate !== null && daysSinceUpdate >= 30) {
    recommendations.push({
      key: "stale",
      tone: "urgent",
      title: "فایل نیاز به بروزرسانی دارد",
      description: `این فایل حدود ${daysSinceUpdate.toLocaleString("fa-IR")} روز است که ویرایش نشده؛ عکس‌ها، قیمت و توضیحات را بازبینی کنید.`,
      taskTitle: `بروزرسانی فایل «${property.title}»`,
      priority: "high",
    });
  }

  if (missing.length) {
    recommendations.push({
      key: "quality",
      tone: "watch",
      title: "کامل‌سازی اطلاعات فایل",
      description: `موارد ناقص: ${missing.join("، ")}.`,
      taskTitle: `تکمیل اطلاعات فایل «${property.title}»`,
      priority: "normal",
    });
  }

  if (events.property_view >= 20 && conversionRate < 2) {
    recommendations.push({
      key: "traffic-low-conversion",
      tone: "opportunity",
      title: "بازدید وجود دارد، تبدیل پایین است",
      description: `در ۳۰ روز ${events.property_view.toLocaleString("fa-IR")} بازدید و ${conversionRate.toLocaleString("fa-IR")}٪ تبدیل به لید ثبت شده است؛ قیمت، تصویر اول و CTA را بررسی کنید.`,
      taskTitle: `بررسی تبدیل فایل «${property.title}»`,
      priority: "high",
    });
  }

  if (events.property_favorite >= 3 && events.call_click + events.whatsapp_click < 2) {
    recommendations.push({
      key: "favorites-low-contact",
      tone: "opportunity",
      title: "ذخیره بالا، تماس پایین",
      description: `${events.property_favorite.toLocaleString("fa-IR")} ذخیره ثبت شده اما تعامل مستقیم کم است؛ متن پیشنهاد و CTA تماس را بازبینی کنید.`,
      taskTitle: `پیگیری فایل ذخیره‌شده «${property.title}»`,
      priority: "normal",
    });
  }

  if (leads.visit_requests > leads.confirmed_visits) {
    recommendations.push({
      key: "visit-follow-up",
      tone: "urgent",
      title: "درخواست بازدید منتظر پیگیری است",
      description: `${(leads.visit_requests - leads.confirmed_visits).toLocaleString("fa-IR")} درخواست بازدید هنوز به تأیید نرسیده است.`,
      taskTitle: `پیگیری درخواست‌های بازدید «${property.title}»`,
      priority: "urgent",
    });
  }

  if (market?.differencePercent !== null && market?.differencePercent !== undefined && Math.abs(market.differencePercent) >= 10) {
    const direction = market.differencePercent > 0 ? "بالاتر" : "پایین‌تر";
    recommendations.push({
      key: "market-gap",
      tone: "info",
      title: "اختلاف معنادار با فایل‌های مشابه منطقه",
      description: `قیمت/شرایط هر متر این فایل حدود ${Math.abs(market.differencePercent).toLocaleString("fa-IR")}٪ ${direction} از میانگین ${market.comparableCount.toLocaleString("fa-IR")} فایل مشابه منتشرشده در همین محله است.`,
      taskTitle: `بازبینی قیمت فایل «${property.title}»`,
      priority: "normal",
    });
  }

  if (events.property_view < 5 && property.status === "published" && (daysSincePublish ?? 0) >= 7) {
    recommendations.push({
      key: "low-visibility",
      tone: "watch",
      title: "فایل دیده‌شدن کمی دارد",
      description: "با توجه به بازه ۳۰ روزه و عمر حداقل یک هفته‌ای فایل، انتشار مجدد در کانال‌های ورودی یا بهبود عنوان و تصویر اصلی می‌تواند برای بررسی بیشتر مفید باشد.",
      taskTitle: `افزایش دیده‌شدن فایل «${property.title}»`,
      priority: "normal",
    });
  }

  const faNumber = (value: number) => value.toLocaleString("fa-IR");

  return {
    windowDays: 30,
    property: {
      id: property.id,
      slug: property.slug,
      title: property.title,
      status: property.status,
      availabilityStatus: property.availability_status,
      transactionType: property.transaction_type,
      transactionLabel: TX_LABEL[property.transaction_type] ?? property.transaction_type,
      propertyType: property.property_type,
      propertyTypeLabel: TYPE_LABEL[property.property_type] ?? property.property_type,
      neighborhood: property.neighborhood,
      areaM2,
      price,
      deposit,
      rent,
      updatedAt: new Date(String(property.updated_at)).toISOString(),
      publishedAt: property.published_at ? new Date(String(property.published_at)).toISOString() : null,
      contactName: String(property.contact_name ?? "").trim(),
    },
    events,
    uniqueVisitors,
    leads: {
      total: Number(leads.total) || 0,
      visitRequests: Number(leads.visit_requests) || 0,
      confirmedVisits: Number(leads.confirmed_visits) || 0,
      completedVisits: Number(leads.completed_visits) || 0,
    },
    conversionRate,
    freshness: {
      updatedAt: new Date(String(property.updated_at)).toISOString(),
      publishedAt: property.published_at ? new Date(String(property.published_at)).toISOString() : null,
      daysSinceUpdate,
      daysSincePublish,
    },
    quality: { score, imageCount, missing },
    market,
    leadSources: sourceRows.map((row) => ({
      source: String(row.source ?? "direct"),
      medium: String(row.medium ?? "—"),
      campaign: String(row.campaign ?? "بدون کمپین"),
      leads: Number(row.leads) || 0,
    })),
    recommendations: recommendations.slice(0, 6),
  };
});
