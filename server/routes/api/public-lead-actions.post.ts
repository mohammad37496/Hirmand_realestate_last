import { createError, defineEventHandler, readBody, setResponseHeader } from "h3";
import { z } from "zod";
import { dbSource, getSql, withSqlTransaction } from "@/lib/db";
import { assertSameOrigin, clientFingerprint, consumeAdminAttempt, tooManyAttemptsError } from "@/lib/admin-rate-limit.server";
import { cancelPropertyVisit, reschedulePropertyVisit } from "@/lib/property-visit-scheduling.server";

const tokenSchema = z.string().trim().toUpperCase().regex(/^HIR-[A-Z0-9]{2}-[A-F0-9]{12}$/);
const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("reschedule"),
    code: tokenSchema,
    visitPreferredAt: z.string().trim().min(10).max(80),
  }),
  z.object({
    action: z.literal("cancel"),
    code: tokenSchema,
  }),
  z.object({
    action: z.literal("feedback"),
    code: tokenSchema,
    rating: z.number().int().min(1).max(5),
    interest: z.enum(["interested", "unsure", "not_interested"]).default("unsure"),
    note: z.string().trim().max(1000).default(""),
  }),
]);

function parseVisitDate(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  if (parsed.getTime() < Date.now() + 30 * 60 * 1000) return null;
  return parsed.toISOString();
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  assertSameOrigin(event);
  const attempt = await consumeAdminAttempt("public-lead-action:" + clientFingerprint(event));
  if (!attempt.allowed) throw tooManyAttemptsError(attempt.retryAfterSeconds);

  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "سامانه پیگیری موقتاً در دسترس نیست." });
  }

  const body = await readBody(event).catch(() => null);
  const wantsAction = Boolean(body && typeof body === "object" && "action" in body);
  if (!wantsAction) {
    throw createError({ statusCode: 400, statusMessage: "عملیات نامعتبر است." });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: "اطلاعات عملیات نامعتبر است." });
  }

  const sql = await getSql();
  const leadRows = await sql.query<Record<string, unknown>>(
    "select id, public_tracking_token, property_id, visit_status, visit_preferred_at from leads where public_tracking_token=$1 limit 1",
    [parsed.data.code],
  );
  const lead = leadRows[0];
  if (!lead) {
    throw createError({ statusCode: 404, statusMessage: "درخواستی با این کد پیدا نشد." });
  }

  const leadId = String(lead.id);
  const visitStatus = String(lead.visit_status ?? "none");

  if (parsed.data.action === "reschedule") {
    if (visitStatus !== "requested" && visitStatus !== "confirmed") {
      throw createError({ statusCode: 409, statusMessage: "برای این درخواست، امکان تغییر زمان بازدید وجود ندارد." });
    }
    const nextDate = parseVisitDate(parsed.data.visitPreferredAt);
    if (!nextDate) {
      throw createError({ statusCode: 422, statusMessage: "زمان جدید باید معتبر و حداقل ۳۰ دقیقه از اکنون فاصله داشته باشد." });
    }
    const propertyId = String(lead.property_id ?? "").trim();
    if (!propertyId) throw createError({ statusCode: 409, statusMessage: "برای این درخواست فایل مشخصی ثبت نشده است؛ امکان تغییر زمان بازدید وجود ندارد." });
    const currentVisitTime = new Date(String(lead.visit_preferred_at ?? ""));
    if (!Number.isFinite(currentVisitTime.getTime())) throw createError({ statusCode: 409, statusMessage: "زمان فعلی بازدید معتبر نیست؛ با هیرمند تماس بگیرید." });
    const result = await withSqlTransaction((tx) => reschedulePropertyVisit(tx, {
      leadId,
      trackingToken: parsed.data.code,
      propertyId,
      expectedVisitAt: currentVisitTime.toISOString(),
      visitAt: nextDate,
    }));
    if (result === "property_missing") throw createError({ statusCode: 404, statusMessage: "فایل موردنظر برای بازدید پیدا نشد." });
    if (result === "conflict") throw createError({ statusCode: 409, statusMessage: "این بازه برای بازدید دیگری رزرو شده است. زمان دیگری را انتخاب کنید." });
    if (result === "stale") throw createError({ statusCode: 409, statusMessage: "وضعیت این بازدید هم‌زمان تغییر کرده است؛ صفحه پیگیری را تازه‌سازی کنید." });
    return { success: true, action: "reschedule", message: "زمان پیشنهادی جدید ثبت شد و برای تأیید دوباره به هیرمند ارسال شد." };
  }

  if (parsed.data.action === "cancel") {
    if (visitStatus !== "requested" && visitStatus !== "confirmed") {
      throw createError({ statusCode: 409, statusMessage: "این بازدید در حالتی نیست که از طرف شما قابل لغو باشد." });
    }
    const propertyId = String(lead.property_id ?? "").trim();
    const currentVisitTime = new Date(String(lead.visit_preferred_at ?? ""));
    if (!propertyId || !Number.isFinite(currentVisitTime.getTime())) {
      throw createError({ statusCode: 409, statusMessage: "اطلاعات فایل یا زمان بازدید معتبر نیست؛ با هیرمند تماس بگیرید." });
    }
    const cancelled = await withSqlTransaction((tx) => cancelPropertyVisit(tx, {
      leadId,
      trackingToken: parsed.data.code,
      propertyId,
      expectedVisitAt: currentVisitTime.toISOString(),
    }));
    if (cancelled === "stale") throw createError({ statusCode: 409, statusMessage: "وضعیت یا زمان این بازدید هم‌زمان تغییر کرده است؛ صفحه پیگیری را تازه‌سازی کنید." });
    return { success: true, action: "cancel", message: "درخواست بازدید لغو شد." };
  }

  if (visitStatus !== "completed") {
    throw createError({ statusCode: 409, statusMessage: "ثبت بازخورد پس از انجام بازدید فعال می‌شود." });
  }

  const existing = await sql.query<{ id: string }>(
    "select id::text as id from lead_visit_feedback where lead_id=$1 limit 1",
    [leadId],
  );
  if (existing[0]) {
    throw createError({ statusCode: 409, statusMessage: "بازخورد این بازدید قبلاً ثبت شده است." });
  }

  await sql.query(
    "insert into lead_visit_feedback(lead_id,tracking_token,rating,interest,note) values($1,$2,$3,$4,$5)",
    [leadId, parsed.data.code, parsed.data.rating, parsed.data.interest, parsed.data.note],
  );

  return { success: true, action: "feedback", message: "بازخورد شما با موفقیت ثبت شد. ممنون که به بهبود خدمات هیرمند کمک می‌کنید." };
});
