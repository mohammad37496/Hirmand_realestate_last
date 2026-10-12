import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertAdminServerFnOrigin } from "@/lib/admin-server-fn-guard.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { recordPhoneBridgeEvent } from "@/lib/phone-bridge-events.server";

async function requirePhoneBridgeAppsAdmin() {
  const token = getCookie(ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(token))) throw new Error("نشست مدیریت معتبر نیست.");
  assertAdminServerFnOrigin();
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "security.manage")) throw new Error("برای مدیریت برنامه‌های Phone Bridge مجوز امنیت مدیران لازم است.");
  return claims;
}

export type PhoneBridgeApp = {
  id: string; deviceId: string; deviceName: string; packageName: string; label: string; activity: string; versionName: string;
  firstInstallAt: string | null; lastUpdateAt: string | null; isSystemApp: boolean; enabled: boolean; lastSeenAt: string;
};
export type PhoneBridgeAppBlockRule = {
  id: string; deviceId: string; packageName: string; label: string; enabled: boolean; days: number[]; startTime: string; endTime: string;
  startDate: string | null; endDate: string | null; message: string; createdAt: string; updatedAt: string;
};

export const listPhoneBridgeApps = createServerFn({ method: "POST" })
  .validator(z.object({ deviceId: z.string().trim().min(1).max(120), page: z.number().int().min(1).max(500).optional().default(1), limit: z.literal(20).optional().default(20), search: z.string().trim().max(120).optional().default("") }))
  .handler(async ({ data }) => {
    await requirePhoneBridgeAppsAdmin();
    if (dbSource === "unconfigured") return { apps: [] as PhoneBridgeApp[], total: 0, page: data.page, limit: 20 };
    const sql = await getSql(); const search = data.search.trim();
    const countRows = await sql.query<{ count: number }>("select count(*)::int as count from phone_bridge_apps where device_id=$1 and last_seen_at >= current_timestamp - interval '7 days' and ($2='' or label ilike '%' || $2 || '%' or package_name ilike '%' || $2 || '%')", [data.deviceId, search]);
    const total = Number(countRows[0]?.count ?? 0); const offset = (data.page - 1) * 20;
    const rows = await sql.query<Record<string, unknown>>("select a.id,a.device_id,a.package_name,a.label,a.activity,a.version_name,a.first_install_at,a.last_update_at,a.is_system_app,a.enabled,a.last_seen_at,coalesce(d.name,'گوشی ناشناس') as device_name from phone_bridge_apps a left join phone_bridge_devices d on d.id=a.device_id where a.device_id=$1 and a.last_seen_at >= current_timestamp - interval '7 days' and ($2='' or a.label ilike '%' || $2 || '%' or a.package_name ilike '%' || $2 || '%') order by a.is_system_app asc,a.label asc,a.package_name asc limit 20 offset $3", [data.deviceId, search, offset]);
    return {
      apps: rows.map((row) => ({
        id: String(row.id), deviceId: String(row.device_id), deviceName: String(row.device_name ?? "گوشی ناشناس"), packageName: String(row.package_name ?? ""),
        label: String(row.label ?? ""), activity: String(row.activity ?? ""), versionName: String(row.version_name ?? ""),
        firstInstallAt: row.first_install_at ? new Date(String(row.first_install_at)).toISOString() : null,
        lastUpdateAt: row.last_update_at ? new Date(String(row.last_update_at)).toISOString() : null,
        isSystemApp: Boolean(row.is_system_app), enabled: Boolean(row.enabled), lastSeenAt: new Date(String(row.last_seen_at)).toISOString(),
      })),
      total, page: data.page, limit: 20,
    };
  });

