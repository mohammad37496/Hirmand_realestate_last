import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../server/routes/api/admin-deals.post.ts", import.meta.url), "utf8");
const commissionRoute = readFileSync(new URL("../server/routes/api/admin-commission.post.ts", import.meta.url), "utf8");
const performanceRoute = readFileSync(new URL("../server/routes/api/admin-consultant-performance.get.ts", import.meta.url), "utf8");
const lead360Route = readFileSync(new URL("../server/routes/api/admin-lead-360.post.ts", import.meta.url), "utf8");

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
  assert.match(performanceRoute, /item\.volume = String\(row\.volume \?\? "0"\)/);
  assert.match(performanceRoute, /compareDecimalStrings\(b\.volume, a\.volume\)/);
  assert.match(lead360Route, /amount: row\.amount == null \? null : String\(row\.amount\)/);
  assert.match(lead360Route, /consultantShare: String\(row\.consultant_share \?\? "0"\)/);
  assert.doesNotMatch(route, /Number\(r\.amount\)|Number\(r\.commission\)|Number\(stats\[0\]\?\.volume\)/);
  assert.doesNotMatch(commissionRoute, /Number\(r\.commission_amount\)|Number\(r\.consultant_share\)|commissionNumber/);
  assert.doesNotMatch(performanceRoute, /item\.volume = number\(row\.volume\)|item\.due = number\(row\.due\)/);
  assert.doesNotMatch(lead360Route, /Number\(row\.amount\)|Number\(row\.commission_amount\)|Number\(customer\.budget_/);
});
