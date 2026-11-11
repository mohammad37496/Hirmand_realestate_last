import { createError, defineEventHandler, readBody, setResponseHeader } from "h3";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { assertSameOrigin, clientFingerprint, consumeAdminAttempt, tooManyAttemptsError } from "@/lib/admin-rate-limit.server";
import { markCustomerChatMessagesRead } from "@/lib/customer-chat-read-receipt";

const codeSchema = z.string().trim().toUpperCase().regex(/^HIR-[A-Z0-9]{2}-[A-F0-9]{12}$/);

const bodySchema = z.object({
  code: codeSchema,
  messageIds: z.array(z.string().trim().min(1).max(128)).min(1).max(100),
});

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  assertSameOrigin(event);
  const attempt = await consumeAdminAttempt("customer-chat-read:" + clientFingerprint(event), 60);
  if (!attempt.allowed) throw tooManyAttemptsError(attempt.retryAfterSeconds);

  const body = bodySchema.safeParse(await readBody(event).catch(() => ({})));
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: "درخواست ثبت مشاهده پیام‌ها نامعتبر است." });
  }
  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده موقتاً در دسترس نیست." });
  }

  const result = await markCustomerChatMessagesRead(await getSql(), body.data.code, body.data.messageIds);
  if (result.kind === "not_found") {
    throw createError({ statusCode: 404, statusMessage: "درخواستی با این کد رهگیری پیدا نشد." });
  }
  return { success: true, markedCount: result.count };
});
