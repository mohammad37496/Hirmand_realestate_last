import { createError, defineEventHandler, getCookie, readBody, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

async function requireReportAccess(event: H3Event) {
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "reports.view")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی گزارش برای این حساب فعال نیست." });
  }
  return claims;
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  const claims = await requireReportAccess(event);
  const role = normalizeAdminRole(claims?.role);
  if (dbSource === "unconfigured") return { scannedAt: new Date().toISOString(), summary: { critical: 0, warning: 0, info: 0, open: 0 }, findings: [] };
  const body = (await readBody(event).catch(() => ({}))) as { action?: "scan" | "resolve"; findingId?: number };
  const sql = await getSql();

  if (body.action === "resolve") {
    if (!hasAdminPermission(role, "settings.manage")) {
      throw createError({ statusCode: 403, statusMessage: "فقط مدیران می‌توانند یافته‌های سلامت داده را تعیین‌تکلیف کنند." });
    }
    if (!Number.isInteger(body.findingId) || Number(body.findingId) <= 0) throw createError({ statusCode: 400, statusMessage: "شناسه یافته نامعتبر است." });
    await sql.query("update admin_data_health_findings set resolved_at=current_timestamp where id=$1", [body.findingId]);
    return { success: true };
  }

  const checks = await Promise.all([
    sql.query<Record<string, unknown>>(
      "select l.id,l.name,l.property_id from leads l left join properties p on p.id=l.property_id where l.property_id is not null and p.id is null limit 50",
    ).catch(() => []),
    sql.query<Record<string, unknown>>(
      "select l.id,l.name,l.consultant from leads l left join consultants c on lower(trim(c.name))=lower(trim(l.consultant)) where trim(coalesce(l.consultant,''))<>'' and c.id is null limit 50",
    ).catch(() => []),
    sql.query<Record<string, unknown>>(
      "select id,title,slug from properties where deleted_at is null and status='published' and (trim(coalesce(title,''))='' or trim(coalesce(neighborhood,''))='') limit 50",
    ).catch(() => []),
    sql.query<Record<string, unknown>>(
      "select phone,count(*)::int as count from leads where trim(coalesce(phone,''))<>'' group by phone having count(*) > 1 order by count desc limit 30",
    ).catch(() => []),
    sql.query<Record<string, unknown>>(
      "select id,title,latitude,longitude from properties where deleted_at is null and ((latitude is null) <> (longitude is null)) limit 50",
    ).catch(() => []),
  ]);

  const findings: Array<{sourceKey:string;kind:string;severity:"info"|"warning"|"critical";title:string;detail:string;entityType?:string;entityId?:string}> = [];
  for (const row of checks[0]) findings.push({sourceKey:"orphan-lead:"+row.id,kind:"orphan_lead",severity:"critical",title:"لید به فایل ناموجود وصل است",detail:String(row.name ?? "مشتری"),entityType:"lead",entityId:String(row.id)});
  for (const row of checks[1]) findings.push({sourceKey:"unknown-consultant:"+row.id,kind:"unknown_consultant",severity:"warning",title:"مشاور لید در فهرست مشاوران نیست",detail:String(row.consultant ?? ""),entityType:"lead",entityId:String(row.id)});
  for (const row of checks[2]) findings.push({sourceKey:"published-incomplete:"+row.id,kind:"published_incomplete",severity:"critical",title:"فایل منتشرشده فیلد پایه ناقص دارد",detail:String(row.title ?? row.slug ?? ""),entityType:"property",entityId:String(row.id)});
  for (const row of checks[3]) findings.push({sourceKey:"duplicate-phone:"+row.phone,kind:"duplicate_phone",severity:"warning",title:"شماره تلفن در چند لید تکرار شده است",detail:"تعداد: "+String(row.count),entityType:"lead"});
  for (const row of checks[4]) findings.push({sourceKey:"coordinate-pair:"+row.id,kind:"invalid_coordinates",severity:"warning",title:"مختصات فایل ناقص است",detail:String(row.title ?? ""),entityType:"property",entityId:String(row.id)});

  for (const f of findings) {
    await sql.query(
      "insert into admin_data_health_findings(source_key,kind,severity,title,detail,entity_type,entity_id) values($1,$2,$3,$4,$5,$6,$7) on conflict(source_key) do update set severity=excluded.severity,title=excluded.title,detail=excluded.detail,detected_at=current_timestamp,resolved_at=null",
      [f.sourceKey,f.kind,f.severity,f.title,f.detail,f.entityType ?? null,f.entityId ?? null],
    );
  }

  const rows = await sql.query<Record<string, unknown>>(
    "select id,kind,severity,title,detail,entity_type,entity_id,detected_at from admin_data_health_findings where resolved_at is null order by case severity when 'critical' then 0 when 'warning' then 1 else 2 end, detected_at desc limit 100",
  );
  const counts = { critical: 0, warning: 0, info: 0 };
  const mapped = rows.map((row) => {
    const severity = String(row.severity ?? "warning") as "critical"|"warning"|"info";
    counts[severity] += 1;
    return { id:Number(row.id),kind:String(row.kind),severity,title:String(row.title),detail:String(row.detail ?? ""),entityType:row.entity_type ? String(row.entity_type) : null,entityId:row.entity_id ? String(row.entity_id) : null,detectedAt:new Date(String(row.detected_at)).toISOString() };
  });
  return { scannedAt:new Date().toISOString(),summary:{...counts,open:mapped.length},findings:mapped };
});
