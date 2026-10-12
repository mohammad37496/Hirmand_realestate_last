import { createError, defineEventHandler, getCookie, readBody, setResponseHeader } from "h3";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

const schema = z.object({
  action: z.enum(["get", "update"]),
  enabled: z.boolean().optional(),
  showLogo: z.boolean().optional(),
  showText: z.boolean().optional(),
  text: z.string().trim().max(80).optional(),
  opacity: z.number().min(0.2).max(1).optional(),
  size: z.number().min(0.6).max(1.6).optional(),
});

const DEFAULTS = {
  enabled: true,
  showLogo: true,
  showText: true,
  text: "املاک هیرمند",
  opacity: 0.82,
  size: 1,
};

function mapRow(row: Record<string, unknown> | undefined) {
  if (!row) return DEFAULTS;
  return {
    enabled: row.enabled !== false,
    showLogo: row.show_logo !== false,
    showText: row.show_text !== false,
    text: typeof row.text === "string" && row.text.trim() ? row.text.trim() : DEFAULTS.text,
    opacity: Math.min(1, Math.max(0.2, Number(row.opacity) || DEFAULTS.opacity)),
    size: Math.min(1.6, Math.max(0.6, Number(row.size) || DEFAULTS.size)),
  };
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  assertSameOrigin(event);
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  }
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "content.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی تنظیم واترمارک برای این حساب فعال نیست." });
  }

  const parsedBody = schema.safeParse(await readBody(event).catch(() => ({})));
  if (!parsedBody.success) {
    throw createError({ statusCode: 422, statusMessage: parsedBody.error.issues[0]?.message || "تنظیمات واترمارک معتبر نیست." });
  }
  const body = parsedBody.data;
  if (dbSource === "unconfigured") return { success: true, settings: DEFAULTS };

  const sql = await getSql();
  if (body.action === "get") {
    const rows = await sql.query<Record<string, unknown>>(
      "select enabled,show_logo,show_text,text,opacity,size from property_media_watermark_settings where id=1 limit 1",
    );
    return { success: true, settings: mapRow(rows[0]) };
  }

  const current = await sql.query<Record<string, unknown>>(
    "select enabled,show_logo,show_text,text,opacity,size from property_media_watermark_settings where id=1 limit 1",
  );
  const previous = mapRow(current[0]);

  const next = {
    enabled: body.enabled ?? previous.enabled,
    showLogo: body.showLogo ?? previous.showLogo,
    showText: body.showText ?? previous.showText,
    text: body.text?.trim() ? body.text.trim() : previous.text,
    opacity: body.opacity ?? previous.opacity,
    size: body.size ?? previous.size,
  };

  await sql.query(
    "insert into property_media_watermark_settings (id,enabled,show_logo,show_text,text,opacity,size,updated_at) values (1,$1,$2,$3,$4,$5,$6,current_timestamp) on conflict (id) do update set enabled=excluded.enabled,show_logo=excluded.show_logo,show_text=excluded.show_text,text=excluded.text,opacity=excluded.opacity,size=excluded.size,updated_at=current_timestamp",
    [next.enabled, next.showLogo, next.showText, next.text, next.opacity, next.size],
  );

  return { success: true, settings: next };
});
