import { createError, defineEventHandler, getCookie, readBody, setResponseHeader } from "h3";
import { assertSameOrigin, clientFingerprint, consumeAdminAttempt, tooManyAttemptsError } from "@/lib/admin-rate-limit.server";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { buildBudgetLeadNote, budgetEquivalent } from "@/lib/budget-lead";
import { DEFAULT_MATCH_RAHN_RATE } from "@/lib/budget-matching";
import { autoMatchLead } from "@/lib/lead-smart-matcher.server";

const VISITOR_COOKIE = "hirmand_visitor_id";

const PROPERTY_SERVICE_REQUEST_DEALS = new Set([
  "درخواست کارشناسی فنی",
  "درخواست محتوای جدید",
  "بررسی حقوقی معامله",
  "درخواست تأیید اطلاعات فایل",
]);

function createPublicTrackingToken() {
  const year = new Date().getFullYear().toString().slice(-2);
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
  return `HIR-${year}-${random}`;
}

async function createAutomaticFollowUp(sql: Awaited<ReturnType<typeof getSql>>, input: {
  leadId: string;
  title: string;
  description: string;
  assignee?: string;
  priority: "normal" | "high" | "urgent";
  dueMinutes: number;
}) {
  try {
    const dueAt = new Date(Date.now() + input.dueMinutes * 60_000).toISOString();
    await sql.query(
      "insert into admin_tasks(id,title,description,status,priority,due_at,assignee,entity_type,entity_id) values($1,$2,$3,'open',$4,$5,$6,'lead',$7)",
      [crypto.randomUUID(), input.title, input.description, input.priority, dueAt, input.assignee?.trim() || "", input.leadId],
    );
  } catch (error) {
    console.error("[leads] automatic follow-up creation failed", error);
  }
}

