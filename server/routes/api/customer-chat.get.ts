import { createError, defineEventHandler, getQuery, setResponseHeader } from "h3";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { clientFingerprint, consumeAdminAttempt, tooManyAttemptsError } from "@/lib/admin-rate-limit.server";
import { loadLatestCustomerChatMessages } from "@/lib/customer-chat-messages";
import { isValidPublicTrackingToken } from "@/lib/tracking-token";
import { sharePublicLeadTrackingTarget } from "@/lib/public-lead-tracking";

const codeSchema = z.string().trim().toUpperCase().refine(isValidPublicTrackingToken);

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  const attempt = await consumeAdminAttempt("customer-chat-lookup:" + clientFingerprint(event), 60);
  if (!attempt.allowed) throw tooManyAttemptsError(attempt.retryAfterSeconds);
  const rawCode = String((getQuery(event).code ?? "")).trim().toUpperCase().replace(/\s+/g, "");
  const trackingCode = codeSchema.safeParse(rawCode);
  if (!trackingCode.success) {
    throw createError({ statusCode: 400, statusMessage: "کد رهگیری نامعتبر است." });
  }
  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده موقتاً در دسترس نیست." });
  }

  const sql = await getSql();
  if (typeof sql.transaction !== "function") {
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده موقتاً در دسترس نیست." });
  }
  const conversationResult = await sql.transaction(async (transactionSql) => {
    const target = await sharePublicLeadTrackingTarget(transactionSql, trackingCode.data);
    if (!target) return null;
    const leadRows = await transactionSql.query<{ id: string; consultant: string; deal: string }>(
      "select l.id,coalesce(c.name,l.consultant) as consultant,l.deal from leads l left join consultants c on c.id=l.consultant_id where l.id=$1 limit 1",
      [target.leadId],
    );
    const lead = leadRows[0];
    if (!lead) return null;
    const conversation = await loadLatestCustomerChatMessages(transactionSql, target.leadId, target.trackingToken);
    return { lead, target, conversation };
  });
  if (!conversationResult) {
    throw createError({ statusCode: 404, statusMessage: "درخواستی با این کد رهگیری پیدا نشد." });
  }
  const { lead, target, conversation } = conversationResult;
  const latest = conversation.messages.at(-1);

  return {
    trackingCode: target.trackingToken,
    consultant: String(lead.consultant ?? ""),
    deal: String(lead.deal ?? ""),
    messages: conversation.messages.map((row) => ({
      id: row.id,
      senderType: row.senderType,
      senderName: row.senderName,
      message: row.message,
      createdAt: new Date(row.createdAt).toISOString(),
    })),
    unreadCustomer: conversation.unreadCount,
    lastMessageAt: latest ? new Date(latest.createdAt).toISOString() : null,
  };
});