export const listPhoneBridgeAppBlockRules = createServerFn({ method: "POST" })
  .validator(z.object({ deviceId: z.string().trim().min(1).max(120) }))
  .handler(async ({ data }) => {
    await requirePhoneBridgeAppsAdmin(); if (dbSource === "unconfigured") return [] as PhoneBridgeAppBlockRule[];
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>("select id,device_id,package_name,label,enabled,days,start_time,end_time,start_date,end_date,message,created_at,updated_at from phone_bridge_app_block_rules where device_id=$1 order by updated_at desc", [data.deviceId]);
    const daysOf = (value: unknown) => Array.isArray(value) ? value.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) : [];
    return rows.map((row) => ({
      id: String(row.id), deviceId: String(row.device_id), packageName: String(row.package_name ?? ""), label: String(row.label ?? ""), enabled: Boolean(row.enabled), days: daysOf(row.days),
      startTime: String(row.start_time ?? "00:00").slice(0, 5), endTime: String(row.end_time ?? "00:00").slice(0, 5),
      startDate: row.start_date ? String(row.start_date).slice(0, 10) : null, endDate: row.end_date ? String(row.end_date).slice(0, 10) : null,
      message: String(row.message ?? ""), createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : new Date().toISOString(), updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : new Date().toISOString(),
    }));
  });

const ruleInput = z.object({
  deviceId: z.string().trim().min(1).max(120), packageName: z.string().trim().min(1).max(220), label: z.string().trim().max(180).default(""), enabled: z.boolean(),
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7), startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/), endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).default(""), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).default(""), message: z.string().trim().max(1000).default(""),
});

export const savePhoneBridgeAppBlockRule = createServerFn({ method: "POST" })
  .validator(ruleInput)
  .handler(async ({ data }) => {
    const claims = await requirePhoneBridgeAppsAdmin(); if (dbSource === "unconfigured") return { success: false };
    const days = [...new Set(data.days)].sort((a, b) => a - b);
    if (data.startDate && data.endDate && data.startDate > data.endDate) throw new Error("تاریخ شروع نمی‌تواند بعد از تاریخ پایان باشد.");
    const sql = await getSql();
    const rows = await sql.query<{ id: string }>("insert into phone_bridge_app_block_rules (id,device_id,package_name,label,enabled,days,start_time,end_time,start_date,end_date,message,updated_at) values (md5($1 || ':' || $2)::uuid,$1,$2,$3,$4,$5::jsonb,$6::time,$7::time,nullif($8,'')::date,nullif($9,'')::date,$10,current_timestamp) on conflict (device_id,package_name) do update set label=excluded.label,enabled=excluded.enabled,days=excluded.days,start_time=excluded.start_time,end_time=excluded.end_time,start_date=excluded.start_date,end_date=excluded.end_date,message=excluded.message,updated_at=current_timestamp returning id", [data.deviceId,data.packageName,data.label,data.enabled,JSON.stringify(days),data.startTime,data.endTime,data.startDate,data.endDate,data.message]);
    if (rows.length > 0) await recordPhoneBridgeEvent({ deviceId: data.deviceId, actorAccountId: typeof claims?.options?.accountId === "string" ? claims.options.accountId : null, eventType: "app.block_rule_changed", severity: data.enabled ? "warning" : "info", message: data.enabled ? "قانون بلاک برنامه ذخیره شد." : "قانون بلاک برنامه غیرفعال شد.", metadata: { packageName: data.packageName, days, startTime: data.startTime, endTime: data.endTime, startDate: data.startDate || null, endDate: data.endDate || null } });
    return { success: rows.length > 0, id: rows[0]?.id ?? null };
  });

export const deletePhoneBridgeAppBlockRule = createServerFn({ method: "POST" })
  .validator(z.object({ deviceId: z.string().trim().min(1).max(120), packageName: z.string().trim().min(1).max(220) }))
  .handler(async ({ data }) => {
    const claims = await requirePhoneBridgeAppsAdmin(); if (dbSource === "unconfigured") return { success: false };
    const sql = await getSql();
    const rows = await sql.query<{ id: string }>("delete from phone_bridge_app_block_rules where device_id=$1 and package_name=$2 returning id", [data.deviceId,data.packageName]);
    if (rows.length > 0) await recordPhoneBridgeEvent({ deviceId: data.deviceId, actorAccountId: typeof claims?.options?.accountId === "string" ? claims.options.accountId : null, eventType: "app.block_rule_deleted", severity: "info", message: "قانون بلاک برنامه حذف شد.", metadata: { packageName: data.packageName } });
    return { success: rows.length > 0 };
  });