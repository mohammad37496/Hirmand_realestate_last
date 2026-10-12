import { createError, defineEventHandler, getQuery, getRequestIP } from "h3";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";

const codeSchema = z.string().trim().toUpperCase().regex(/^HIR-[A-Z0-9]{2}-[A-F0-9]{12}$/);

export default defineEventHandler(async (event) => {
  const rawCode = String((getQuery(event).code ?? "")).trim().toUpperCase().replace(/\\s+/g, "");
  const trackingCode = codeSchema.safeParse(rawCode);
  if (!trackingCode.success) {
    throw createError({ statusCode: 400, statusMessage: "کد رهگیری نامعتبر است." });
  }
  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده موقتاً در دسترس نیست." });
  }

  const sql = await getSql();
  const leadRows = await sql.query<{ id:string; name:string; consultant:string; deal:string }>(
    "select id,name,consultant,deal from leads where upper(tracking_token) = upper($1) limit 1",
    [trackingCode.data],
  );
  const lead = leadRows[0];
  if (!lead) {
    throw createError({ statusCode: 404, statusMessage: "درخواستی با این کد رهگیری پیدا نشد." });
  }

  await sql.query(
    "update customer_messages set read_by_customer_at = current_timestamp where lead_id = $1 and sender_type = 'admin' and read_by_customer_at is null",
    [lead.id],
  );

  const rows = await sql.query<{
    id:string;
    senderType:"customer"|"admin";
    senderName:string;
    message:string;
    createdAt:string;
  }>(
    "select id,sender_type as \"senderType\",sender_name as \"senderName\",message,created_at as \"createdAt\" from customer_messages where lead_id=$1 order by created_at asc limit 100",
    [lead.id],
  );

  const latest = rows.at(-1);
  const unread = await sql.query<{ count:number }>(
    "select count(*)::int as count from customer_messages where lead_id=$1 and sender_type='admin' and read_by_customer_at is null",
    [lead.id],
  );

  void getRequestIP(event);

  return {
    trackingCode: trackingCode.data,
    consultant: String(lead.consultant ?? ""),
    deal: String(lead.deal ?? ""),
    messages: rows.map((row) => ({
      id: row.id,
      senderType: row.senderType,
      senderName: row.senderName,
      message: row.message,
      createdAt: new Date(row.createdAt).toISOString(),
    })),
    unreadCustomer: Number(unread[0]?.count) || 0,
    lastMessageAt: latest ? new Date(latest.createdAt).toISOString() : null,
  };
});
