import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../server/routes/api/admin-deals.post.ts", import.meta.url), "utf8");
const commissionRoute = readFileSync(new URL("../server/routes/api/admin-commission.post.ts", import.meta.url), "utf8");
const lifecycle = readFileSync(new URL("../src/lib/admin-deal-lifecycle.ts", import.meta.url), "utf8");
const statusLifecycle = readFileSync(new URL("../src/lib/admin-deal-status-sql.ts", import.meta.url), "utf8");
const dealsComponent = readFileSync(new URL("../src/components/hirmand/admin-deals.tsx", import.meta.url), "utf8");
const commissionComponent = readFileSync(new URL("../src/components/hirmand/admin-commission-settlement.tsx", import.meta.url), "utf8");
const performanceRoute = readFileSync(new URL("../server/routes/api/admin-consultant-performance.get.ts", import.meta.url), "utf8");
const lead360Route = readFileSync(new URL("../server/routes/api/admin-lead-360.post.ts", import.meta.url), "utf8");
const targetsRoute = readFileSync(new URL("../server/routes/api/admin-consultant-targets.post.ts", import.meta.url), "utf8");
const targetsComponent = readFileSync(new URL("../src/components/hirmand/admin-consultant-targets.tsx", import.meta.url), "utf8");
const financeRoute = readFileSync(new URL("../server/routes/api/admin-finance.post.ts", import.meta.url), "utf8");
const financeInsightsRoute = readFileSync(new URL("../server/routes/api/admin-finance-insights.get.ts", import.meta.url), "utf8");
const managementReportRoute = readFileSync(new URL("../server/routes/api/admin-management-report.get.ts", import.meta.url), "utf8");
const operationsRoute = readFileSync(new URL("../server/routes/api/admin-operations.post.ts", import.meta.url), "utf8");
const financeManager = readFileSync(new URL("../src/components/hirmand/admin-finance-manager.tsx", import.meta.url), "utf8");
const financeInsights = readFileSync(new URL("../src/components/hirmand/admin-finance-insights.tsx", import.meta.url), "utf8");
const managementReport = readFileSync(new URL("../src/components/hirmand/admin-management-report.tsx", import.meta.url), "utf8");
const operationsCenter = readFileSync(new URL("../src/components/hirmand/admin-operations-center.tsx", import.meta.url), "utf8");