const matchSchema = z.object({
  slug: z.string().trim().min(1).max(220),
  title: z.string().trim().min(1).max(180),
  tier: z.enum(["within", "convertible", "near"]),
  score: z.number().min(0).max(100),
  suggestedDeposit: z.number().min(0).max(999999999999999),
  suggestedRent: z.number().min(0).max(999999999999999),
  gapEquivalent: z.number().min(0).max(999999999999999).optional(),
  reason: z.string().trim().max(500).optional(),
});

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^09\d{9}$/),
  peopleCount: z.number().int().min(1).max(20).optional(),
  job: z.string().trim().max(100).default(""),
  deal: z.string().trim().min(1).max(40),
  propertyType: z.string().trim().max(80).default(""),
  neighborhood: z.string().trim().max(80).default(""),
  floorPreference: z.string().trim().max(40).default(""),
  requestedBedrooms: z.number().int().min(0).max(20).optional(),
  requestedAmenities: z.array(z.string().trim().min(1).max(80)).max(30).optional().default([]),
  consultant: z.string().trim().max(80).default(""),
  note: z.string().trim().max(1500).default(""),
  leaseDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  source: z.enum(["website", "budget_match"]).optional().default("website"),
  propertyId: z.string().trim().min(1).max(120).optional(),
  visitPreferredAt: z.string().trim().max(80).optional(),
  callbackPreferredAt: z.string().trim().max(80).optional(),
  offerAmount: z.number().int().min(0).max(999999999999999).optional(),
  offerConditions: z.string().trim().max(1200).default(""),
  budgetDeposit: z.number().int().min(0).max(999999999999999).optional(),
  budgetRent: z.number().int().min(0).max(999999999999999).optional(),
  budgetPurchase: z.number().int().min(0).max(999999999999999).optional(),
  budgetSale: z.number().int().min(0).max(999999999999999).optional(),
  budgetDepositMin: z.number().int().min(0).max(999999999999999).optional(),
  budgetDepositMax: z.number().int().min(0).max(999999999999999).optional(),
  budgetRentMin: z.number().int().min(0).max(999999999999999).optional(),
  budgetRentMax: z.number().int().min(0).max(999999999999999).optional(),
  budgetPurchaseMin: z.number().int().min(0).max(999999999999999).optional(),
  budgetPurchaseMax: z.number().int().min(0).max(999999999999999).optional(),
  budgetSaleMin: z.number().int().min(0).max(999999999999999).optional(),
  budgetSaleMax: z.number().int().min(0).max(999999999999999).optional(),
  budgetBedrooms: z.number().int().min(1).max(30).optional(),
  matches: z.array(matchSchema).max(12).optional().default([]),
}).superRefine((value, ctx) => {
  if (value.source === "budget_match" && (value.budgetDeposit ?? 0) <= 0 && (value.budgetRent ?? 0) <= 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["budgetDeposit"], message: "بودجه نامعتبر است." });
  }

  if (value.visitPreferredAt) {
    const visitDate = new Date(value.visitPreferredAt);
    if (!Number.isFinite(visitDate.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["visitPreferredAt"], message: "زمان بازدید نامعتبر است." });
    } else if (visitDate.getTime() < Date.now() + 30 * 60 * 1000) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["visitPreferredAt"], message: "زمان بازدید باید حداقل ۳۰ دقیقه از اکنون فاصله داشته باشد." });
    }
  }
  if (value.callbackPreferredAt) {
    const callbackDate = new Date(value.callbackPreferredAt);
    if (!Number.isFinite(callbackDate.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["callbackPreferredAt"], message: "زمان تماس نامعتبر است." });
    } else if (callbackDate.getTime() < Date.now() + 30 * 60 * 1000) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["callbackPreferredAt"], message: "زمان تماس باید حداقل ۳۰ دقیقه از اکنون فاصله داشته باشد." });
    }
  }
  if (value.callbackPreferredAt && (value.propertyId || value.visitPreferredAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["callbackPreferredAt"], message: "درخواست تماس زمان‌بندی‌شده باید جدا از بازدید ثبت شود." });
  }
  if (value.offerAmount != null && value.offerAmount <= 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["offerAmount"], message: "مبلغ پیشنهاد نامعتبر است." });
  }
  if (value.offerAmount != null && !value.propertyId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["propertyId"], message: "برای پیشنهاد قیمت، فایل مشخص نشده است." });
  }
  if (value.deal === "پیشنهاد قیمت" && (value.offerAmount == null || !value.propertyId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["offerAmount"], message: "مبلغ پیشنهاد قیمت را وارد کنید." });
  }
  if (value.visitPreferredAt && !value.propertyId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["propertyId"], message: "برای درخواست بازدید، فایل مشخص نشده است." });
  }
  if (
    value.propertyId &&
    !value.visitPreferredAt &&
    value.offerAmount == null &&
    value.deal !== "درخواست مدارک" &&
    value.deal !== "درخواست تأمین مالی" &&
    !PROPERTY_SERVICE_REQUEST_DEALS.has(value.deal)
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["visitPreferredAt"], message: "زمان پیشنهادی بازدید مشخص نشده است." });
  }
  if (value.leaseDeadline) {
    const parsedDate = new Date(value.leaseDeadline + "T00:00:00Z");
    const normalized = Number.isNaN(parsedDate.getTime()) ? "" : parsedDate.toISOString().slice(0, 10);
    if (normalized !== value.leaseDeadline) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["leaseDeadline"], message: "تاریخ مهلت نامعتبر است." });
    }
    if (value.deal !== "رهن" && value.deal !== "اجاره") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["leaseDeadline"], message: "تاریخ مهلت فقط برای رهن یا اجاره مجاز است." });
    }
  }
  if ((value.budgetDepositMin ?? 0) > (value.budgetDepositMax ?? value.budgetDepositMin ?? 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["budgetDepositMin"], message: "حداقل رهن نمی‌تواند بیشتر از حداکثر رهن باشد." });
  }
  if ((value.budgetRentMin ?? 0) > (value.budgetRentMax ?? value.budgetRentMin ?? 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["budgetRentMin"], message: "حداقل اجاره نمی‌تواند بیشتر از حداکثر اجاره باشد." });
  }
  if ((value.budgetPurchaseMin ?? 0) > (value.budgetPurchaseMax ?? value.budgetPurchaseMin ?? 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["budgetPurchaseMin"], message: "حداقل خرید نمی‌تواند بیشتر از حداکثر خرید باشد." });
  }
  if ((value.budgetSaleMin ?? 0) > (value.budgetSaleMax ?? value.budgetSaleMin ?? 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["budgetSaleMin"], message: "حداقل فروش نمی‌تواند بیشتر از حداکثر فروش باشد." });
  }
});

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  assertSameOrigin(event);
  const attempt = await consumeAdminAttempt("public-lead:" + clientFingerprint(event));
  if (!attempt.allowed) throw tooManyAttemptsError(attempt.retryAfterSeconds);

  const parsed = schema.safeParse(await readBody(event));
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: "اطلاعات درخواست ناقص یا نامعتبر است." });
  if (dbSource === "unconfigured") throw createError({ statusCode: 503, statusMessage: "ثبت آنلاین درخواست در حال حاضر فعال نیست." });
  const sql = await getSql();
  const visitorId = getCookie(event, VISITOR_COOKIE);
  let acquisition: {
    source: string | null;
    medium: string | null;
    campaign: string | null;
    referrer: string | null;
    landingPath: string | null;
  } = {
    source: null,
    medium: null,
    campaign: null,
    referrer: null,
    landingPath: null,
  };

  if (visitorId && /^[a-f0-9-]{20,80}$/i.test(visitorId)) {
    try {
      const acquisitionRows = await sql.query<Record<string, unknown>>(
        `select
           utm_source,
           utm_medium,
           utm_campaign,
           referrer_host,
           landing_path
         from site_visitor_days
         where visitor_id = $1
         order by day desc, last_seen_at desc
         limit 1`,
        [visitorId],
      );
      const row = acquisitionRows[0];
      if (row) {
        acquisition = {
          source: row.utm_source ? String(row.utm_source) : row.referrer_host ? String(row.referrer_host) : null,
          medium: row.utm_medium ? String(row.utm_medium) : null,
          campaign: row.utm_campaign ? String(row.utm_campaign) : null,
          referrer: row.referrer_host ? String(row.referrer_host) : null,
          landingPath: row.landing_path ? String(row.landing_path) : null,
        };
      }
    } catch (error) {
      console.error("[leads] acquisition lookup unavailable", error);
    }
  }
  const existing = await sql.query<{ id: string; public_tracking_token: string | null }>(
    `select id, public_tracking_token from leads where phone = $1 and created_at > current_timestamp - interval '10 minutes' limit 1`,
    [parsed.data.phone],
  );

  const budgetDepositMin = parsed.data.budgetDepositMin ?? parsed.data.budgetDeposit ?? 0;
  const budgetDeposit = parsed.data.budgetDepositMax ?? parsed.data.budgetDeposit ?? budgetDepositMin;
  const budgetRentMin = parsed.data.budgetRentMin ?? parsed.data.budgetRent ?? 0;
  const budgetRent = parsed.data.budgetRentMax ?? parsed.data.budgetRent ?? budgetRentMin;
  const budgetPurchaseMin = parsed.data.budgetPurchaseMin ?? parsed.data.budgetPurchase ?? 0;
  const budgetPurchase = parsed.data.budgetPurchaseMax ?? parsed.data.budgetPurchase ?? budgetPurchaseMin;
  const budgetSaleMin = parsed.data.budgetSaleMin ?? parsed.data.budgetSale ?? 0;
  const budgetSale = parsed.data.budgetSaleMax ?? parsed.data.budgetSale ?? budgetSaleMin;
  const leaseDeadline = parsed.data.deal === "رهن" || parsed.data.deal === "اجاره"
    ? parsed.data.leaseDeadline ?? null
    : null;
  const matchedProperties = parsed.data.matches.slice(0, 12);
  const budgetPayload = {
    name: parsed.data.name,
    phone: parsed.data.phone,
    depositBudget: budgetDeposit,
    rentBudget: budgetRent,
    propertyType: parsed.data.propertyType,
    neighborhood: parsed.data.neighborhood,
    bedrooms: parsed.data.budgetBedrooms,
    matches: matchedProperties,
    note: parsed.data.note,
  };
  const equivalent = parsed.data.source === "budget_match" ? budgetEquivalent(budgetPayload) : 0;
  const note = parsed.data.source === "budget_match"
    ? buildBudgetLeadNote(budgetPayload)
    : parsed.data.note;

  if (existing[0] && !(parsed.data.propertyId && parsed.data.visitPreferredAt) && !parsed.data.callbackPreferredAt && parsed.data.offerAmount == null && !PROPERTY_SERVICE_REQUEST_DEALS.has(parsed.data.deal)) {
    if (parsed.data.source === "budget_match") {
      await sql.query(
        `update leads
         set name=$2, people_count=$3, job=$4, deal=$5, property_type=$6, neighborhood=$7, consultant=$8, note=$9,
             source=$10, follow_up_at=current_timestamp + interval '24 hours', lease_deadline=null, acquisition_source=$20, acquisition_medium=$21, acquisition_campaign=$22, acquisition_referrer=$23, acquisition_landing_path=$24, budget_deposit=$11, budget_rent=$12, budget_purchase=$13, budget_sale=$14, budget_rate=$15,
             budget_equivalent=$16, budget_bedrooms=$17, matched_properties=$18::jsonb,
             match_count=$19, floor_preference=$25, budget_deposit_min=$26, budget_deposit_max=$27,
             budget_rent_min=$28, budget_rent_max=$29, budget_purchase_min=$30, budget_purchase_max=$31,
             budget_sale_min=$32, budget_sale_max=$33, requested_amenities=$34::jsonb, requested_bedrooms=$35, updated_at=current_timestamp
         where id=$1`,
        [
          existing[0].id,
          parsed.data.name,
          parsed.data.peopleCount ?? null,
          parsed.data.job,
          parsed.data.deal,
          parsed.data.propertyType,
          parsed.data.neighborhood,
          parsed.data.consultant,
          note,
          parsed.data.source,
          budgetDeposit || null,
          budgetRent || null,
          budgetPurchase || null,
          budgetSale || null,
          DEFAULT_MATCH_RAHN_RATE,
          equivalent || null,
          parsed.data.budgetBedrooms ?? null,
          JSON.stringify(matchedProperties),
          matchedProperties.length,
          acquisition.source,
          acquisition.medium,
          acquisition.campaign,
          acquisition.referrer,
          acquisition.landingPath,
          parsed.data.floorPreference,
          budgetDepositMin || null,
          budgetDeposit || null,
          budgetRentMin || null,
          budgetRent || null,
          budgetPurchaseMin || null,
          budgetPurchase || null,
          budgetSaleMin || null,
          budgetSale || null,
          JSON.stringify(parsed.data.requestedAmenities),
          parsed.data.requestedBedrooms ?? null,
        ],
      );
      try {
        await autoMatchLead(sql, existing[0].id, { mode: "smart", limit: 8 });
      } catch (error) {
        console.error("[leads] automatic smart matching failed for duplicate budget lead", error);
      }
      const trackingToken =
        existing[0].public_tracking_token || createPublicTrackingToken();
      if (!existing[0].public_tracking_token) {
        await sql.query(
          "update leads set public_tracking_token=$2 where id=$1",
          [existing[0].id, trackingToken],
        );
      }
      return { success: true, duplicate: true, updated: true, id: existing[0].id, trackingToken };
    }
    const trackingToken =
      existing[0].public_tracking_token || createPublicTrackingToken();
    if (!existing[0].public_tracking_token) {
      await sql.query(
        "update leads set public_tracking_token=$2 where id=$1",
        [existing[0].id, trackingToken],
      );
    }
    return { success: true, duplicate: true, id: existing[0].id, trackingToken };
  }

  if (parsed.data.callbackPreferredAt) {
    const callbackDate = new Date(parsed.data.callbackPreferredAt);
    const trackingToken = createPublicTrackingToken();
    const rows = await sql.query<{ id: string }>(
      "insert into leads (id,name,phone,people_count,job,deal,property_type,neighborhood,consultant,note,source,follow_up_at,callback_preferred_at,public_tracking_token) values ($1,$2,$3,$4,$5,'درخواست تماس',$6,$7,$8,$9,'website',$10,$11,$12) returning id",
      [
        crypto.randomUUID(), parsed.data.name, parsed.data.phone, parsed.data.peopleCount ?? null,
        parsed.data.job, parsed.data.propertyType, parsed.data.neighborhood, parsed.data.consultant,
        parsed.data.note.trim() || "درخواست تماس زمان‌بندی‌شده با مشاور هیرمند",
        callbackDate.toISOString(), callbackDate.toISOString(), trackingToken,
      ],
    );
    if (!rows[0]) throw createError({ statusCode: 500, statusMessage: "درخواست تماس ثبت نشد." });
    await sql.query(
      "insert into lead_activities (lead_id,activity_type,title,note,metadata) values ($1,'follow_up',$2,$3,$4::jsonb)",
      [rows[0].id, "درخواست تماس زمان‌بندی‌شده", "زمان پیشنهادی تماس: " + callbackDate.toLocaleString("fa-IR"), parsed.data.note.trim(), JSON.stringify({ callbackPreferredAt: callbackDate.toISOString() })],
    ).catch(() => {});
    await createAutomaticFollowUp(sql, {
      leadId: rows[0].id,
      title: "تماس زمان‌بندی‌شده با " + parsed.data.name,
      description: "مشتری درخواست کرده در زمان پیشنهادی با او تماس گرفته شود: " + callbackDate.toLocaleString("fa-IR"),
      assignee: parsed.data.consultant,
      priority: "high",
      dueMinutes: Math.max(30, Math.round((callbackDate.getTime() - Date.now()) / 60_000)),
    });
    return { success: true, id: rows[0].id, callbackRequested: true, trackingToken };
  }

  if (parsed.data.deal === "درخواست تأیید اطلاعات فایل" && parsed.data.propertyId) {
    const propertyRows = await sql.query<{
      id: string;
      title: string;
      property_type: string;
      neighborhood: string;
      contact_name: string;
    }>(
      "select id,title,property_type,neighborhood,contact_name from properties where id::text=$1 and status='published' and availability_status not in ('sold','rented','unavailable') limit 1",
      [parsed.data.propertyId],
    );
    const property = propertyRows[0];
    if (!property) {
      throw createError({ statusCode: 404, statusMessage: "این فایل دیگر برای درخواست تأیید اطلاعات در دسترس نیست." });
    }
    const trackingToken = createPublicTrackingToken();
    const requestNote = parsed.data.note.trim() || "درخواست بررسی و تأیید اطلاعات اصلی فایل";
    const rows = await sql.query<{ id: string }>(
      "insert into leads (id,name,phone,people_count,job,deal,property_type,neighborhood,consultant,note,source,property_id,follow_up_at,public_tracking_token) values ($1,$2,$3,$4,$5,'درخواست تأیید اطلاعات فایل',$6,$7,$8,$9,'website',$10,current_timestamp + interval '2 hours',$11) returning id",
      [
        crypto.randomUUID(),
        parsed.data.name,
        parsed.data.phone,
        parsed.data.peopleCount ?? null,
        parsed.data.job,
        property.property_type,
        property.neighborhood,
        property.contact_name || parsed.data.consultant,
        "فایل: " + property.title + "\n" + requestNote,
        property.id,
        trackingToken,
      ],
    );
    if (!rows[0]) throw createError({ statusCode: 500, statusMessage: "درخواست تأیید اطلاعات ثبت نشد." });
    await sql.query(
      "insert into lead_activities (lead_id,activity_type,title,note,metadata) values ($1,'note',$2,$3,$4::jsonb)",
      [
        rows[0].id,
        "درخواست تأیید اطلاعات فایل آنلاین ثبت شد",
        "فایل: " + property.title,
        requestNote,
        JSON.stringify({ propertyId: property.id, requestType: "verification_information", checks: parsed.data.requestedAmenities }),
      ],
    ).catch(() => {});
    await createAutomaticFollowUp(sql, {
      leadId: rows[0].id,
      title: "بررسی اطلاعات فایل: " + property.title,
      description: "مشتری درخواست بررسی و تأیید اطلاعات اصلی این فایل را ثبت کرده است.",
      assignee: property.contact_name || parsed.data.consultant,
      priority: "high",
      dueMinutes: 120,
    });
    return { success: true, id: rows[0].id, verificationRequest: true, trackingToken };
  }

  if (parsed.data.propertyId && PROPERTY_SERVICE_REQUEST_DEALS.has(parsed.data.deal)) {
    const propertyRows = await sql.query<{
      id: string;
      title: string;
      property_type: string;
      neighborhood: string;
      contact_name: string;
    }>(
      "select id,title,property_type,neighborhood,contact_name from properties where id::text=$1 and status='published' and availability_status not in ('sold','rented','unavailable') limit 1",
      [parsed.data.propertyId],
    );
    const property = propertyRows[0];
    if (!property) {
      throw createError({
        statusCode: 404,
        statusMessage: "این فایل دیگر برای ثبت درخواست تخصصی در دسترس نیست.",
      });
    }

    const requestType =
      parsed.data.deal === "درخواست کارشناسی فنی"
        ? "technical_inspection"
        : parsed.data.deal === "درخواست محتوای جدید"
          ? "fresh_media"
          : "legal_review";
    const trackingToken = createPublicTrackingToken();
    const requestNote = parsed.data.note.trim() || parsed.data.deal;
    const rows = await sql.query<{ id: string }>(
      "insert into leads (id,name,phone,people_count,job,deal,property_type,neighborhood,consultant,note,source,property_id,follow_up_at,public_tracking_token) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'website',$11,current_timestamp + interval '2 hours',$12) returning id",
      [
        crypto.randomUUID(),
        parsed.data.name,
        parsed.data.phone,
        parsed.data.peopleCount ?? null,
        parsed.data.job,
        parsed.data.deal,
        property.property_type,
        property.neighborhood,
        property.contact_name || parsed.data.consultant,
        "فایل: " + property.title + "\n" + requestNote,
        property.id,
        trackingToken,
      ],
    );
    if (!rows[0]) {
      throw createError({ statusCode: 500, statusMessage: "درخواست تخصصی ثبت نشد." });
    }

    await sql.query(
      "insert into lead_activities (lead_id,activity_type,title,note,metadata) values ($1,'note',$2,$3,$4::jsonb)",
      [
        rows[0].id,
        parsed.data.deal + " آنلاین ثبت شد",
        "فایل: " + property.title,
        requestNote,
        JSON.stringify({ propertyId: property.id, requestType }),
      ],
    ).catch(() => {});

    await createAutomaticFollowUp(sql, {
      leadId: rows[0].id,
      title: "پیگیری " + parsed.data.deal + ": " + property.title,
      description: "مشتری برای این فایل یک سرویس تخصصی درخواست کرده است؛ جزئیات در یادداشت لید ثبت شده.",
      assignee: property.contact_name || parsed.data.consultant,
      priority: "high",
      dueMinutes: 120,
    });

    return { success: true, id: rows[0].id, expertServiceRequest: requestType, trackingToken };
  }

  if (parsed.data.deal === "پیشنهاد قیمت" && parsed.data.offerAmount != null && parsed.data.propertyId) {
    const propertyRows = await sql.query<{ id: string; title: string; property_type: string; neighborhood: string; contact_name: string; price: number | null }>(
      "select id,title,property_type,neighborhood,contact_name,price from properties where id::text=$1 and status='published' and availability_status not in ('sold','rented','unavailable') limit 1",
      [parsed.data.propertyId],
    );
    const property = propertyRows[0];
    if (!property) throw createError({ statusCode: 404, statusMessage: "این فایل دیگر برای دریافت پیشنهاد در دسترس نیست." });
    const trackingToken = createPublicTrackingToken();
    const rows = await sql.query<{ id: string }>(
      "insert into leads (id,name,phone,people_count,job,deal,property_type,neighborhood,consultant,note,source,property_id,offer_amount,offer_conditions,follow_up_at,public_tracking_token) values ($1,$2,$3,$4,$5,'پیشنهاد قیمت',$6,$7,$8,$9,'website',$10,$11,$12,current_timestamp + interval '2 hours',$13) returning id",
      [
        crypto.randomUUID(), parsed.data.name, parsed.data.phone, parsed.data.peopleCount ?? null, parsed.data.job,
        property.property_type, property.neighborhood, property.contact_name || parsed.data.consultant,
        "فایل: " + property.title + "\n" + (parsed.data.note.trim() || "پیشنهاد قیمت ثبت شد."),
        property.id, parsed.data.offerAmount, parsed.data.offerConditions, trackingToken,
      ],
    );
    if (!rows[0]) throw createError({ statusCode: 500, statusMessage: "پیشنهاد قیمت ثبت نشد." });
    await sql.query(
      "insert into lead_activities (lead_id,activity_type,title,note,metadata) values ($1,'note',$2,$3,$4::jsonb)",
      [rows[0].id, "پیشنهاد قیمت آنلاین ثبت شد", "مبلغ پیشنهاد: " + parsed.data.offerAmount.toLocaleString("fa-IR") + " تومان", parsed.data.offerConditions, JSON.stringify({ propertyId: property.id, offerAmount: parsed.data.offerAmount, propertyPrice: property.price })],
    ).catch(() => {});
    await createAutomaticFollowUp(sql, {
      leadId: rows[0].id,
      title: "بررسی پیشنهاد قیمت: " + property.title,
      description: "پیشنهاد قیمت آنلاین مشتری را بررسی و نتیجه مذاکره را ثبت کنید.",
      assignee: property.contact_name || parsed.data.consultant,
      priority: "urgent",
      dueMinutes: 120,
    });
    return { success: true, id: rows[0].id, offerSubmitted: true, trackingToken };
  }

  if (parsed.data.propertyId && parsed.data.visitPreferredAt) {
    const visitDate = new Date(parsed.data.visitPreferredAt);
    const propertyRows = await sql.query<{ id: string; title: string; property_type: string; neighborhood: string; contact_name: string }>(
      "select id, title, property_type, neighborhood, contact_name, availability_status from properties where id::text = $1 and status = 'published' and availability_status not in ('sold','rented','unavailable') limit 1",
      [parsed.data.propertyId],
    );
    const property = propertyRows[0];
    if (!property) throw createError({ statusCode: 404, statusMessage: "فایل موردنظر برای بازدید در دسترس نیست." });
    const conflictRows = await sql.query<{ id: string }>(
      "select id from leads where property_id::text=$1 and visit_status in ('requested','confirmed') and abs(extract(epoch from (visit_preferred_at - $2::timestamptz))) < 2700 limit 1",
      [property.id, visitDate.toISOString()],
    );
    if (conflictRows[0]) {
      throw createError({
        statusCode: 409,
        statusMessage: "این بازه برای این فایل قبلاً درخواستی دارد. لطفاً یکی از زمان‌های خالی را انتخاب کنید.",
      });
    }
    const trackingToken = createPublicTrackingToken();
    const rows = await sql.query<{ id: string }>(
      "insert into leads (id, name, phone, people_count, job, deal, property_type, neighborhood, consultant, note, source, follow_up_at, floor_preference, property_id, visit_preferred_at, visit_requested_at, visit_status, public_tracking_token) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'website',current_timestamp + interval '4 hours',$11,$12,$13,current_timestamp,'requested',$14) returning id",
      [
        crypto.randomUUID(),
        parsed.data.name,
        parsed.data.phone,
        parsed.data.peopleCount ?? null,
        parsed.data.job,
        "بازدید",
        property.property_type,
        property.neighborhood,
        property.contact_name || parsed.data.consultant,
        parsed.data.note.trim() || "درخواست بازدید فایل",
        parsed.data.floorPreference,
        property.id,
        visitDate.toISOString(),
        trackingToken,
      ],
    );
    if (!rows[0]) throw createError({ statusCode: 500, statusMessage: "ثبت درخواست بازدید انجام نشد." });
    await sql.query(
      "insert into lead_activities (lead_id, activity_type, title, note, metadata) values ($1,'visit',$2,$3,$4::jsonb)",
      [
        rows[0].id,
        "درخواست بازدید ثبت شد",
        "فایل: " + property.title,
        parsed.data.note.trim() || "درخواست بازدید از فایل",
        JSON.stringify({ propertyId: property.id, visitPreferredAt: visitDate.toISOString() }),
      ],
    ).catch(() => {});
    await createAutomaticFollowUp(sql, {
      leadId: rows[0].id,
      title: "پیگیری فوری درخواست بازدید: " + property.title,
      description: "مشتری برای این فایل درخواست بازدید ثبت کرده است؛ زمان پیشنهادی: " + visitDate.toLocaleString("fa-IR"),
      assignee: property.contact_name || parsed.data.consultant,
      priority: "urgent",
      dueMinutes: 60,
    });
    return { success: true, duplicate: false, id: rows[0].id, visitRequested: true, trackingToken };
  }
  if (parsed.data.deal === "درخواست تأمین مالی" && parsed.data.propertyId) {
    const propertyRows = await sql.query<{
      id: string;
      title: string;
      property_type: string;
      neighborhood: string;
      contact_name: string;
      price: number | null;
    }>(
      "select id,title,property_type,neighborhood,contact_name,price from properties where id::text=$1 and status='published' and availability_status not in ('sold','rented','unavailable') limit 1",
      [parsed.data.propertyId],
    );
    const property = propertyRows[0];
    if (!property) throw createError({ statusCode: 404, statusMessage: "این فایل دیگر برای بررسی تأمین مالی در دسترس نیست." });

    const trackingToken = createPublicTrackingToken();
    const rows = await sql.query<{ id: string }>(
      "insert into leads (id,name,phone,people_count,job,deal,property_type,neighborhood,consultant,note,source,property_id,follow_up_at,public_tracking_token) values ($1,$2,$3,$4,$5,'درخواست تأمین مالی',$6,$7,$8,$9,'website',$10,current_timestamp + interval '2 hours',$11) returning id",
      [
        crypto.randomUUID(),
        parsed.data.name,
        parsed.data.phone,
        parsed.data.peopleCount ?? null,
        parsed.data.job,
        property.property_type,
        property.neighborhood,
        property.contact_name || parsed.data.consultant,
        parsed.data.note.trim() || "درخواست بررسی تأمین مالی برای فایل",
        property.id,
        trackingToken,
      ],
    );
    if (!rows[0]) throw createError({ statusCode: 500, statusMessage: "درخواست تأمین مالی ثبت نشد." });

    await sql.query(
      "insert into lead_activities (lead_id,activity_type,title,note,metadata) values ($1,'note',$2,$3,$4::jsonb)",
      [
        rows[0].id,
        "درخواست بررسی تأمین مالی آنلاین",
        "فایل: " + property.title,
        parsed.data.note.trim() || "درخواست بررسی سناریوی تأمین مالی",
        JSON.stringify({ propertyId: property.id, requestType: "financing_review" }),
      ],
    ).catch(() => {});

    await createAutomaticFollowUp(sql, {
      leadId: rows[0].id,
      title: "بررسی تأمین مالی: " + property.title,
      description: "مشتری برای این فایل درخواست بررسی سناریوی تأمین مالی ثبت کرده است.",
      assignee: property.contact_name || parsed.data.consultant,
      priority: "high",
      dueMinutes: 120,
    });

    return { success: true, id: rows[0].id, financingRequest: true, trackingToken };
  }

  if (parsed.data.deal === "درخواست مدارک" && parsed.data.propertyId) {
    const propertyRows = await sql.query<{
      id: string;
      title: string;
      property_type: string;
      neighborhood: string;
      contact_name: string;
    }>(
      "select id,title,property_type,neighborhood,contact_name from properties where id::text=$1 and status='published' and availability_status not in ('sold','rented','unavailable') limit 1",
      [parsed.data.propertyId],
    );
    const property = propertyRows[0];
    if (!property) throw createError({ statusCode: 404, statusMessage: "این فایل دیگر برای دریافت درخواست مدارک در دسترس نیست." });

    const trackingToken = createPublicTrackingToken();
    const requestNote = parsed.data.note.trim() || "درخواست بررسی مدارک و شرایط معامله";
    const rows = await sql.query<{ id: string }>(
      "insert into leads (id,name,phone,people_count,job,deal,property_type,neighborhood,consultant,note,source,property_id,follow_up_at,public_tracking_token) values ($1,$2,$3,$4,$5,'درخواست مدارک',$6,$7,$8,$9,'website',$10,current_timestamp + interval '2 hours',$11) returning id",
      [
        crypto.randomUUID(),
        parsed.data.name,
        parsed.data.phone,
        parsed.data.peopleCount ?? null,
        parsed.data.job,
        property.property_type,
        property.neighborhood,
        property.contact_name || parsed.data.consultant,
        requestNote,
        property.id,
        trackingToken,
      ],
    );
    if (!rows[0]) throw createError({ statusCode: 500, statusMessage: "درخواست بررسی مدارک ثبت نشد." });

    await sql.query(
      "insert into lead_activities (lead_id,activity_type,title,note,metadata) values ($1,'note',$2,$3,$4::jsonb)",
      [
        rows[0].id,
        "درخواست بررسی مدارک آنلاین",
        "فایل: " + property.title,
        requestNote,
        JSON.stringify({ propertyId: property.id, requestType: "document_review" }),
      ],
    ).catch(() => {});

    await createAutomaticFollowUp(sql, {
      leadId: rows[0].id,
      title: "بررسی مدارک: " + property.title,
      description: "مشتری درخواست بررسی مدارک و شرایط این فایل را ثبت کرده است؛ جزئیات درخواست در یادداشت لید موجود است.",
      assignee: property.contact_name || parsed.data.consultant,
      priority: "high",
      dueMinutes: 120,
    });

    return { success: true, id: rows[0].id, documentRequest: true, trackingToken };
  }

  const trackingToken = createPublicTrackingToken();
  const rows = await sql.query<{ id: string }>(
    `insert into leads (
      id, name, phone, people_count, job, deal, property_type, neighborhood, consultant, note, source,
      acquisition_source, acquisition_medium, acquisition_campaign, acquisition_referrer, acquisition_landing_path,
      follow_up_at, lease_deadline, budget_deposit, budget_rent, budget_purchase, budget_sale, budget_rate, budget_equivalent, budget_bedrooms,
      floor_preference, matched_properties, match_count,
      budget_deposit_min, budget_deposit_max, budget_rent_min, budget_rent_max,
      budget_purchase_min, budget_purchase_max, budget_sale_min, budget_sale_max,
      requested_amenities, requested_bedrooms, public_tracking_token
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,current_timestamp + interval '24 hours',$17,$18,$19,$20,$21,$22,$23,$24,$25,$26::jsonb,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36::jsonb,$37,$38)
    returning id`,
    [
      crypto.randomUUID(),
      parsed.data.name,
      parsed.data.phone,
      parsed.data.peopleCount ?? null,
      parsed.data.job,
      parsed.data.deal,
      parsed.data.propertyType,
      parsed.data.neighborhood,
      parsed.data.consultant,
      note,
      parsed.data.source,
      acquisition.source,
      acquisition.medium,
      acquisition.campaign,
      acquisition.referrer,
      acquisition.landingPath,
      leaseDeadline,
      budgetDeposit || null,
      budgetRent || null,
      budgetPurchase || null,
      budgetSale || null,
      parsed.data.source === "budget_match" ? DEFAULT_MATCH_RAHN_RATE : null,
      equivalent || null,
      parsed.data.budgetBedrooms ?? null,
      parsed.data.floorPreference,
      JSON.stringify(matchedProperties),
      matchedProperties.length,
      budgetDepositMin || null,
      budgetDeposit || null,
      budgetRentMin || null,
      budgetRent || null,
      budgetPurchaseMin || null,
      budgetPurchase || null,
      budgetSaleMin || null,
      budgetSale || null,
      JSON.stringify(parsed.data.requestedAmenities),
      parsed.data.requestedBedrooms ?? null,
      trackingToken,
    ],
  );
  const createdLeadId = rows[0]?.id ?? null;
  if (createdLeadId) {
    if (parsed.data.deal === "خرید" || parsed.data.deal === "فروش" || parsed.data.deal === "رهن" || parsed.data.deal === "اجاره") {
      try {
        const automaticMatches = await autoMatchLead(sql, createdLeadId, { mode: "smart", limit: 8 });
        if (automaticMatches.count > 0) {
          console.info("[leads] automatic smart matching completed", { leadId: createdLeadId, count: automaticMatches.count });
        }
      } catch (error) {
        console.error("[leads] automatic smart matching failed", error);
      }
    }
    await sql.query(
      "insert into lead_activities (lead_id, activity_type, title, note, metadata) values ($1,'follow_up',$2,$3,$4::jsonb)",
      [createdLeadId, "لید جدید ثبت شد", "پیگیری اولیه در مرکز مدیریت برای این درخواست ساخته شد.", JSON.stringify({ source: parsed.data.source })],
    ).catch(() => {});
    await createAutomaticFollowUp(sql, {
      leadId: createdLeadId,
      title: parsed.data.source === "budget_match" ? "پیگیری لید بودجه‌ای: " + parsed.data.name : "تماس اولیه با لید: " + parsed.data.name,
      description: parsed.data.source === "budget_match"
        ? "لید از جستجوی بودجه ثبت شده؛ فایل‌های پیشنهادی و بودجه مشتری را بررسی و تماس بگیرید."
        : "لید جدید سایت است؛ اطلاعات درخواست را بررسی و تماس اولیه را انجام دهید.",
      assignee: parsed.data.consultant,
      priority: parsed.data.source === "budget_match" ? "high" : "normal",
      dueMinutes: 24 * 60,
    });
  }
  return { success: true, id: createdLeadId, duplicate: false, trackingToken };
});