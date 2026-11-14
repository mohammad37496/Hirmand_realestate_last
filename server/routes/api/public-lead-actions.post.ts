import { createError, defineEventHandler, readBody, setResponseHeader } from "h3";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { assertSameOrigin, clientFingerprint, consumeAdminAttempt, tooManyAttemptsError } from "@/lib/admin-rate-limit.server";
import { cancelPropertyVisitRequest, reschedulePropertyVisitRequestInTransaction } from "@/lib/property-visit-request";
import { isDuplicatePublicLeadFeedbackError } from "@/lib/public-lead-feedback";
import { isValidPublicTrackingToken } from "@/lib/tracking-token";
import { lockPublicLeadTrackingTarget } from "@/lib/public-lead-tracking";

const tokenSchema = z.string().trim().toUpperCase().refine(isValidPublicTrackingToken);
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
  if (typeof sql.transaction !== "function") {
    throw createError({ statusCode: 503, statusMessage: "سامانه پیگیری موقتاً در دسترس نیست." });
  }
  let actionResult: { kind: string };
  try {
    actionResult = await sql.transaction(async (transactionSql) => {
      const target = await lockPublicLeadTrackingTarget(transactionSql, parsed.data.code);
      if (!target) return { kind: "not_found" };
      const leadRows = await transactionSql.query<{ id: string; visit_status: string | null }>(
        "select id, visit_status from leads where id=$1 limit 1",
        [target.leadId],
      );
      const lead = leadRows[0];
      if (!lead) return { kind: "not_found" };
      const visitStatus = String(lead.visit_status ?? "none");

      if (parsed.data.action === "reschedule") {
        if (visitStatus !== "requested" && visitStatus !== "confirmed") return { kind: "not_reschedulable" };
        const nextDate = parseVisitDate(parsed.data.visitPreferredAt);
        if (!nextDate) return { kind: "invalid_date" };
        return reschedulePropertyVisitRequestInTransaction(transactionSql, {
          leadId: target.leadId,
          visitAt: nextDate,
        });
      }

      if (parsed.data.action === "cancel") {
        return cancelPropertyVisitRequest(transactionSql, target.leadId);
      }

      if (visitStatus !== "completed") return { kind: "feedback_not_ready" };
      const existing = await transactionSql.query<{ id: string }>(
        "select id::text as id from lead_visit_feedback where tracking_token=$1 limit 1",
        [target.trackingToken],
      );
      if (existing[0]) return { kind: "feedback_exists" };
      await transactionSql.query(
        "insert into lead_visit_feedback(lead_id,tracking_token,rating,interest,note) values($1,$2,$3,$4,$5)",
        [target.leadId, target.trackingToken, parsed.data.rating, parsed.data.interest, parsed.data.note],
      );
      return { kind: "feedback_saved" };
    });
  } catch (error) {
    if (isDuplicatePublicLeadFeedbackError(error)) {
      throw createError({ statusCode: 409, statusMessage: "بازخورد این بازدید قبلاً ثبت شده است." });
    }
    throw error;
  }

  if (actionResult.kind === "not_found") {
    throw createError({ statusCode: 404, statusMessage: "درخواستی با این کد پیدا نشد." });
  }
  if (actionResult.kind === "invalid_date") {
    throw createError({ statusCode: 422, statusMessage: "زمان جدید باید معتبر و حداقل ۳۰ دقیقه از اکنون فاصله داشته باشد." });
  }
  if (actionResult.kind === "not_reschedulable") {
    throw createError({ statusCode: 409, statusMessage: "برای این درخواست، امکان تغییر زمان بازدید وجود ندارد." });
  }
  if (actionResult.kind === "not_cancellable") {
    throw createError({ statusCode: 409, statusMessage: "این بازدید در حالتی نیست که از طرف شما قابل لغو باشد." });
  }
  if (actionResult.kind === "conflict") {
    throw createError({ statusCode: 409, statusMessage: "این بازه برای بازدید دیگری رزرو شده است. زمان دیگری را انتخاب کنید." });
  }
  if (actionResult.kind === "failed") {
    throw createError({ statusCode: 500, statusMessage: "تغییر زمان بازدید انجام نشد." });
  }
  if (actionResult.kind === "feedback_not_ready") {
    throw createError({ statusCode: 409, statusMessage: "ثبت بازخورد پس از انجام بازدید فعال می‌شود." });
  }
  if (actionResult.kind === "feedback_exists") {
    throw createError({ statusCode: 409, statusMessage: "بازخورد این بازدید قبلاً ثبت شده است." });
  }
  if (actionResult.kind === "updated") {
    return { success: true, action: "reschedule", message: "زمان پیشنهادی جدید ثبت شد و برای تأیید دوباره به هیرمند ارسال شد." };
  }
  if (actionResult.kind === "cancelled") {
    return { success: true, action: "cancel", message: "درخواست بازدید لغو شد." };
  }
  return { success: true, action: "feedback", message: "بازخورد شما با موفقیت ثبت شد. ممنون که به بهبود خدمات هیرمند کمک می‌کنید." };
});