test("admin deal create, status and document mutations validate enums before SQL writes", () => {
  const create = route.slice(route.indexOf('if(action==="create")'), route.indexOf('  const id=clean(body.id,120)'));
  const status = route.slice(route.indexOf('if(action==="status")'), route.indexOf('if(action==="delete")'));
  const document = route.slice(route.indexOf('if(action==="document")'), route.indexOf('if(action==="documents")'));

  assert.match(create, /adminDealCreateEnumsSchema\.safeParse\(\{dealType:body\.dealType,status:body\.status\}\)/);
  assert.match(create, /invalidDealEnum\(/);
  assert.match(create, /enums\.data\.dealType,enums\.data\.status/);
  assert.ok(create.indexOf("adminDealCreateEnumsSchema.safeParse") < create.indexOf("insert into admin_deals"));

  assert.match(status, /adminDealStatusUpdateSchema\.safeParse\(\{status:body\.status\}\)/);
  assert.match(status, /parsed\.data\.status/);
  assert.match(status, /updateAdminDealStatusWithSettlementGuard\(sql,id,parsed\.data\.status/);
  assert.doesNotMatch(status, /update admin_deals/);

  assert.match(document, /adminDealDocumentUpdateSchema\.safeParse\(\{documentStatus:body\.documentStatus\}\)/);
  assert.match(document, /const status=parsed\.data\.documentStatus/);
  assert.ok(document.indexOf("adminDealDocumentUpdateSchema.safeParse") < document.indexOf("insert into admin_deal_documents"));
  assert.match(route, /type:validType\(r\.deal_type\),status:validStatus\(r\.status\)/, "legacy persisted rows should still be normalized for display");
  assert.doesNotMatch(create, /validType\(|validStatus\(/, "create mutations must use parsed enum values");
  assert.doesNotMatch(status, /validStatus\(/, "status mutations must reject invalid values instead of defaulting");
  assert.doesNotMatch(document, /\["pending","received","verified","rejected"\]\.includes/);
  assert.match(route, /if\(dbSource==="unconfigured"\)throw createError\(\{statusCode:503/);
  assert.doesNotMatch(route, /deals:\[\],leads:\[\],properties:\[\],stats:\{\}/);
  assert.doesNotMatch(route, /readBody\(event\)\.catch/);
  assert.match(route, /statusCode:400,statusMessage:/);
});

test("deal list and document query failures cannot appear as empty CRM records", () => {
  assert.match(dealsComponent, /\[loaded,setLoaded\]=useState\(false\)/);
  assert.match(dealsComponent, /\[loadError,setLoadError\]=useState\(""\)/);
  assert.match(dealsComponent, /if\(!loaded&&loading\)/);
  assert.match(dealsComponent, /if\(!loaded&&loadError\)/);
  assert.match(dealsComponent, /!deals\.length&&loaded&&!loading&&!loadError/);
  assert.match(dealsComponent, /\[docsError,setDocsError\]=useState\(""\)/);
  assert.match(dealsComponent, /\[docsLoading,setDocsLoading\]=useState\(false\)/);
  assert.match(dealsComponent, /if\(!docsBelongToSelected\|\|visibleDocsLoading\|\|visibleDocsError\)/);
  assert.match(dealsComponent, /visibleDocsError\?<div className="admin-empty" role="alert"/);
  assert.match(dealsComponent, /docsRequestId=useRef\(0\)/);
  assert.match(dealsComponent, /requestId!==docsRequestId\.current/);
  assert.match(dealsComponent, /await load\(\)/);
});

test("deal and document refreshes ignore stale responses and preserve the selected deal's previous rows", () => {
  const listStart = dealsComponent.indexOf("const load=useCallback");
  const docsStart = dealsComponent.indexOf("const loadDocs=useCallback", listStart);
  const docsEnd = dealsComponent.indexOf("useEffect(()=>{void load();}", docsStart);
  const listLoad = dealsComponent.slice(listStart, docsStart);
  const docsLoad = dealsComponent.slice(docsStart, docsEnd);

  assert.match(dealsComponent, /listRequestId=useRef\(0\),docsRequestId=useRef\(0\)/);
  assert.match(listLoad, /const requestId=\+\+listRequestId\.current/);
  assert.match(listLoad, /if\(requestId!==listRequestId\.current\)return false/);
  assert.match(listLoad, /if\(requestId===listRequestId\.current\)setLoadError/);
  assert.doesNotMatch(listLoad, /setDeals\(\[\]\)/);

  assert.match(docsLoad, /const loadDocs=useCallback\(async\(id:string,clearPrevious=false\)/);
  assert.match(docsLoad, /mustClearPrevious=clearPrevious\|\|docsForRef\.current!==id/);
  assert.match(docsLoad, /if\(mustClearPrevious\)setDocs\(\[\]\)/);
  assert.match(docsLoad, /docsForRef\.current=id/);
  assert.match(docsLoad, /if\(requestId!==docsRequestId\.current\|\|selectedRef\.current!==id\)return false/);
  assert.match(docsLoad, /if\(requestId===docsRequestId\.current&&selectedRef\.current===id\)setDocsError/);
  assert.match(dealsComponent, /docsFor,setDocsFor/);
  assert.match(dealsComponent, /docsBelongToSelected=selected!==null&&docsFor===selected/);
  assert.match(dealsComponent, /visibleDocs=docsBelongToSelected\?docs:\[\]/);
  assert.match(dealsComponent, /selectedRef=useRef\(selected\)/);
  assert.match(dealsComponent, /if\(selectedRef\.current!==id\)return false/);
  assert.match(dealsComponent, /requestId!==docsRequestId\.current\|\|selectedRef\.current!==id/);
  assert.match(dealsComponent, /useEffect\(\(\)=>\(\)=>\{listRequestId\.current\+=1;docsRequestId\.current\+=1;\},\[\]\)/);
  assert.match(dealsComponent, /if\(selected\)void loadDocs\(selected,true\)/);
  assert.match(dealsComponent, /else\{docsRequestId\.current\+=1;setDocs\(\[\]\)/);
  assert.match(dealsComponent, /در حال به‌روزرسانی مدارک؛ اطلاعات قبلی حفظ شده است/);
  assert.match(dealsComponent, /visibleDocsError\?<div className="admin-empty" role="alert"/);
  assert.match(dealsComponent, /!visibleDocs\.length&&!visibleDocsLoading&&!visibleDocsError/);
  assert.match(dealsComponent, /disabled=\{!docsBelongToSelected\|\|visibleDocsLoading\|\|Boolean\(visibleDocsError\)\}/);
  assert.match(dealsComponent, /visibleDocs\.map/);
});

test("linked settlement create/delete and deal/settlement transitions preserve accounting invariants", () => {
  assert.match(lifecycle, /select id,status,consultant,commission::text as commission from admin_deals where id=\$1 for update/);
  assert.match(lifecycle, /const dealId = input\.dealId;\s*if \(!dealId\) return \{ kind: "deal_required" \}/);
  assert.match(lifecycle, /deal\.status !== "contracted" && deal\.status !== "completed"/);
  assert.match(lifecycle, /consultant_mismatch/);
  assert.match(lifecycle, /compareDecimalStrings\(dealCommission, input\.commission\)/);
  assert.match(lifecycle, /!\/\^\\d\{1,20\}/);
  assert.match(lifecycle, /status<>'cancelled' limit 1/);
  assert.match(commissionRoute, /kind==="duplicate_active"\)throw createError\(\{statusCode:409/);
  assert.match(commissionRoute, /if\(!dealId\) throw createError\(\{statusCode:400/);
  assert.match(commissionRoute, /kind==="deal_required"\)throw createError\(\{statusCode:400/);
  assert.match(commissionRoute, /deleteAdminCommissionSettlement\(sql,id\)/);
  assert.match(commissionRoute, /kind==="not_deletable"\)throw createError\(\{statusCode:409/);
  assert.match(statusLifecycle, /select id from admin_deals where id=\$1 for update/);
  assert.match(statusLifecycle, /select status from admin_deals where id=\$1 for update/);
  assert.match(statusLifecycle, /select deal_id from admin_commission_settlements where id=\$1 for update/);
  assert.match(statusLifecycle, /status='pending' and \$2 in \('approved','cancelled'\)/);
  assert.match(statusLifecycle, /status='approved' and \$2 in \('paid','cancelled'\)/);
  assert.match(statusLifecycle, /status='cancelled' and \$2='pending'/);
  assert.match(statusLifecycle, /id<>\$2 and status<>'cancelled'/);
  assert.match(statusLifecycle, /if \(!dealId && nextStatus !== "cancelled"\) return \{ kind: "deal_required" as const \}/);
  assert.match(commissionRoute, /kind==="deal_required"\) throw createError\(\{statusCode:409/);
  assert.match(commissionRoute, /kind==="duplicate_active"\) throw createError\(\{statusCode:409/);
  assert.match(statusLifecycle, /else null end,updated_at=current_timestamp/);
  assert.ok(statusLifecycle.indexOf("select status from admin_deals where id=$1 for update") < statusLifecycle.indexOf("select deal_id from admin_commission_settlements where id=$1 for update"));
  assert.match(dealsComponent, /if\(!r\.ok\|\|!isRecord\(x\)\|\|x\.success!==true\)/);
  assert.match(commissionComponent, /const canMoveStatus =/);
  assert.match(commissionComponent, /<option value="" disabled>/);
  assert.match(commissionComponent, /disabled=\{!canMoveStatus\(row\.status, "paid"\)\}/);
  assert.match(commissionComponent, /paidAt: value === "paid" \? new Date\(\)\.toISOString\(\) : null/);
  assert.match(commissionComponent, /if \(!response\.ok \|\| !isRecord\(payload\)/);
  assert.match(commissionComponent, /catch \(error\)/);
});

test("commission queue failures and unconfigured database never render as a confirmed empty queue", () => {
  assert.match(commissionRoute, /if\(dbSource==="unconfigured"\) throw createError\(\{statusCode:503/);
  assert.doesNotMatch(commissionRoute, /settlements:\[\],deals:\[\],summary:\{pending:0/);
  assert.doesNotMatch(commissionRoute, /readBody\(event\)\.catch\(\(\)=>\(\{\}\)\)/);
  assert.match(commissionRoute, /statusCode:400,statusMessage:/);
  assert.match(commissionComponent, /const \[loadError, setLoadError\] = useState\(""\)/);
  assert.match(commissionComponent, /if \(!loaded && loadError\)/);
  assert.match(commissionComponent, /role="alert"/);
  assert.match(commissionComponent, /if \(!loaded && loading\)/);
  assert.match(commissionComponent, /if \(!isRecord\(payload\) \|\| !Array\.isArray\(payload\.settlements\)/);
  assert.match(commissionComponent, /!isSummary\(payload\.summary\)/);
  assert.match(commissionComponent, /!loadError \? <div className="admin-empty"/);
  assert.match(commissionComponent, /await load\(\);/);
});

test("deal, commission and consultant reports preserve PostgreSQL numeric values as decimal strings", () => {
  assert.match(route, /amount:r\.amount==null\?null:String\(r\.amount\)/);
  assert.match(route, /commission:r\.commission==null\?null:String\(r\.commission\)/);
  assert.match(route, /volume:String\(stats\[0\]\?\.volume\?\?"0"\)/);
  assert.match(commissionRoute, /compareDecimalStrings\(consultantShare,commission\)/);
  assert.match(commissionRoute, /subtractDecimalStrings\(commission,consultantShare\)/);
  assert.match(commissionRoute, /commissionAmount:String\(r\.commission_amount\?\?"0"\)/);
  assert.match(performanceRoute, /item\.volume = canViewDeals \? String\(row\.volume \?\? "0"\) : null/);
  assert.match(performanceRoute, /compareDecimalStrings\(b\.volume \?\? "0", a\.volume \?\? "0"\)/);
  assert.match(lead360Route, /amount: row\.amount == null \? null : String\(row\.amount\)/);
  assert.match(lead360Route, /consultantShare: String\(row\.consultant_share \?\? "0"\)/);
  assert.doesNotMatch(route, /Number\(r\.amount\)|Number\(r\.commission\)|Number\(stats\[0\]\?\.volume\)/);
  assert.doesNotMatch(commissionRoute, /Number\(r\.commission_amount\)|Number\(r\.consultant_share\)|commissionNumber/);
  assert.doesNotMatch(performanceRoute, /item\.volume = number\(row\.volume\)|item\.due = number\(row\.due\)/);
  assert.doesNotMatch(lead360Route, /Number\(row\.amount\)|Number\(row\.commission_amount\)|Number\(customer\.budget_/);
});

test("consultant targets preserve exact numeric strings from request through aggregates and display", () => {
  assert.match(targetsRoute, /normalizeConsultantTargetMoney\(body\.volumeTarget\)/);
  assert.match(targetsRoute, /normalizeConsultantTargetMoney\(body\.commissionTarget\)/);
  assert.match(targetsRoute, /volumeTarget:\s*normalizeConsultantTargetMoney\(target\?\.volume_target\)/);
  assert.match(targetsRoute, /item\.volume\s*=\s*normalizeConsultantTargetMoney\(row\.volume\)/);
  assert.match(targetsRoute, /volume:string; commissions:string/);
  assert.doesNotMatch(targetsRoute, /function money\([^\n]*Number\(raw\)/);
  assert.match(targetsComponent, /volumeTarget: string; commissionTarget: string/);
  assert.match(targetsComponent, /volume: string; commissions: string/);
  assert.match(targetsComponent, /addDecimalStrings\(a\.volumeTarget,r\.volumeTarget\)/);
  assert.match(targetsComponent, /formatTomanExact\(r\.volume\)/);
  assert.doesNotMatch(targetsComponent, /formatToman\(/);
});


test("lead 360 gates deal documents and commission settlements by scoped permissions", () => {
  assert.match(lead360Route, /const role = normalizeAdminRole\(claims\?\.role\)/);
  assert.match(lead360Route, /hasAdminPermission\(role, "lead\.manage"\)/);
  assert.match(lead360Route, /const canViewDeals = hasAdminPermission\(role, "deal\.manage"\)/);
  assert.match(lead360Route, /const canViewCommissions = hasAdminPermission\(role, "commission\.manage"\)/);
  assert.match(lead360Route, /canViewDeals\s*\?\s*canViewCommissions\s*\?\s*sql\.query/);
  assert.match(lead360Route, /if \(canViewCommissions\) \{/);
  assert.match(lead360Route, /if \(dealIds\.length && canViewDeals\) \{/);
  assert.match(lead360Route, /access: \{ deals: canViewDeals, commissions: canViewCommissions \}/);
  assert.ok(lead360Route.indexOf("if (canViewCommissions) {") < lead360Route.indexOf("from admin_commission_settlements"));
  assert.ok(lead360Route.indexOf("if (dealIds.length && canViewDeals) {") < lead360Route.indexOf("from admin_deal_documents"));
  assert.match(lead360Route, /settlements: settlementRows\.map/);
  assert.match(lead360Route, /documents: documentRows\.map/);
});

test("consultant performance requires report access and gates every financial aggregate", () => {
  assert.match(performanceRoute, /hasAdminPermission\(role, "reports\.view"\)/);
  assert.match(performanceRoute, /const canViewDeals = hasAdminPermission\(role, "deal\.manage"\)/);
  assert.match(performanceRoute, /const canViewCommissions = hasAdminPermission\(role, "commission\.manage"\)/);
  assert.match(performanceRoute, /canViewDeals\s*\?\s*canViewCommissions\s*\?\s*sql\.query/);
  assert.match(performanceRoute, /canViewCommissions\s*\?\s*sql\.query/);
  assert.match(performanceRoute, /select consultant,count\(\*\)::int as deal_count,count\(\*\) filter\(where status='completed'\)::int as completed_deals from admin_deals/);
  assert.match(performanceRoute, /volume: string \| null/);
  assert.match(performanceRoute, /access: \{ deals: canViewDeals, commissions: canViewCommissions \}/);
  assert.match(readFileSync(new URL("../src/components/hirmand/admin-consultant-performance.tsx", import.meta.url), "utf8"), /volume: string \| null/);
});

test("finance ledger, insights, management report and operations preserve exact PostgreSQL money strings", () => {
  assert.match(financeRoute, /amount:normalizeFinanceMoney\(r\.amount\)/);
  assert.match(financeRoute, /summary:financeMoneySummary\(totals\[0\]\?\.income,totals\[0\]\?\.expense\)/);
  assert.match(financeRoute, /const amount=parseFinanceAmount\(body\.amount\)/);
  assert.doesNotMatch(financeRoute, /Number\(r\.amount\)|Number\(totals\[0\]\?\.income\)|Number\(totals\[0\]\?\.expense\)/);

  assert.match(financeInsightsRoute, /financeMoneySummary\(r\.income,r\.expense\)/);
  assert.match(financeInsightsRoute, /normalizeFinanceMoney\(r\.due\)/);
  assert.doesNotMatch(financeInsightsRoute, /Number\(r\.(?:income|expense|due|paid)\)/);

  assert.match(managementReportRoute, /normalizeFinanceMoney\(d\[0\]\?\.volume\)/);
  assert.match(managementReportRoute, /financeMoneySummary\(c\[0\]\?\.income,c\[0\]\?\.expense\)/);
  assert.match(managementReportRoute, /normalizeFinanceMoney\(row\.volume\)/);
  assert.doesNotMatch(managementReportRoute, /n\(d\[0\]\?\.(?:volume|commission)\)|n\(c\[0\]\?\.(?:income|expense)\)|n\(row\.volume\)/);

  assert.match(operationsRoute, /financeMoneySummary\(finance\[0\]\?\.income,finance\[0\]\?\.expense\)/);
  assert.doesNotMatch(operationsRoute, /Number\(finance\[0\]\?\.(?:income|expense)\)/);

  assert.match(financeManager, /amount:string/);
  assert.match(financeManager, /formatTomanExact\(item\.amount\)/);
  assert.match(financeInsights, /addDecimalStrings\(s,x\.income\)/);
  assert.match(financeInsights, /formatTomanExact\(n\)/);
  assert.match(managementReport, /volume: string; commission: string/);
  assert.match(managementReport, /formatTomanExact\(v\)/);
  assert.match(operationsCenter, /balance:string/);
  assert.match(operationsCenter, /formatTomanExact\(data\.finance\.balance/);
});
