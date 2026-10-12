import { createError, defineEventHandler, getCookie, readBody, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

function clean(value: unknown, max = 200) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function integer(value: unknown) { const n = Number(value); return Number.isInteger(n) && n >= 0 ? n : 0; }
function money(value: unknown) { const raw = clean(value, 40).replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٬،,\s]/g, ""); return raw && /^\d{1,20}(?:\.\d+)?$/.test(raw) ? Number(raw) : 0; }
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
      sql.query<Record<string, unknown>>("select id,consultant,target_month,lead_target,contract_target,volume_target,commission_target,note from admin_consultant_targets where target_month=$1 order by consultant asc", [selectedMonth]),
      sql.query<Record<string, unknown>>(
        "select consultant,count(*) filter(where status not in ('closed','spam'))::int as leads,count(*) filter(where status='contract')::int as contracts from leads where created_at >= date_trunc('month',$1::date) and created_at < date_trunc('month',$1::date)+interval '1 month' group by consultant",
        [selectedMonth],
      ),
    ]);
    const dealActualRows = await sql.query<Record<string, unknown>>(
      "select consultant,count(*)::int as deals,coalesce(sum(amount),0)::numeric as volume,coalesce(sum(commission),0)::numeric as commissions from admin_deals where created_at >= date_trunc('month',$1::date) and created_at < date_trunc('month',$1::date)+interval '1 month' and status <> 'cancelled' group by consultant",
      [selectedMonth],
    );
    const map = new Map<string, { leads:number; contracts:number; deals:number; volume:number; commissions:number }>();
    const ensure = (v: unknown) => { const name=String(v??"").trim()||"بدون مشاور"; if(!map.has(name)) map.set(name,{leads:0,contracts:0,deals:0,volume:0,commissions:0}); return map.get(name)!; };
    for(const row of actual){ const x=ensure(row.consultant); x.leads=integer(row.leads); x.contracts=integer(row.contracts); }
    for(const row of dealActualRows) { const x=ensure(row.consultant); x.deals=integer(row.deals); x.volume=money(row.volume); x.commissions=money(row.commissions); }
    const targetMap=new Map(targets.map(row=>[String(row.consultant),row]));
    const names=new Set([...targetMap.keys(),...map.keys()]);
    return { month:selectedMonth.slice(0,7), rows:[...names].sort((a,b)=>a.localeCompare(b,"fa")).map(name=>{
      const t=targetMap.get(name); const a=map.get(name)??{leads:0,contracts:0,deals:0,volume:0,commissions:0};
      return { id:t?String(t.id):null, consultant:name, leadTarget:integer(t?.lead_target), contractTarget:integer(t?.contract_target), volumeTarget:money(t?.volume_target), commissionTarget:money(t?.commission_target), leads:a.leads, contracts:a.contracts, deals:a.deals, volume:a.volume, commissions:a.commissions, note:String(t?.note??"") };
    })};
  }

  if (action === "save") {
    const consultant=clean(body.consultant,120), targetMonth=month(body.month)||selectedMonth;
    if(!consultant) throw createError({statusCode:400,statusMessage:"نام مشاور الزامی است."});
    const id=clean(body.id,100)||crypto.randomUUID();
    await sql.query(
      "insert into admin_consultant_targets(id,consultant,target_month,lead_target,contract_target,volume_target,commission_target,note,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(consultant,target_month) do update set lead_target=excluded.lead_target,contract_target=excluded.contract_target,volume_target=excluded.volume_target,commission_target=excluded.commission_target,note=excluded.note,updated_at=current_timestamp",
      [id,consultant,targetMonth,integer(body.leadTarget),integer(body.contractTarget),money(body.volumeTarget),money(body.commissionTarget),clean(body.note,1200),clean(claims?.displayName,120)||"مدیریت"]
    );
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