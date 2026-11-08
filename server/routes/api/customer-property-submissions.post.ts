import { createError, defineEventHandler, getCookie, readBody, setResponseHeader } from "h3";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { isAllowedMediaRef, isVideoUrl } from "@/lib/media";
import { isAllowedPropertyFloorValue } from "@/lib/property-options";
import { assertSameOrigin, clientFingerprint, consumeAdminAttempt, tooManyAttemptsError } from "@/lib/admin-rate-limit.server";
import { resubmitCustomerPropertySubmissionWithLeadSync } from "@/lib/customer-property-submission-lead-sync";
import { findPotentialDuplicateCustomerPropertySubmissions } from "@/lib/customer-property-submission-duplicate";
import { createInitialCustomerPropertySubmission } from "@/lib/customer-property-submission-create";

const VISITOR_COOKIE = "hirmand_visitor_id";

function createTrackingToken() {
  const year = String(new Date().getFullYear()).slice(-2);
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
  return "HIR-" + year + "-" + random;
}

const moneyField = z.union([z.string().regex(/^\d{1,20}$/), z.null()]).optional().default(null);
const optionalText = (max: number) => z.string().trim().max(max).optional().default("");

const submissionSchema = z.object({
  website: z.string().max(0).optional().default(""),
  ownerName: z.string().trim().min(2).max(80),
  ownerPhone: z.string().trim().regex(/^09\d{9}$/),
  title: z.string().trim().min(8).max(180),
  transactionType: z.enum(["buy","sell","rent","mortgage"]),
  propertyType: z.enum(["apartment","villa","office","heritage","land","commercial"]),
  neighborhood: z.string().trim().min(2).max(80),
  address: z.string().trim().max(240).optional().default(""),
  areaM2: z.number().int().min(1).max(100000),
  bedrooms: z.number().int().min(0).max(30).nullable().optional().default(null),
  bathrooms: z.number().int().min(0).max(30).nullable().optional().default(null),
  floor: z.number().int().refine(isAllowedPropertyFloorValue, "طبقه باید منفی ۶۰ یا بین ۰ تا ۲۰ باشد.").nullable().optional().default(null),
  totalFloors: z.number().int().min(0).max(200).nullable().optional().default(null),
  builtYear: z.number().int().min(1200).max(2500).nullable().optional().default(null),
  orientation: z.enum(["north","south","east","west","northeast","northwest","southeast","southwest","two_fronts","three_fronts","four_fronts","other"]).nullable().optional().default(null),
  parking: z.boolean().default(false),
  elevator: z.boolean().default(false),
  storage: z.boolean().default(false),
  painted: z.boolean().default(false),
  wallpaper: z.boolean().default(false),
  convertible: z.boolean().default(false),
  cabinetType: optionalText(40),
  flooringType: optionalText(40),
  coolingSystem: optionalText(40),
  heatingSystem: optionalText(40),
  wallClosetType: optionalText(40),
  otherAmenities: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  price: moneyField,
  deposit: moneyField,
  rent: moneyField,
  description: z.string().trim().min(80).max(5000),
  features: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  images: z.array(z.string().trim().min(1).max(2048).refine(isAllowedMediaRef, "نشانی رسانه نامعتبر است.")).min(1).max(20),
  latitude: z.number().finite().min(-90).max(90).nullable().optional().default(null),
  longitude: z.number().finite().min(-180).max(180).nullable().optional().default(null),
}).superRefine((value, ctx) => {
  const videos = value.images.filter((src) => isVideoUrl(src));
  const images = value.images.filter((src) => !isVideoUrl(src));
  if (!images.length) ctx.addIssue({ code:"custom", path:["images"], message:"حداقل یک تصویر لازم است." });
  if (videos.length > 1) ctx.addIssue({ code:"custom", path:["images"], message:"حداکثر یک ویدئو مجاز است." });
  const hasMoney = (v: string | null) => Boolean(v && /^\d{1,20}$/.test(v));
  if (value.transactionType === "sell" && !hasMoney(value.price)) ctx.addIssue({ code:"custom", path:["price"], message:"برای فروش قیمت کل را وارد کنید." });
  if (value.transactionType === "rent" && !hasMoney(value.deposit) && !hasMoney(value.rent)) ctx.addIssue({ code:"custom", path:["deposit"], message:"برای اجاره حداقل رهن یا اجاره را وارد کنید." });
  if (value.transactionType === "mortgage" && !hasMoney(value.deposit)) ctx.addIssue({ code:"custom", path:["deposit"], message:"برای رهن مبلغ رهن را وارد کنید." });
});

