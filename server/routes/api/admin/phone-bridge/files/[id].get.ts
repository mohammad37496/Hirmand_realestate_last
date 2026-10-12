import {
  createError,
  defineEventHandler,
  getCookie,
  setResponseHeader,
  getQuery,
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
    throw createError({ statusCode: 403, statusMessage: "مجوز لازم برای مشاهدهٔ فایل‌های Phone Bridge وجود ندارد." });
  }
}

function safeDownloadName(value: string) {
  const sanitized = [...value].map((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || char === "/" || char === "\\" ? "-" : char;
  }).join("");
  return sanitized.trim().slice(-180) || "file";
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "private, no-store");
  await requirePhoneBridgeAdmin(event);

  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده در دسترس نیست." });
  }

  const fileId = String(event.context.params?.id ?? "").trim();
  if (!fileId || fileId.length > 120) {
    throw createError({ statusCode: 400, statusMessage: "شناسهٔ فایل معتبر نیست." });
  }

  const sql = await getSql();
  const rows = await sql.query<{ name: string; mime_type: string; content: Buffer }>(
    "select name,mime_type,content from phone_bridge_files where id=$1 limit 1",
    [fileId],
  );
  const row = rows[0];
  if (!row) throw createError({ statusCode: 404, statusMessage: "فایل پیدا نشد." });

  const inline = String(getQuery(event).inline ?? "") === "1";
  setResponseHeader(event, "content-type", row.mime_type || "application/octet-stream");
  setResponseHeader(
    event,
    "content-disposition",
    inline
      ? "inline"
      : "attachment; filename=\"phone-bridge-file\"; filename*=UTF-8''" + encodeURIComponent(safeDownloadName(row.name)),
  );
  setResponseHeader(event, "x-content-type-options", "nosniff");
  return row.content;
});
