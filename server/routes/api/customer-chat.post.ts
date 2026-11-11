import { createError, defineEventHandler, readBody, setResponseHeader } from "h3";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { assertSameOrigin, clientFingerprint, consumeAdminAttempt, tooManyAttemptsError } from "@/lib/admin-rate-limit.server";
import { isValidPublicTrackingToken } from "@/lib/tracking-token";
import { sendCustomerChatMessage } from "@/lib/customer-chat-send";

const codeSchema = z.string().trim().toUpperCase().refine(isValidPublicTrackingToken);

const schema = z.object({
  code: codeSchema,
  message: z.string().trim().min(1, "پیام نمی‌تواند خالی باشد.").max(1200, "پیام بیش از حد طولانی است."),
  name: z.string().trim().min(2).max(80).optional().default("مشتری"),
});

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  assertSameOrigin(event);
  const attempt = await consumeAdminAttempt("customer-chat-send:" + clientFingerprint(event));
  if (!attempt.allowed) throw tooManyAttemptsError(attempt.retryAfterSeconds);

  const body = schema.safeParse(await readBody(event).catch(() => null));
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: body.error.issues[0]?.message || "اطلاعات پیام نامعتبر است." });
  }
  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده موقتاً در دسترس نیست." });
  }

  const result = await sendCustomerChatMessage(await getSql(), {
    trackingCode: body.data.code,
    senderName: body.data.name.trim(),
    message: body.data.message,
  });
  if (result.kind === "unavailable") {
    throw createError({ statusCode: 503, statusMessage: "ارسال پیام موقتاً در دسترس نیست." });
  }
  if (result.kind === "not_found") {
    throw createError({ statusCode: 404, statusMessage: "درخواستی با این کد رهگیری پیدا نشد." });
  }
  if (result.kind === "cooldown") {
    throw createError({ statusCode: 429, statusMessage: "برای جلوگیری از پیام‌های تکراری، چند ثانیه صبر کنید." });
  }

  return { success: true, id: result.id, message: "پیام شما برای مشاور هیرمند ارسال شد." };
});
