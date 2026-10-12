import { createError, defineEventHandler, getCookie, setResponseHeader, getQuery, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";

async function requirePhoneBridgeAdmin(event: H3Event) {
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(token))) throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "security.manage")) {
    throw createError({ statusCode: 403, statusMessage: "مجوز لازم برای فایل‌های Phone Bridge وجود ندارد." });
  }
}

function safeName(value: string) {
  return value.replace(/[\\/\\x00-\\x1f]+/g, "-").trim().slice(-160) || "media";
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number) { const b = Buffer.alloc(2); b.writeUInt16LE(value & 0xffff); return b; }
function u32(value: number) { const b = Buffer.alloc(4); b.writeUInt32LE(value >>> 0); return b; }

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "private, no-store");
  await requirePhoneBridgeAdmin(event);
  if (dbSource === "unconfigured") throw createError({ statusCode: 503, statusMessage: "پایگاه داده در دسترس نیست." });

  const raw = String(getQuery(event).ids ?? "");
  const ids = [...new Set(raw.split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 20);
  if (!ids.length) throw createError({ statusCode: 400, statusMessage: "هیچ فایل رسانه‌ای انتخاب نشده است." });

  const sql = await getSql();
  const rows = await sql.query<{ id: string; name: string; mime_type: string; content: Buffer }>(
    "select id,name,mime_type,content from phone_bridge_files where id = any($1::text[])",
    [ids],
  );
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: "فایل‌های انتخاب‌شده پیدا نشدند." });

  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  const contents: Buffer[] = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  for (const row of rows) {
    const name = safeName(String(row.name));
    const nameBytes = Buffer.from(name, "utf8");
    const data = Buffer.isBuffer(row.content) ? row.content : Buffer.from(row.content as unknown as Uint8Array);
    const crc = crc32(data);
    const local = Buffer.concat([
      Buffer.from("PK\\x03\\x04", "binary"), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate),
      u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes,
    ]);
    const central = Buffer.concat([
      Buffer.from("PK\\x01\\x02", "binary"), u16(20), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate),
      u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset), nameBytes,
    ]);
    localHeaders.push(local);
    centralHeaders.push(central);
    contents.push(data);
    offset += local.length + data.length;
  }

  const central = Buffer.concat(centralHeaders);
  const archive = Buffer.concat([
    ...localHeaders.flatMap((header, i) => [header, contents[i]]),
    central,
    Buffer.from("PK\\x05\\x06", "binary"), Buffer.alloc(6), u16(rows.length), u16(rows.length),
    u32(central.length), u32(offset), u16(0),
  ]);

  setResponseHeader(event, "content-type", "application/zip");
  setResponseHeader(event, "content-disposition", "attachment; filename=" + encodeURIComponent("phone-bridge-media.zip"));
  setResponseHeader(event, "x-content-type-options", "nosniff");
  return archive;
});
