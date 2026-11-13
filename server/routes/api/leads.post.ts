import { createError, defineEventHandler, getCookie, readBody, setResponseHeader } from "h3";
import { assertSameOrigin, clientFingerprint } from "@/lib/admin-rate-limit.server";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { buildBudgetLeadNote, budgetEquivalent } from "@/lib/budget-lead";
import { DEFAULT_MATCH_RAHN_RATE } from "@/lib/budget-matching";
import { autoMatchLead } from "@/lib/lead-smart-matcher.server";
import { createPropertyVisitRequest } from "@/lib/property-visit-request";
import { publicPropertyVisibilitySql } from "@/lib/public-property-visibility";
import { createPublicLeadIntake, resolveActivePublicLeadConsultant, resolvePropertyLeadConsultant } from "@/lib/public-lead-intake";
import { insertPublicBudgetLead } from "@/lib/public-lead-insert";
import { findRecentPropertyRequestLead, findRecentPublicCallbackLead, withPublicLeadPhoneDedupeLock } from "@/lib/public-lead-phone-dedupe";
import { ensurePublicTrackingToken, generatePublicTrackingToken } from "@/lib/tracking-token.server";
import { consumePublicLeadAttempt } from "@/lib/public-lead-rate-limit.server";

const VISITOR_COOKIE = "hirmand_visitor_id";

const PROPERTY_SERVICE_REQUEST_DEALS = new Set([
  "درخواست کارشناسی فنی",
  "درخواست محتوای جدید",
  "بررسی حقوقی معامله",
  "درخواست تأیید اطلاعات فایل",
]);

