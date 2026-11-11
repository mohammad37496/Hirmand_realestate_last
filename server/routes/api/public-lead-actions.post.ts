import { createError, defineEventHandler, getQuery, readBody, setResponseHeader } from "h3";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { assertSameOrigin, clientFingerprint, consumeAdminAttempt, tooManyAttemptsError } from "@/lib/admin-rate-limit.server";
import { cancelPropertyVisitRequest, reschedulePropertyVisitRequest } from "@/lib/property-visit-request";
import { isDuplicatePublicLeadFeedbackError } from "@/lib/public-lead-feedback";

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
    "select id, public_tracking_token, visit_status, visit_preferred_at from leads where public_tracking_token=$1 limit 1",
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
    const rescheduleResult = await reschedulePropertyVisitRequest(sql, {
      leadId,
      visitAt: nextDate,
    });
    if (rescheduleResult.kind === "not_found") {
      throw createError({ statusCode: 404, statusMessage: "درخواست بازدید یا فایل موردنظر پیدا نشد." });
    }
    if (rescheduleResult.kind === "not_reschedulable") {
      throw createError({ statusCode: 409, statusMessage: "برای این درخواست، امکان تغییر زمان بازدید وجود ندارد." });
    }
    if (rescheduleResult.kind === "conflict") {
      throw createError({ statusCode: 409, statusMessage: "این بازه برای بازدید دیگری رزرو شده است. زمان دیگری را انتخاب کنید." });
    }
    if (rescheduleResult.kind !== "updated") {
      throw createError({ statusCode: 500, statusMessage: "تغییر زمان بازدید انجام نشد." });
    }
    return { success: true, action: "reschedule", message: "زمان پیشنهادی جدید ثبت شد و برای تأیید دوباره به هیرمند ارسال شد." };
  }

  if (parsed.data.action === "cancel") {
    const cancelResult = await cancelPropertyVisitRequest(sql, leadId);
    if (cancelResult.kind !== "cancelled") {
      throw createError({ statusCode: 409, statusMessage: "این بازدید در حالتی نیست که از طرف شما قابل لغو باشد." });
    }
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

  try {
    await sql.query(
      "insert into lead_visit_feedback(lead_id,tracking_token,rating,interest,note) values($1,$2,$3,$4,$5)",
      [leadId, parsed.data.code, parsed.data.rating, parsed.data.interest, parsed.data.note],
    );
  } catch (error) {
    if (isDuplicatePublicLeadFeedbackError(error)) {
      throw createError({ statusCode: 409, statusMessage: "بازخورد این بازدید قبلاً ثبت شده است." });
    }
    throw error;
  }

  return { success: true, action: "feedback", message: "بازخورد شما با موفقیت ثبت شد. ممنون که به بهبود خدمات هیرمند کمک می‌کنید." };
});
