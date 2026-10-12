import { createError, defineEventHandler, readBody } from "h3";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { assertSameOrigin, clientFingerprint } from "@/lib/admin-rate-limit.server";

const codeSchema = z.string().trim().toUpperCase().regex(/^HIR-[A-Z0-9]{2}-[A-F0-9]{12}$/);

const schema = z.object({
  code: codeSchema,
  message: z.string().trim().min(1, "پیام نمی‌تواند خالی باشد.").max(1200, "پیام بیش از حد طولانی است."),
  name: z.string().trim().min(2).max(80).optional().default("مشتری"),
});

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const body = schema.safeParse(await readBody(event).catch(() => null));
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: body.error.issues[0]?.message || "اطلاعات پیام نامعتبر است." });
  }
  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده موقتاً در دسترس نیست." });
  }

  const sql = await getSql();
  const leadRows = await sql.query<{ id:string; trackingToken:string; name:string }>(
    "select id,tracking_token as \"trackingToken\",name from leads where upper(tracking_token)=upper($1) limit 1",
    [body.data.code],
  );
  const lead = leadRows[0];
  if (!lead) {
    throw createError({ statusCode: 404, statusMessage: "درخواستی با این کد رهگیری پیدا نشد." });
  }

  const latest = await sql.query<{ createdAt:string }>(
    "select created_at as \"createdAt\" from customer_messages where lead_id=$1 order by created_at desc limit 1",
    [lead.id],
  );
  if (latest[0] && Date.now() - new Date(latest[0].createdAt).getTime() < 12_000) {
    throw createError({ statusCode: 429, statusMessage: "برای جلوگیری از پیام‌های تکراری، چند ثانیه صبر کنید." });
  }

  // Keep a small audit breadcrumb without storing IP or user agent in the message.
  const fingerprint = clientFingerprint(event).slice(0, 180);
  void fingerprint;

  const id = crypto.randomUUID();
  await sql.query(
    "insert into customer_messages(id,lead_id,tracking_token,sender_type,sender_name,message) values($1,$2,$3,'customer',$4,$5)",
    [id, lead.id, lead.trackingToken, body.data.name.trim(), body.data.message],
  );

  return { success: true, id, message: "پیام شما برای مشاور هیرمند ارسال شد." };
});
