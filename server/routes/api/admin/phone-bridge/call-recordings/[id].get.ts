import {
  createError,
  defineEventHandler,
  getCookie,
  getQuery,
  setResponseHeader,
  type H3Event,
} from "h3";
import { dbSource, getSql } from "@/lib/db";
import {
  ADMIN_SESSION_COOKIE,
  getAdminSessionClaims,
  verifyAdminSessionToken,
} from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";

async function requirePhoneBridgeAdmin(event: H3Event) {
  if (!(await verifyAdminSessionToken(getCookie(event, ADMIN_SESSION_COOKIE)))) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  }
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(getCookie(event, ADMIN_SESSION_COOKIE));
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "security.manage")) {
    throw createError({ statusCode: 403, statusMessage: "مجوز لازم برای مشاهدهٔ ضبط تماس‌ها وجود ندارد." });
  }
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "private, no-store");
  await requirePhoneBridgeAdmin(event);

  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده در دسترس نیست." });
  }

  const id = String(event.context.params?.id ?? "").trim();
  if (!id || id.length > 120) {
    throw createError({ statusCode: 400, statusMessage: "شناسه ضبط تماس معتبر نیست." });
  }

  const query = getQuery(event);
  const download = String(query.download ?? "0") === "1";
  const sql = await getSql();
  const rows = await sql.query<{ name: string; mime_type: string; content: Buffer }>(
    `select f.name,f.mime_type,f.content
     from phone_bridge_call_recordings r
     join phone_bridge_files f on f.id=r.file_id
     where r.id=$1
     limit 1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw createError({ statusCode: 404, statusMessage: "ضبط تماس پیدا نشد." });

  setResponseHeader(event, "content-type", row.mime_type || "audio/mp4");
  setResponseHeader(event, "content-length", String(row.content.length));
  setResponseHeader(event, "x-content-type-options", "nosniff");
  setResponseHeader(
    event,
    "content-disposition",
    (download ? "attachment" : "inline") + '; filename="' + encodeURIComponent(row.name || "call-recording.m4a") + '"',
  );
  return row.content;
});
