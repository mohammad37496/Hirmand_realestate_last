import { createError, defineEventHandler, getCookie, readBody, setResponseHeader } from "h3";
import { z } from "zod";
import { isValidPublicTrackingToken } from "@/lib/tracking-token";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { lockPublicLeadTrackingTarget } from "@/lib/public-lead-tracking";

const schema = z.object({
  code: z.string().trim().toUpperCase().refine(isValidPublicTrackingToken),
  message: z.string().trim().min(1).max(1200),
  consultant: z.string().trim().max(80).optional().default("هیرمند"),
});

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  }
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "lead.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی پاسخ‌گویی به مشتریان برای این حساب فعال نیست." });
  }

  const body = schema.safeParse(await readBody(event).catch(() => null));
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: body.error.issues[0]?.message || "اطلاعات پیام نامعتبر است." });
  }
  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده تنظیم نشده است." });
  }

  const sql = await getSql();
  if (typeof sql.transaction !== "function") {
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده موقتاً در دسترس نیست." });
  }
  const inserted = await sql.transaction(async (transactionSql) => {
    const target = await lockPublicLeadTrackingTarget(transactionSql, body.data.code);
    if (!target) return false;
    await transactionSql.query(
      "insert into customer_messages(id,lead_id,tracking_token,sender_type,sender_name,message) values($1,$2,$3,'admin',$4,$5)",
      [crypto.randomUUID(), target.leadId, target.trackingToken, body.data.consultant || "هیرمند", body.data.message],
    );
    return true;
  });
  if (!inserted) throw createError({ statusCode:404, statusMessage:"کد رهگیری پیدا نشد." });

  return { success: true, message: "پاسخ برای مشتری ثبت شد." };
});
