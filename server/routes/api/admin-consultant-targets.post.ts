import { createError, defineEventHandler, getCookie, readBody, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { normalizeConsultantTargetMoney } from "@/lib/admin-consultant-targets";

function clean(value: unknown, max = 200) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function integer(value: unknown) { const n = Number(value); return Number.isInteger(n) && n >= 0 ? n : 0; }
function month(value: unknown) {
  const raw = clean(value, 20);
  return /^\d{4}-\d{2}$/.test(raw) ? raw + "-01" : "";
}

export default defineEventHandler(async event => {
  setResponseHeader(event, "cache-control", "no-store");
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(token))) throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "reports.view")) throw createError({ statusCode: 403, statusMessage: "دسترسی گزارش مدیریت برای این حساب فعال نیست." });
  if (dbSource === "unconfigured") return { month: new Date().toISOString().slice(0, 7), rows: [] };

  const sql = await getSql();
  const body = (await readBody(event).catch(() => ({}))) as Record<string, unknown>;
  const action = clean(body.action, 30) || "list";
  if (action !== "list" && !hasAdminPermission(normalizeAdminRole(claims?.role), "deal.manage")) {
    throw createError({ statusCode: 403, statusMessage: "تنظیم اهداف فروش فقط برای مدیران فروش مجاز است." });
  }
  const selectedMonth = month(body.month) || new Date().toISOString().slice(0, 7) + "-01";

  if (action === "list") {
    const [targets, actual] = await Promise.all([
      sql.query<Record<string, unknown>>("select t.id,t.consultant_id,coalesce(c.name,t.consultant) as consultant,t.target_month,t.lead_target,t.contract_target,t.volume_target,t.commission_target,t.note from admin_consultant_targets t left join consultants c on c.id=t.consultant_id where t.target_month=$1 order by consultant asc", [selectedMonth]),
      sql.query<Record<string, unknown>>(
        "select c.id as consultant_id,c.name as consultant,count(*) filter(where l.status not in ('closed','spam'))::int as leads,count(*) filter(where l.status='contract')::int as contracts from leads l join consultants c on c.id=l.consultant_id where l.created_at >= date_trunc('month',$1::date) and l.created_at < date_trunc('month',$1::date)+interval '1 month' group by c.id,c.name",
        [selectedMonth],
      ),
    ]);
    const dealActualRows = await sql.query<Record<string, unknown>>(
      "select consultant,count(*)::int as deals,coalesce(sum(amount),0)::numeric as volume,coalesce(sum(commission),0)::numeric as commissions from admin_deals where created_at >= date_trunc('month',$1::date) and created_at < date_trunc('month',$1::date)+interval '1 month' and status <> 'cancelled' group by consultant",
      [selectedMonth],
    );
    const map = new Map<string, { id:string|null; consultantId:string|null; consultant:string; leadTarget:number; contractTarget:number; volumeTarget:string; commissionTarget:string; leads:number; contracts:number; deals:number; volume:string; commissions:string; note:string }>();
    const ensure = (key: string, name: string, target?: Record<string, unknown>) => {
      if (!map.has(key)) map.set(key, {
        id: target ? String(target.id) : null,
        consultantId: target?.consultant_id ? String(target.consultant_id) : null,
        consultant: name,
        leadTarget: integer(target?.lead_target), contractTarget: integer(target?.contract_target),
        volumeTarget: normalizeConsultantTargetMoney(target?.volume_target), commissionTarget: normalizeConsultantTargetMoney(target?.commission_target),
        leads: 0, contracts: 0, deals: 0, volume: "0", commissions: "0", note: String(target?.note ?? ""),
      });
      return map.get(key)!;
    };
    for (const target of targets) {
      const id = target.consultant_id ? String(target.consultant_id) : null;
      const name = String(target.consultant ?? "").trim() || "بدون مشاور";
      ensure(id ? `consultant:${id}` : `legacy-target:${String(target.id)}`, id ? name : `${name} · هدف تاریخی نام‌محور`, target);
    }
    for (const row of actual) {
      const id = String(row.consultant_id);
      const item = ensure(`consultant:${id}`, String(row.consultant ?? ""));
      item.leads = integer(row.leads);
      item.contracts = integer(row.contracts);
    }
    // Deals remain name-only historical records. Keep them visibly separate
    // instead of attributing them to a current same-name consultant ID.
    for (const row of dealActualRows) {
      const name = String(row.consultant ?? "").trim() || "بدون مشاور";
      const item = ensure(`historical-deal:${name}`, `${name} · سوابق نام‌محور`);
      item.deals = integer(row.deals);
      item.volume = normalizeConsultantTargetMoney(row.volume);
      item.commissions = normalizeConsultantTargetMoney(row.commissions);
    }
    return { month:selectedMonth.slice(0,7), rows:[...map.values()].sort((a,b)=>a.consultant.localeCompare(b.consultant,"fa")) };
  }

  if (action === "save") {
    const consultantId=clean(body.consultantId,120), targetMonth=month(body.month)||selectedMonth;
    if(!consultantId) throw createError({statusCode:400,statusMessage:"شناسه مشاور الزامی است."});
    const id=clean(body.id,100)||crypto.randomUUID();
    if (typeof sql.transaction !== "function") throw createError({ statusCode: 503, statusMessage: "ذخیره هدف به تراکنش پایگاه داده نیاز دارد." });
    await sql.transaction(async (tx) => {
      const selected = await tx.query<{ id:string; name:string }>("select id,name from consultants where id=$1 and is_active=true limit 1 for share", [consultantId]);
      if (!selected[0]) throw createError({ statusCode:409, statusMessage:"مشاور انتخاب‌شده دیگر فعال یا معتبر نیست." });
      await tx.query(
        "insert into admin_consultant_targets(id,consultant_id,consultant,target_month,lead_target,contract_target,volume_target,commission_target,note,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict(consultant_id,target_month) where consultant_id is not null do update set consultant=excluded.consultant,lead_target=excluded.lead_target,contract_target=excluded.contract_target,volume_target=excluded.volume_target,commission_target=excluded.commission_target,note=excluded.note,updated_at=current_timestamp",
        [id,selected[0].id,selected[0].name,targetMonth,integer(body.leadTarget),integer(body.contractTarget),normalizeConsultantTargetMoney(body.volumeTarget),normalizeConsultantTargetMoney(body.commissionTarget),clean(body.note,1200),clean(claims?.displayName,120)||"مدیریت"]
      );
    });
    return {success:true};
  }

  if(action==="delete"){
    const id=clean(body.id,100);
    if(!id) throw createError({statusCode:400,statusMessage:"شناسه هدف مشخص نیست."});
    await sql.query("delete from admin_consultant_targets where id=$1",[id]);
    return {success:true};
  }
  throw createError({statusCode:400,statusMessage:"عملیات اهداف مشاوران نامعتبر است."});
});
