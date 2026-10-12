import { createError, defineEventHandler, getCookie, readBody, setResponseHeader, type H3Event } from "h3";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin, clientFingerprint, consumeAdminAttempt, tooManyAttemptsError } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

const VISITOR_COOKIE = "hirmand_visitor_id";

const publicSchema = z.object({
  propertyId: z.string().trim().min(1).max(120),
  propertySlug: z.string().trim().min(1).max(220),
  propertyTitle: z.string().trim().min(1).max(180),
  reportType: z.string().trim().min(2).max(120),
  note: z.string().trim().max(500).default(""),
});

const adminSchema = z.object({
  action: z.enum(["list", "updateStatus"]),
  id: z.coerce.number().int().positive().optional(),
  status: z.enum(["open", "resolved", "dismissed"]).optional(),
});

async function requireAdmin(event: H3Event) {
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  }
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "property.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی مدیریت گزارش‌های فایل برای این حساب فعال نیست." });
  }
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  assertSameOrigin(event);
  const body = await readBody(event).catch(() => ({}));
  const action = String((body as { action?: unknown })?.action ?? "");
  const wantsAdmin = action === "list" || action === "updateStatus";

  if (!wantsAdmin) {
    const attempt = await consumeAdminAttempt("property-report:" + clientFingerprint(event));
    if (!attempt.allowed) throw tooManyAttemptsError(attempt.retryAfterSeconds);

    if (dbSource === "unconfigured") {
      throw createError({ statusCode: 503, statusMessage: "پایگاه داده تنظیم نشده است." });
    }
    const parsed = publicSchema.safeParse(body);
    if (!parsed.success) {
      throw createError({ statusCode: 422, statusMessage: "اطلاعات گزارش نامعتبر است." });
    }
    const sql = await getSql();
    const visitorId = getCookie(event, VISITOR_COOKIE);
    const propertyRows = await sql.query<{ id: string; slug: string; title: string }>(
      "select id, slug, title from properties where id=$1 and slug=$2 and status='published' limit 1",
      [parsed.data.propertyId, parsed.data.propertySlug],
    );
    const property = propertyRows[0];
    if (!property) {
      throw createError({ statusCode: 404, statusMessage: "فایل موردنظر پیدا نشد." });
    }

    const normalizedVisitorId =
      visitorId && /^[a-f0-9-]{20,80}$/i.test(visitorId) ? visitorId : null;

    const duplicate = normalizedVisitorId
      ? await sql.query<{ id: string }>(
          "select id::text as id from property_reports where visitor_id=$1 and property_id=$2 and report_type=$3 and created_at >= current_timestamp - interval '3 minutes' limit 1",
          [normalizedVisitorId, property.id, parsed.data.reportType],
        )
      : [];

    if (!duplicate[0]) {
      await sql.query(
        "insert into property_reports(property_id,property_slug,property_title,report_type,note,visitor_id) values($1,$2,$3,$4,$5,$6)",
        [
          property.id,
          property.slug,
          property.title,
          parsed.data.reportType,
          parsed.data.note,
          normalizedVisitorId,
        ],
      );
    }
    return { ok: true };
  }

  await requireAdmin(event);
  const parsed = adminSchema.safeParse(body);
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: "درخواست مدیریت نامعتبر است." });
  }
  if (dbSource === "unconfigured") return { openCount: 0, reports: [] };
  const sql = await getSql();

  if (parsed.data.action === "updateStatus") {
    if (!parsed.data.id || !parsed.data.status) {
      throw createError({ statusCode: 400, statusMessage: "شناسه و وضعیت گزارش لازم است." });
    }
    await sql.query(
      "update property_reports set status=$2, resolved_at=case when $2 in ('resolved','dismissed') then coalesce(resolved_at,current_timestamp) else null end where id=$1",
      [parsed.data.id, parsed.data.status],
    );
  }

  const rows = await sql.query<Record<string, unknown>>(
    "select id::text as id, property_id, property_slug, property_title, report_type, note, status, created_at, resolved_at from property_reports order by case status when 'open' then 0 when 'resolved' then 1 else 2 end, created_at desc limit 60",
  );
  const openCount = rows.filter((row) => String(row.status) === "open").length;

  return {
    openCount,
    reports: rows.map((row) => ({
      id: String(row.id),
      propertyId: String(row.property_id),
      propertySlug: String(row.property_slug),
      propertyTitle: String(row.property_title),
      reportType: String(row.report_type),
      note: String(row.note ?? ""),
      status: String(row.status),
      createdAt: new Date(String(row.created_at)).toISOString(),
      resolvedAt: row.resolved_at ? new Date(String(row.resolved_at)).toISOString() : null,
    })),
  };
});
