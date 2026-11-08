import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../server/routes/api/admin-deals.post.ts", import.meta.url), "utf8");
const commissionRoute = readFileSync(new URL("../server/routes/api/admin-commission.post.ts", import.meta.url), "utf8");
const performanceRoute = readFileSync(new URL("../server/routes/api/admin-consultant-performance.get.ts", import.meta.url), "utf8");
const lead360Route = readFileSync(new URL("../server/routes/api/admin-lead-360.post.ts", import.meta.url), "utf8");
const dealLifecycle = readFileSync(new URL("../src/lib/admin-deal-lifecycle.ts", import.meta.url), "utf8");

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
  assert.ok(status.indexOf("adminDealStatusUpdateSchema.safeParse") < status.indexOf("update admin_deals"));

  assert.match(document, /adminDealDocumentUpdateSchema\.safeParse\(\{documentStatus:body\.documentStatus\}\)/);
  assert.match(document, /const status=parsed\.data\.documentStatus/);
  assert.ok(document.indexOf("adminDealDocumentUpdateSchema.safeParse") < document.indexOf("insert into admin_deal_documents"));
  assert.match(route, /type:validType\(r\.deal_type\),status:validStatus\(r\.status\)/, "legacy persisted rows should still be normalized for display");
  assert.doesNotMatch(create, /validType\(|validStatus\(/, "create mutations must use parsed enum values");
  assert.doesNotMatch(status, /validStatus\(/, "status mutations must reject invalid values instead of defaulting");
  assert.doesNotMatch(document, /\["pending","received","verified","rejected"\]\.includes/);
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

test("deal deletion preserves settlements and settlement creation locks its linked deal", () => {
  assert.match(route, /deleteAdminDeal\(sql,id\)/);
  assert.match(route, /result\.kind==="settlements_exist"\)throw createError\(\{statusCode:409/);
  assert.doesNotMatch(route, /delete from admin_commission_settlements/);
  assert.doesNotMatch(route, /delete from admin_deal_documents where deal_id=\$1/);
  assert.match(commissionRoute, /createAdminCommissionSettlement\(sql,/);
  assert.match(commissionRoute, /result\.kind==="deal_not_found"\)throw createError\(\{statusCode:404/);
  assert.match(dealLifecycle, /from admin_deals where id=\$1 limit 1 for update/);
  assert.match(dealLifecycle, /from admin_deals where id=\$1 limit 1 for key share/);
  assert.match(dealLifecycle, /from admin_commission_settlements where deal_id=\$1 limit 1/);
});