const PROPERTY_BOUND_REQUEST_DEALS = new Set([
  ...PROPERTY_SERVICE_REQUEST_DEALS,
  "درخواست تأیید اطلاعات فایل",
  "درخواست تأمین مالی",
  "درخواست مدارک",
]);

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
  consultantId: z.string().trim().min(1).max(120).optional(),
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
  if (PROPERTY_BOUND_REQUEST_DEALS.has(value.deal) && !value.propertyId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["propertyId"], message: "برای این نوع درخواست، فایل مشخص نشده است." });
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
  if (dbSource === "unconfigured") throw createError({ statusCode: 503, statusMessage: "ثبت آنلاین درخواست در حال حاضر فعال نیست." });
  const databaseSql = await getSql();
  const attempt = await consumePublicLeadAttempt(databaseSql, "public-lead:" + clientFingerprint(event));
  if (!attempt.allowed) {
    setResponseHeader(event, "retry-after", String(attempt.retryAfterSeconds));
    throw createError({ statusCode: 429, statusMessage: "تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید." });
  }

  const parsed = schema.safeParse(await readBody(event));
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: "اطلاعات درخواست ناقص یا نامعتبر است." });
  if (typeof databaseSql.transaction !== "function") {
    throw createError({ statusCode: 503, statusMessage: "ثبت درخواست در حال حاضر در دسترس نیست." });
  }
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
      const acquisitionRows = await databaseSql.query<Record<string, unknown>>(
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
  let leadIdToAutoMatch: string | null = null;
  const result = await withPublicLeadPhoneDedupeLock(databaseSql, parsed.data.phone, async (sql) => {
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

  if (existing[0] && !(parsed.data.propertyId && parsed.data.visitPreferredAt) && !parsed.data.callbackPreferredAt && !PROPERTY_BOUND_REQUEST_DEALS.has(parsed.data.deal)) {
    if (parsed.data.source === "budget_match") {
      if (typeof sql.transaction !== "function") throw createError({ statusCode: 503, statusMessage: "به‌روزرسانی درخواست به تراکنش پایگاه داده نیاز دارد." });
      await sql.transaction(async (transactionSql) => {
        // Lock the consultant before the lead so FK ON DELETE SET NULL cannot
        // deadlock with this update's lead-row lock.
        const assignedConsultant = await resolveActivePublicLeadConsultant(transactionSql, parsed.data.consultantId);
        const locked = await transactionSql.query<{ id: string }>("select id from leads where id=$1 limit 1 for update", [existing[0].id]);
        if (!locked[0]) throw createError({ statusCode: 409, statusMessage: "درخواست تکراری هم‌زمان تغییر کرده است. دوباره تلاش کنید." });
        await transactionSql.query(
        `update leads
         set name=$2, people_count=$3, job=$4, deal=$5, property_type=$6, neighborhood=$7,
             consultant=case when $36::text is not null and consultant_id is distinct from $36 then $37 when $36::text is null and trim(coalesce($8,''))<>'' then $8 else consultant end,
             consultant_id=case when $36::text is not null then $36 when trim(coalesce($8,''))<>'' and $8 is distinct from consultant then null else consultant_id end,
             note=$9,
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
          assignedConsultant.id,
          assignedConsultant.name,
        ],
      );
      leadIdToAutoMatch = existing[0].id;
      });
      const trackingToken =
        await ensurePublicTrackingToken(sql, existing[0].id, existing[0].public_tracking_token);
      return { success: true, duplicate: true, updated: true, id: existing[0].id, trackingToken };
    }
    const trackingToken =
      await ensurePublicTrackingToken(sql, existing[0].id, existing[0].public_tracking_token);
    return { success: true, duplicate: true, id: existing[0].id, trackingToken };
  }

  if (parsed.data.callbackPreferredAt) {
    const callbackDate = new Date(parsed.data.callbackPreferredAt);
    const existingCallback = await findRecentPublicCallbackLead(sql, parsed.data.phone, callbackDate);
    if (existingCallback) {
      const trackingToken = await ensurePublicTrackingToken(sql, existingCallback.id, existingCallback.public_tracking_token);
      return { success: true, duplicate: true, callbackRequested: true, id: existingCallback.id, trackingToken };
    }
    const trackingToken = generatePublicTrackingToken();
    let assignedConsultantName = parsed.data.consultant;
    const leadId = await createPublicLeadIntake(sql, async (transactionSql) => {
      const assignedConsultant = parsed.data.propertyId
        ? await resolvePropertyLeadConsultant(transactionSql, parsed.data.propertyId, parsed.data.consultant)
        : await resolveActivePublicLeadConsultant(transactionSql, parsed.data.consultantId);
      assignedConsultantName = assignedConsultant.name || parsed.data.consultant;
      const rows = await transactionSql.query<{ id: string }>(
      "insert into leads (id,name,phone,people_count,job,deal,property_type,neighborhood,consultant,note,source,follow_up_at,callback_preferred_at,public_tracking_token,property_id,consultant_id) values ($1,$2,$3,$4,$5,'درخواست تماس',$6,$7,$8,$9,'website',$10,$11,$12,$13,$14) returning id",
      [
        crypto.randomUUID(), parsed.data.name, parsed.data.phone, parsed.data.peopleCount ?? null,
        parsed.data.job, parsed.data.propertyType, parsed.data.neighborhood, assignedConsultantName,
        parsed.data.note.trim() || "درخواست تماس زمان‌بندی‌شده با مشاور هیرمند",
        callbackDate.toISOString(), callbackDate.toISOString(), trackingToken, parsed.data.propertyId ?? null, assignedConsultant.id,
      ],
      );
      return rows[0]?.id ?? null;
    }, {
      activityType: "follow_up",
      title: "درخواست تماس زمان‌بندی‌شده",
      note: "زمان پیشنهادی تماس: " + callbackDate.toLocaleString("fa-IR") + "\n" + parsed.data.note.trim(),
      metadata: { callbackPreferredAt: callbackDate.toISOString() },
    }, {
      title: "تماس زمان‌بندی‌شده با " + parsed.data.name,
      description: "مشتری درخواست کرده در زمان پیشنهادی با او تماس گرفته شود: " + callbackDate.toLocaleString("fa-IR"),
      assignee: assignedConsultantName,
      priority: "high",
      dueMinutes: Math.max(30, Math.round((callbackDate.getTime() - Date.now()) / 60_000)),
    });
    return { success: true, id: leadId, callbackRequested: true, trackingToken };
  }

  if (parsed.data.deal === "درخواست تأیید اطلاعات فایل" && parsed.data.propertyId) {
    const propertyRows = await sql.query<{
      id: string;
      title: string;
      property_type: string;
      neighborhood: string;
      contact_name: string;
    }>(
      `select id,title,property_type,neighborhood,contact_name from properties where id::text=$1 and ${publicPropertyVisibilitySql()} and availability_status not in ('sold','rented','unavailable') limit 1`,
      [parsed.data.propertyId],
    );
    const property = propertyRows[0];
    if (!property) {
      throw createError({ statusCode: 404, statusMessage: "این فایل دیگر برای درخواست تأیید اطلاعات در دسترس نیست." });
    }
    const duplicate = await findRecentPropertyRequestLead(sql, property.id, parsed.data.phone, parsed.data.deal);
    if (duplicate) {
      const trackingToken = await ensurePublicTrackingToken(sql, duplicate.id, duplicate.public_tracking_token);
      return { success: true, duplicate: true, id: duplicate.id, verificationRequest: true, trackingToken };
    }
    const trackingToken = generatePublicTrackingToken();
    const requestNote = parsed.data.note.trim() || "درخواست بررسی و تأیید اطلاعات اصلی فایل";
    let assignedConsultantName = property.contact_name || parsed.data.consultant;
    const leadId = await createPublicLeadIntake(sql, async (transactionSql) => {
      const assignedConsultant = await resolvePropertyLeadConsultant(transactionSql, property.id, assignedConsultantName);
      assignedConsultantName = assignedConsultant.name;
      const rows = await transactionSql.query<{ id: string }>(
        "insert into leads (id,name,phone,people_count,job,deal,property_type,neighborhood,consultant,note,source,property_id,follow_up_at,public_tracking_token,consultant_id) values ($1,$2,$3,$4,$5,'درخواست تأیید اطلاعات فایل',$6,$7,$8,$9,'website',$10,current_timestamp + interval '2 hours',$11,$12) returning id",
        [crypto.randomUUID(), parsed.data.name, parsed.data.phone, parsed.data.peopleCount ?? null, parsed.data.job,
          property.property_type, property.neighborhood, assignedConsultantName,
          "فایل: " + property.title + "\n" + requestNote, property.id, trackingToken, assignedConsultant.id],
      );
      return rows[0]?.id ?? null;
    }, {
      activityType: "note",
      title: "درخواست تأیید اطلاعات فایل آنلاین ثبت شد",
      note: "فایل: " + property.title + "\n" + requestNote,
      metadata: { propertyId: property.id, requestType: "verification_information", checks: parsed.data.requestedAmenities },
    }, {
      title: "بررسی اطلاعات فایل: " + property.title,
      description: "مشتری درخواست بررسی و تأیید اطلاعات اصلی این فایل را ثبت کرده است.",
      assignee: assignedConsultantName,
      priority: "high",
      dueMinutes: 120,
    });
    return { success: true, id: leadId, verificationRequest: true, trackingToken };
  }

  if (parsed.data.propertyId && PROPERTY_SERVICE_REQUEST_DEALS.has(parsed.data.deal)) {
    const propertyRows = await sql.query<{
      id: string;
      title: string;
      property_type: string;
      neighborhood: string;
      contact_name: string;
    }>(
      `select id,title,property_type,neighborhood,contact_name from properties where id::text=$1 and ${publicPropertyVisibilitySql()} and availability_status not in ('sold','rented','unavailable') limit 1`,
      [parsed.data.propertyId],
    );
    const property = propertyRows[0];
    if (!property) {
      throw createError({
        statusCode: 404,
        statusMessage: "این فایل دیگر برای ثبت درخواست تخصصی در دسترس نیست.",
      });
    }
    const duplicate = await findRecentPropertyRequestLead(sql, property.id, parsed.data.phone, parsed.data.deal);
    if (duplicate) {
      const trackingToken = await ensurePublicTrackingToken(sql, duplicate.id, duplicate.public_tracking_token);
      const requestType = parsed.data.deal === "درخواست کارشناسی فنی"
        ? "technical_inspection"
        : parsed.data.deal === "درخواست محتوای جدید"
          ? "fresh_media"
          : "legal_review";
      return { success: true, duplicate: true, id: duplicate.id, expertServiceRequest: requestType, trackingToken };
    }

    const requestType =
      parsed.data.deal === "درخواست کارشناسی فنی"
        ? "technical_inspection"
        : parsed.data.deal === "درخواست محتوای جدید"
          ? "fresh_media"
          : "legal_review";
    const trackingToken = generatePublicTrackingToken();
    const requestNote = parsed.data.note.trim() || parsed.data.deal;
    let assignedConsultantName = property.contact_name || parsed.data.consultant;
    const leadId = await createPublicLeadIntake(sql, async (transactionSql) => {
      const assignedConsultant = await resolvePropertyLeadConsultant(transactionSql, property.id, assignedConsultantName);
      assignedConsultantName = assignedConsultant.name;
      const rows = await transactionSql.query<{ id: string }>(
        "insert into leads (id,name,phone,people_count,job,deal,property_type,neighborhood,consultant,note,source,property_id,follow_up_at,public_tracking_token,consultant_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'website',$11,current_timestamp + interval '2 hours',$12,$13) returning id",
        [crypto.randomUUID(), parsed.data.name, parsed.data.phone, parsed.data.peopleCount ?? null, parsed.data.job,
          parsed.data.deal, property.property_type, property.neighborhood, assignedConsultantName,
          "فایل: " + property.title + "\n" + requestNote, property.id, trackingToken, assignedConsultant.id],
      );
      return rows[0]?.id ?? null;
    }, {
      activityType: "note",
      title: parsed.data.deal + " آنلاین ثبت شد",
      note: "فایل: " + property.title + "\n" + requestNote,
      metadata: { propertyId: property.id, requestType },
    }, {
      title: "پیگیری " + parsed.data.deal + ": " + property.title,
      description: "مشتری برای این فایل یک سرویس تخصصی درخواست کرده است؛ جزئیات در یادداشت لید ثبت شده.",
      assignee: assignedConsultantName,
      priority: "high",
      dueMinutes: 120,
    });

    return { success: true, id: leadId, expertServiceRequest: requestType, trackingToken };
  }

  if (parsed.data.deal === "پیشنهاد قیمت" && parsed.data.offerAmount != null && parsed.data.propertyId) {
    const propertyRows = await sql.query<{ id: string; title: string; property_type: string; neighborhood: string; contact_name: string; price: number | null }>(
      `select id,title,property_type,neighborhood,contact_name,price from properties where id::text=$1 and ${publicPropertyVisibilitySql()} and availability_status not in ('sold','rented','unavailable') limit 1`,
      [parsed.data.propertyId],
    );
    const property = propertyRows[0];
    if (!property) throw createError({ statusCode: 404, statusMessage: "این فایل دیگر برای دریافت پیشنهاد در دسترس نیست." });
    const trackingToken = generatePublicTrackingToken();
    let assignedConsultantName = property.contact_name || parsed.data.consultant;
    const leadId = await createPublicLeadIntake(sql, async (transactionSql) => {
      const assignedConsultant = await resolvePropertyLeadConsultant(transactionSql, property.id, assignedConsultantName);
      assignedConsultantName = assignedConsultant.name;
      const rows = await transactionSql.query<{ id: string }>(
        "insert into leads (id,name,phone,people_count,job,deal,property_type,neighborhood,consultant,note,source,property_id,offer_amount,offer_conditions,follow_up_at,public_tracking_token,consultant_id) values ($1,$2,$3,$4,$5,'پیشنهاد قیمت',$6,$7,$8,$9,'website',$10,$11,$12,current_timestamp + interval '2 hours',$13,$14) returning id",
        [crypto.randomUUID(), parsed.data.name, parsed.data.phone, parsed.data.peopleCount ?? null, parsed.data.job,
          property.property_type, property.neighborhood, assignedConsultantName,
          "فایل: " + property.title + "\n" + (parsed.data.note.trim() || "پیشنهاد قیمت ثبت شد."),
          property.id, parsed.data.offerAmount, parsed.data.offerConditions, trackingToken, assignedConsultant.id],
      );
      return rows[0]?.id ?? null;
    }, {
      activityType: "note",
      title: "پیشنهاد قیمت آنلاین ثبت شد",
      note: "مبلغ پیشنهاد: " + parsed.data.offerAmount.toLocaleString("fa-IR") + " تومان\n" + parsed.data.offerConditions,
      metadata: { propertyId: property.id, offerAmount: parsed.data.offerAmount, propertyPrice: property.price },
    }, {
      title: "بررسی پیشنهاد قیمت: " + property.title,
      description: "پیشنهاد قیمت آنلاین مشتری را بررسی و نتیجه مذاکره را ثبت کنید.",
      assignee: assignedConsultantName,
      priority: "urgent",
      dueMinutes: 120,
    });
    return { success: true, id: leadId, offerSubmitted: true, trackingToken };
  }

  if (parsed.data.propertyId && parsed.data.visitPreferredAt) {
    const visitDate = new Date(parsed.data.visitPreferredAt);
    const trackingToken = generatePublicTrackingToken();
    const visitResult = await createPropertyVisitRequest(sql, {
      propertyId: parsed.data.propertyId,
      visitAt: visitDate.toISOString(),
      trackingToken,
      name: parsed.data.name,
      phone: parsed.data.phone,
      peopleCount: parsed.data.peopleCount ?? null,
      job: parsed.data.job,
      floorPreference: parsed.data.floorPreference,
      consultant: parsed.data.consultant,
      note: parsed.data.note.trim() || "درخواست بازدید فایل",
      intake: {
        activity: (property) => ({
          activityType: "visit",
          title: "درخواست بازدید ثبت شد",
          note: "فایل: " + property.title + "\n" + (parsed.data.note.trim() || "درخواست بازدید از فایل"),
          metadata: { propertyId: property.id, visitPreferredAt: visitDate.toISOString() },
        }),
        followUp: (property) => ({
          title: "پیگیری فوری درخواست بازدید: " + property.title,
          description: "مشتری برای این فایل درخواست بازدید ثبت کرده است؛ زمان پیشنهادی: " + visitDate.toLocaleString("fa-IR"),
          assignee: property.consultant_name || property.contact_name,
          priority: "urgent",
          dueMinutes: 60,
        }),
      },
    });
    if (visitResult.kind === "not_found") throw createError({ statusCode: 404, statusMessage: "فایل موردنظر برای بازدید در دسترس نیست." });
    if (visitResult.kind === "conflict") {
      throw createError({
        statusCode: 409,
        statusMessage: "این بازه برای این فایل قبلاً درخواستی دارد. لطفاً یکی از زمان‌های خالی را انتخاب کنید.",
      });
    }
    if (visitResult.kind !== "created" && visitResult.kind !== "duplicate") {
      throw createError({ statusCode: 500, statusMessage: "ثبت درخواست بازدید انجام نشد." });
    }
    return {
      success: true,
      duplicate: visitResult.kind === "duplicate",
      id: visitResult.id,
      visitRequested: true,
      trackingToken: visitResult.trackingToken,
    };
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
      `select id,title,property_type,neighborhood,contact_name,price from properties where id::text=$1 and ${publicPropertyVisibilitySql()} and availability_status not in ('sold','rented','unavailable') limit 1`,
      [parsed.data.propertyId],
    );
    const property = propertyRows[0];
    if (!property) throw createError({ statusCode: 404, statusMessage: "این فایل دیگر برای بررسی تأمین مالی در دسترس نیست." });
    const duplicate = await findRecentPropertyRequestLead(sql, property.id, parsed.data.phone, parsed.data.deal);
    if (duplicate) {
      const trackingToken = await ensurePublicTrackingToken(sql, duplicate.id, duplicate.public_tracking_token);
      return { success: true, duplicate: true, id: duplicate.id, financingRequest: true, trackingToken };
    }

    const trackingToken = generatePublicTrackingToken();
    let assignedConsultantName = property.contact_name || parsed.data.consultant;
    const leadId = await createPublicLeadIntake(sql, async (transactionSql) => {
      const assignedConsultant = await resolvePropertyLeadConsultant(transactionSql, property.id, assignedConsultantName);
      assignedConsultantName = assignedConsultant.name;
      const rows = await transactionSql.query<{ id: string }>(
        "insert into leads (id,name,phone,people_count,job,deal,property_type,neighborhood,consultant,note,source,property_id,follow_up_at,public_tracking_token,consultant_id) values ($1,$2,$3,$4,$5,'درخواست تأمین مالی',$6,$7,$8,$9,'website',$10,current_timestamp + interval '2 hours',$11,$12) returning id",
        [crypto.randomUUID(), parsed.data.name, parsed.data.phone, parsed.data.peopleCount ?? null, parsed.data.job,
          property.property_type, property.neighborhood, assignedConsultantName,
          parsed.data.note.trim() || "درخواست بررسی تأمین مالی برای فایل", property.id, trackingToken, assignedConsultant.id],
      );
      return rows[0]?.id ?? null;
    }, {
      activityType: "note",
      title: "درخواست بررسی تأمین مالی آنلاین",
      note: "فایل: " + property.title + "\n" + (parsed.data.note.trim() || "درخواست بررسی سناریوی تأمین مالی"),
      metadata: { propertyId: property.id, requestType: "financing_review" },
    }, {
      title: "بررسی تأمین مالی: " + property.title,
      description: "مشتری برای این فایل درخواست بررسی سناریوی تأمین مالی ثبت کرده است.",
      assignee: assignedConsultantName,
      priority: "high",
      dueMinutes: 120,
    });

    return { success: true, id: leadId, financingRequest: true, trackingToken };
  }

  if (parsed.data.deal === "درخواست مدارک" && parsed.data.propertyId) {
    const propertyRows = await sql.query<{
      id: string;
      title: string;
      property_type: string;
      neighborhood: string;
      contact_name: string;
    }>(
      `select id,title,property_type,neighborhood,contact_name from properties where id::text=$1 and ${publicPropertyVisibilitySql()} and availability_status not in ('sold','rented','unavailable') limit 1`,
      [parsed.data.propertyId],
    );
    const property = propertyRows[0];
    if (!property) throw createError({ statusCode: 404, statusMessage: "این فایل دیگر برای دریافت درخواست مدارک در دسترس نیست." });
    const duplicate = await findRecentPropertyRequestLead(sql, property.id, parsed.data.phone, parsed.data.deal);
    if (duplicate) {
      const trackingToken = await ensurePublicTrackingToken(sql, duplicate.id, duplicate.public_tracking_token);
      return { success: true, duplicate: true, id: duplicate.id, documentRequest: true, trackingToken };
    }

    const trackingToken = generatePublicTrackingToken();
    const requestNote = parsed.data.note.trim() || "درخواست بررسی مدارک و شرایط معامله";
    let assignedConsultantName = property.contact_name || parsed.data.consultant;
    const leadId = await createPublicLeadIntake(sql, async (transactionSql) => {
      const assignedConsultant = await resolvePropertyLeadConsultant(transactionSql, property.id, assignedConsultantName);
      assignedConsultantName = assignedConsultant.name;
      const rows = await transactionSql.query<{ id: string }>(
        "insert into leads (id,name,phone,people_count,job,deal,property_type,neighborhood,consultant,note,source,property_id,follow_up_at,public_tracking_token,consultant_id) values ($1,$2,$3,$4,$5,'درخواست مدارک',$6,$7,$8,$9,'website',$10,current_timestamp + interval '2 hours',$11,$12) returning id",
        [crypto.randomUUID(), parsed.data.name, parsed.data.phone, parsed.data.peopleCount ?? null, parsed.data.job,
          property.property_type, property.neighborhood, assignedConsultantName,
          requestNote, property.id, trackingToken, assignedConsultant.id],
      );
      return rows[0]?.id ?? null;
    }, {
      activityType: "note",
      title: "درخواست بررسی مدارک آنلاین",
      note: "فایل: " + property.title + "\n" + requestNote,
      metadata: { propertyId: property.id, requestType: "document_review" },
    }, {
      title: "بررسی مدارک: " + property.title,
      description: "مشتری درخواست بررسی مدارک و شرایط این فایل را ثبت کرده است؛ جزئیات درخواست در یادداشت لید موجود است.",
      assignee: assignedConsultantName,
      priority: "high",
      dueMinutes: 120,
    });

    return { success: true, id: leadId, documentRequest: true, trackingToken };
  }

  const trackingToken = generatePublicTrackingToken();
  let assignedConsultantName = parsed.data.consultant;
  const createdLeadId = await createPublicLeadIntake(sql, async (transactionSql) => {
    const assignedConsultant = await resolveActivePublicLeadConsultant(transactionSql, parsed.data.consultantId);
    assignedConsultantName = assignedConsultant.name || parsed.data.consultant;
    return insertPublicBudgetLead(transactionSql, {
      id: crypto.randomUUID(),
      name: parsed.data.name,
      phone: parsed.data.phone,
      peopleCount: parsed.data.peopleCount ?? null,
      job: parsed.data.job,
      deal: parsed.data.deal,
      propertyType: parsed.data.propertyType,
      neighborhood: parsed.data.neighborhood,
      consultantName: assignedConsultantName,
      note,
      source: parsed.data.source,
      consultantId: assignedConsultant.id,
      acquisition,
      leaseDeadline,
      budgetDeposit: budgetDeposit || null,
      budgetRent: budgetRent || null,
      budgetPurchase: budgetPurchase || null,
      budgetSale: budgetSale || null,
      budgetRate: parsed.data.source === "budget_match" ? DEFAULT_MATCH_RAHN_RATE : null,
      budgetEquivalent: equivalent || null,
      budgetBedrooms: parsed.data.budgetBedrooms ?? null,
      floorPreference: parsed.data.floorPreference,
      matchedProperties,
      budgetDepositMin: budgetDepositMin || null,
      budgetDepositMax: budgetDeposit || null,
      budgetRentMin: budgetRentMin || null,
      budgetRentMax: budgetRent || null,
      budgetPurchaseMin: budgetPurchaseMin || null,
      budgetPurchaseMax: budgetPurchase || null,
      budgetSaleMin: budgetSaleMin || null,
      budgetSaleMax: budgetSale || null,
      requestedAmenities: parsed.data.requestedAmenities,
      requestedBedrooms: parsed.data.requestedBedrooms ?? null,
      trackingToken,
    });
  }, {
    activityType: "follow_up",
    title: "لید جدید ثبت شد",
    note: "پیگیری اولیه در مرکز مدیریت برای این درخواست ساخته شد.",
    metadata: { source: parsed.data.source },
  }, {
    title: parsed.data.source === "budget_match" ? "پیگیری لید بودجه‌ای: " + parsed.data.name : "تماس اولیه با لید: " + parsed.data.name,
    description: parsed.data.source === "budget_match"
      ? "لید از جستجوی بودجه ثبت شده؛ فایل‌های پیشنهادی و بودجه مشتری را بررسی و تماس بگیرید."
      : "لید جدید سایت است؛ اطلاعات درخواست را بررسی و تماس اولیه را انجام دهید.",
    assignee: assignedConsultantName,
    priority: parsed.data.source === "budget_match" ? "high" : "normal",
    dueMinutes: 24 * 60,
  });
  if (parsed.data.deal === "خرید" || parsed.data.deal === "فروش" || parsed.data.deal === "رهن" || parsed.data.deal === "اجاره") {
    leadIdToAutoMatch = createdLeadId;
  }
  return { success: true, id: createdLeadId, duplicate: false, trackingToken };
  });
  if (leadIdToAutoMatch) {
    try {
      const automaticMatches = await autoMatchLead(databaseSql, leadIdToAutoMatch, { mode: "smart", limit: 8 });
      if (automaticMatches.count > 0) {
        console.info("[leads] automatic smart matching completed", { leadId: leadIdToAutoMatch, count: automaticMatches.count });
      }
    } catch (error) {
      console.error("[leads] automatic smart matching failed", error);
    }
  }
  return result;
});
