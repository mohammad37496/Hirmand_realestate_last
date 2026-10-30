import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("deal APIs fail closed and do not report missing mutations as successful", () => {
  const route = read("server/routes/api/admin-deals.post.ts");
  const ui = read("src/components/hirmand/admin-deals.tsx");
  assert.match(route, /dbSource==="unconfigured"\)throw createError\(\{statusCode:503/);
  assert.match(route, /update admin_deals[\s\S]*returning id/);
  assert.match(route, /if\(!updated\.length\)throw createError\(\{statusCode:404/);
  assert.match(route, /with removed_documents as \(delete from admin_deal_documents[\s\S]*not exists\(select 1 from admin_commission_settlements[\s\S]*delete from admin_deals[\s\S]*returning d\.id/);
  assert.match(route, /if\(linkedSettlement\.length\)throw createError\(\{statusCode:409/);
  assert.match(route, /throw createError\(\{statusCode:404,statusMessage:/);
  assert.match(route, /documentStatus\)\)\)throw createError\(\{statusCode:400/);
  assert.match(ui, /AdminErrorBanner message=\{loadError\}/);
  assert.match(ui, /if\(!r\.ok\)throw new Error\(x\?\.statusMessage/);
});

test("commission settlements match real completed deals and protect approved payouts", () => {
  const route = read("server/routes/api/admin-commission.post.ts");
  const ui = read("src/components/hirmand/admin-commission-settlement.tsx");
  assert.match(route, /dbSource==="unconfigured"\) throw createError\(\{statusCode:503/);
  assert.match(route, /Number\.isSafeInteger\(commissionNumber\)/);
  assert.match(route, /select consultant,commission,status from admin_deals where id=\$1/);
  assert.match(route, /includes\(String\(deal\.status\)\)/);
  assert.match(route, /Number\(deal\.commission\)!==commissionNumber/);
  assert.match(route, /where deal_id=\$1 and status<>'cancelled' limit 1/);
  assert.match(route, /returning id/);
  assert.match(route, /status in \('pending','cancelled'\) returning id/);
  assert.match(route, /status='pending' and \$2 in \('approved','cancelled'\)/);
  assert.match(route, /status='approved' and \$2 in \('paid','cancelled'\)/);
  assert.match(route, /status='cancelled' and \$2='pending'/);
  assert.match(ui, /AdminErrorBanner message=\{loadError\}/);
  assert.match(ui, /canMoveStatus\(row\.status, "paid"\)/);
  assert.match(ui, /if \(!response\.ok\) throw new Error\(payload\?\.statusMessage/);
});

test("finance ledger distinguishes an unavailable database from an empty ledger", () => {
  const route = read("server/routes/api/admin-finance.post.ts");
  const ui = read("src/components/hirmand/admin-finance-manager.tsx");
  assert.match(route, /if \(dbSource === "unconfigured"\) \{\s*throw createError\(\{ statusCode: 503/);
  assert.doesNotMatch(route, /transactions:\s*\[\],\s*summary:/);
  assert.match(ui, /AdminErrorBanner message=\{loadError\}/);
  assert.match(ui, /setItems\(\[\]\);setSummary\(\{income:0,expense:0,balance:0\}\);setLoadError\(message\)/);
});

test("manager assistant uses aggregate data, role checks, server credentials and bounded requests", () => {
  const route = read("server/routes/api/admin-assistant.post.ts");
  const ui = read("src/components/hirmand/admin-ai-assistant.tsx");
  const report = read("src/components/hirmand/admin-management-report.tsx");
  assert.match(route, /verifyAdminSessionToken/);
  assert.match(route, /assertSameOrigin/);
  assert.match(route, /\["owner", "manager", "sales"\]/);
  assert.match(route, /consumeAdminAttempt\(`admin-assistant:/);
  assert.match(route, /process\.env\.OPENAI_API_KEY/);
  assert.match(route, /store:\s*false/);
  assert.match(route, /AbortSignal\.timeout\(20_000\)/);
  assert.match(route, /overdueFollowUps/);
  assert.match(route, /finance.manage/);
  assert.match(route, /commission.manage/);
  assert.doesNotMatch(route, /customer_phone|customer_name|lead\.phone|select[^\n]*phone/i);
  assert.match(ui, /\/api\/admin-assistant/);
  assert.match(ui, /maxLength=\{1200\}/);
  assert.match(report, /<AdminAiAssistant role=\{role\}\s*\/>/);
});

test("deal document seed is repeatable and deal removal deletes its documents in one statement", async () => {
  const db = new PGlite();
  try {
    await db.exec("create table admin_deals(id text primary key); create table admin_deal_documents(id text primary key, deal_id text not null, document_type text not null, unique(deal_id,document_type)); create table admin_commission_settlements(id text primary key,deal_id text);");
    await db.query("insert into admin_deals(id) values($1)", ["deal-1"]);
    const seedSql = "insert into admin_deal_documents(id,deal_id,document_type) select gen_random_uuid()::text,$1,document_type from unnest($2::text[]) as docs(document_type) on conflict(deal_id,document_type) do nothing returning id";
    const seeded = await db.query(seedSql, ["deal-1", ["identity", "ownership"]]);
    const repeated = await db.query(seedSql, ["deal-1", ["identity", "ownership"]]);
    assert.equal(seeded.rows.length, 2);
    assert.equal(repeated.rows.length, 0);
    await db.query("insert into admin_commission_settlements(id,deal_id) values($1,$2)", ["settlement-1", "deal-1"]);
    const blockedDelete = await db.query("with removed_documents as (delete from admin_deal_documents where deal_id=$1 and exists(select 1 from admin_deals d where d.id=$1 and not exists(select 1 from admin_commission_settlements s where s.deal_id=d.id)) returning deal_id) delete from admin_deals d where d.id=$1 and not exists(select 1 from admin_commission_settlements s where s.deal_id=d.id) returning d.id", ["deal-1"]);
    assert.equal(blockedDelete.rows.length, 0);
    assert.equal((await db.query("select id from admin_deal_documents where deal_id=$1", ["deal-1"])).rows.length, 2);
    await db.query("delete from admin_commission_settlements where deal_id=$1", ["deal-1"]);
    const deleted = await db.query("with removed_documents as (delete from admin_deal_documents where deal_id=$1 and exists(select 1 from admin_deals d where d.id=$1 and not exists(select 1 from admin_commission_settlements s where s.deal_id=d.id)) returning deal_id) delete from admin_deals d where d.id=$1 and not exists(select 1 from admin_commission_settlements s where s.deal_id=d.id) returning d.id", ["deal-1"]);
    const remaining = await db.query("select id from admin_deal_documents where deal_id=$1", ["deal-1"]);
    assert.equal(deleted.rows.length, 1);
    assert.equal(remaining.rows.length, 0);
  } finally {
    await db.close();
  }
});
