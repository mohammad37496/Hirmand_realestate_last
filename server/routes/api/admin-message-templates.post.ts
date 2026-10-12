import { createError, defineEventHandler, getCookie, readBody, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

const DEFAULTS = [
  { id: "first", title: "اولین پیگیری", body: "سلام {{نام}}، درباره درخواست {{معامله}} در {{محله}} با شما تماس گرفتم. برای هماهنگی و معرفی فایل‌های مناسب هیرمند در خدمتم.", channel: "whatsapp" },
  { id: "visit", title: "هماهنگی بازدید", body: "سلام {{نام}}، برای هماهنگی بازدید فایل‌های مناسب {{محله}} پیام دادم. زمان مناسب شما را اعلام می‌کنید؟", channel: "whatsapp" },
  { id: "match", title: "ارسال فایل مناسب", body: "سلام {{نام}}، چند فایل مناسب درخواست شما پیدا کردم. در صورت تمایل مشخصات و زمان بازدید را برایتان ارسال می‌کنم.", channel: "whatsapp" },
  { id: "reminder", title: "یادآوری پیگیری", body: "سلام {{نام}}، طبق پیگیری قبلی در خدمتتان هستم. هنوز درخواست {{معامله}} شما فعال است؟", channel: "whatsapp" },
  { id: "follow", title: "پیگیری پس از بازدید", body: "سلام {{نام}}، ممنون بابت بازدید امروز. نظر شما درباره فایل چیست تا گزینه‌های بعدی را بر اساس نظرتان آماده کنم؟", channel: "whatsapp" },
];

function clean(value: unknown, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function channel(value: unknown) {
  return ["whatsapp", "sms", "internal"].includes(String(value)) ? String(value) : "whatsapp";
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(token))) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست. دوباره وارد پنل شوید." });
  }
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "lead.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی مدیریت CRM برای این حساب فعال نیست." });
  }
  if (dbSource === "unconfigured") return { templates: [] };

  const sql = await getSql();
  const body = (await readBody(event).catch(() => ({}))) as Record<string, unknown>;
  const action = clean(body.action, 30) || "list";

  if (action === "list") {
    const count = await sql.query<{ count: number }>("select count(*)::int as count from admin_message_templates");
    if (Number(count[0]?.count) === 0) {
      for (const item of DEFAULTS) {
        await sql.query(
          "insert into admin_message_templates(id,title,body,channel,active) values($1,$2,$3,$4,true) on conflict(id) do nothing",
          [item.id, item.title, item.body, item.channel],
        );
      }
    }
    const rows = await sql.query<Record<string, unknown>>(
      "select id,title,body,channel,active,created_at,updated_at from admin_message_templates order by active desc, updated_at desc",
    );
    return {
      templates: rows.map((row) => ({
        id: String(row.id),
        title: String(row.title),
        body: String(row.body),
        channel: channel(row.channel),
        active: Boolean(row.active),
        updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : null,
      })),
    };
  }

  if (action === "save") {
    const id = clean(body.id, 80).replace(/[^a-zA-Z0-9_-]/g, "-");
    const title = clean(body.title, 120);
    const templateBody = clean(body.body, 4000);
    if (!id || !title || !templateBody) {
      throw createError({ statusCode: 400, statusMessage: "شناسه، عنوان و متن پیام الزامی است." });
    }
    await sql.query(
      "insert into admin_message_templates(id,title,body,channel,active) values($1,$2,$3,$4,$5) on conflict(id) do update set title=excluded.title,body=excluded.body,channel=excluded.channel,active=excluded.active,updated_at=current_timestamp",
      [id, title, templateBody, channel(body.channel), body.active !== false],
    );
    return { success: true, id };
  }

  if (action === "delete") {
    const id = clean(body.id, 80);
    if (!id) throw createError({ statusCode: 400, statusMessage: "شناسه قالب مشخص نیست." });
    if (DEFAULTS.some((item) => item.id === id)) {
      throw createError({ statusCode: 400, statusMessage: "قالب‌های اصلی قابل حذف نیستند؛ آن‌ها را می‌توانید غیرفعال کنید." });
    }
    await sql.query("delete from admin_message_templates where id=$1", [id]);
    return { success: true };
  }

  throw createError({ statusCode: 400, statusMessage: "عملیات قالب پیام نامعتبر است." });
});