function buildLeadNote(data: z.infer<typeof submissionSchema>) {
  return [
    "ثبت کامل ملک توسط مشتری — در انتظار بررسی کارشناس",
    "عنوان: " + data.title,
    "نوع معامله: " + data.transactionType,
    "نوع ملک: " + data.propertyType,
    "محله: " + data.neighborhood,
    "متراژ: " + String(data.areaM2) + " متر",
    "رسانه: " + String(data.images.length) + " فایل",
  ].join("\n");
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  if (dbSource === "unconfigured") throw createError({ statusCode: 503, statusMessage: "ثبت ملک آنلاین موقتاً در دسترس نیست." });
  assertSameOrigin(event);

  const attempt = await consumeAdminAttempt("customer-property:" + clientFingerprint(event));
  if (!attempt.allowed) throw tooManyAttemptsError(attempt.retryAfterSeconds);

  const rawBody = await readBody(event);
  const rawAction = rawBody && typeof rawBody === "object" ? (rawBody as Record<string, unknown>).action : undefined;
  const rawTrackingToken = rawBody && typeof rawBody === "object" ? (rawBody as Record<string, unknown>).trackingToken : undefined;
  const sql = await getSql();

  if (rawAction === "load" || rawAction === "resubmit") {
    const trackingToken = typeof rawTrackingToken === "string"
      ? rawTrackingToken.trim().toUpperCase().replace(/\s+/g, "")
      : "";
    if (!/^HIR-[A-Z0-9]{2}-[A-F0-9]{12}$/.test(trackingToken)) {
      throw createError({ statusCode: 400, statusMessage: "کد رهگیری نامعتبر است." });
    }

    // Keep timestamptz as text: node-postgres Date parsing truncates microseconds and breaks the CAS.
    const rows = await sql.query<Record<string, unknown>>(
      "select id,lead_id,public_tracking_token,status,owner_name,owner_phone,property_data,review_note,updated_at::text as updated_at from customer_property_submissions where public_tracking_token=$1 limit 1",
      [trackingToken],
    );
    const submission = rows[0];
    if (!submission) throw createError({ statusCode: 404, statusMessage: "درخواست ثبت ملک پیدا نشد." });

    if (rawAction === "load") {
      if (String(submission.status) !== "rejected") {
        throw createError({ statusCode: 409, statusMessage: "فقط درخواست‌های ردشده که نیاز به اصلاح دارند قابل ویرایش هستند." });
      }
      const propertyData = submission.property_data && typeof submission.property_data === "object"
        ? { ...(submission.property_data as Record<string, unknown>) }
        : {};
      propertyData.ownerName = String(submission.owner_name ?? propertyData.ownerName ?? "");
      propertyData.ownerPhone = String(submission.owner_phone ?? propertyData.ownerPhone ?? "");
      return {
        success: true,
        status: "rejected",
        trackingToken,
        reviewNote: String(submission.review_note ?? ""),
        propertyData,
      };
    }

    if (String(submission.status) !== "rejected") {
      throw createError({ statusCode: 409, statusMessage: "این درخواست در وضعیت اصلاح نیست؛ ابتدا نتیجه بررسی آن را در پیگیری مشاهده کنید." });
    }

    const parsed = submissionSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw createError({ statusCode: 422, statusMessage: parsed.error.issues[0]?.message || "اطلاعات ملک ناقص یا نامعتبر است." });
    }
    if (parsed.data.website) throw createError({ statusCode: 400, statusMessage: "درخواست نامعتبر است." });

    const previousReviewNote = String(submission.review_note ?? "").trim();
    if (!sql.transaction) throw createError({ statusCode: 503, statusMessage: "تراکنش امن برای ارسال مجدد پرونده در دسترس نیست." });
    const resubmitted = await resubmitCustomerPropertySubmissionWithLeadSync(sql, {
      id: String(submission.id),
      expectedUpdatedAt: String(submission.updated_at ?? ""),
      ownerName: parsed.data.ownerName,
      ownerPhone: parsed.data.ownerPhone,
      propertyData: JSON.stringify(parsed.data),
      previousReviewNote,
      trackingToken,
      leadId: submission.lead_id == null ? null : String(submission.lead_id),
      deal: "اصلاح ثبت ملک - " + parsed.data.transactionType,
      propertyType: parsed.data.propertyType,
      neighborhood: parsed.data.neighborhood,
      leadNote: buildLeadNote(parsed.data),
    });
    if (!resubmitted) {
      throw createError({ statusCode: 409, statusMessage: "این درخواست هم‌زمان تغییر کرده است. لطفاً وضعیت جدید آن را بررسی کنید." });
    }
    return {
      success: true,
      duplicate: false,
      submissionId: String(submission.id),
      trackingToken,
      message: "اصلاحات ملک با موفقیت ارسال شد و دوباره در صف بررسی هیرمند قرار گرفت.",
    };
  }

  const parsed = submissionSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: parsed.error.issues[0]?.message || "اطلاعات ملک ناقص یا نامعتبر است." });
  }
  if (parsed.data.website) throw createError({ statusCode: 400, statusMessage: "درخواست نامعتبر است." });

  const trackingToken = createTrackingToken();
  const submissionId = crypto.randomUUID();
  const leadId = crypto.randomUUID();
  void getCookie(event, VISITOR_COOKIE);

  const normalizedTitle = parsed.data.title.trim().toLowerCase();
  let possibleDuplicate = false;
  let possibleDuplicateCount = 0;
  try {
    const duplicateRows = await findPotentialDuplicateCustomerPropertySubmissions(sql, {
      excludeSubmissionId: submissionId,
      ownerPhone: parsed.data.ownerPhone,
      neighborhood: parsed.data.neighborhood,
      areaM2: String(parsed.data.areaM2),
      normalizedTitle,
    });
    possibleDuplicate = duplicateRows.length > 0;
    possibleDuplicateCount = duplicateRows.length;
  } catch (error) {
    console.warn("[customer-property-submissions] optional duplicate lookup failed", error);
  }

  const creation = await createInitialCustomerPropertySubmission(sql, {
    leadId,
    submissionId,
    trackingToken,
    ownerName: parsed.data.ownerName,
    ownerPhone: parsed.data.ownerPhone,
    deal: "ثبت ملک - " + parsed.data.transactionType,
    propertyType: parsed.data.propertyType,
    neighborhood: parsed.data.neighborhood,
    leadNote: buildLeadNote(parsed.data),
    propertyData: JSON.stringify(parsed.data),
    mediaCount: parsed.data.images.length,
    possibleDuplicate,
  });
  if (creation.kind === "duplicate") {
    return { success:true, duplicate:true, trackingToken: creation.trackingToken };
  }
  return {
    success:true,
    duplicate:false,
    possibleDuplicate,
    possibleDuplicateCount,
    submissionId,
    trackingToken,
    message:"ملک شما با موفقیت برای بررسی کارشناسان هیرمند ارسال شد.",
  };
});
