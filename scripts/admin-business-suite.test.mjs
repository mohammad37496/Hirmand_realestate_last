import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("deal APIs fail closed and do not report missing mutations as successful", () => {
  const route = read("server/routes/api/admin-deals.post.ts");
  const deleteSql = read("src/lib/admin-deal-delete-sql.ts");
  const statusSql = read("src/lib/admin-deal-status-sql.ts");
  const ui = read("src/components/hirmand/admin-deals.tsx");
  assert.match(route, /dbSource==="unconfigured"\)throw createError\(\{statusCode:503/);
  assert.match(route, /withSqlTransaction\(\(tx\)=>updateAdminDealStatusWithSettlementGuard/);
  assert.match(route, /result\.kind==="settlement_exists"\)throw createError\(\{statusCode:409/);
  assert.match(statusSql, /select id from admin_deals where id=\$1 for update/);
  assert.match(statusSql, /select id from admin_commission_settlements where deal_id=\$1 and status<>'cancelled'/);
  assert.match(statusSql, /CONTRACTUAL_DEAL_STATUSES/);
  assert.ok(statusSql.indexOf("select id from admin_deals where id=$1 for update") < statusSql.indexOf("select id from admin_commission_settlements where deal_id=$1 and status<>'cancelled'"));
  assert.match(route, /DELETE_ADMIN_DEAL_WITH_DOCUMENTS_SQL/);
  assert.match(route, /if\(!deleted\[0\]\?\.id\)/);
  assert.match(route, /withSqlTransaction\(async \(tx\)/);
  assert.match(route, /enqueueMediaCleanupJob\(tx, fileUrl\)/);
  assert.match(route, /processMediaCleanupJobs\(cleanupJobIds, sql\)/);
  assert.ok(route.indexOf("lockMediaReferenceWrites(tx)") < route.indexOf("const rows = await tx.query"));
  assert.match(deleteSql, /not exists \(select 1 from admin_commission_settlements/);
  assert.match(deleteSql, /returning d\.id/);
  assert.match(route, /if\(linkedSettlement\.length\)throw createError\(\{statusCode:409/);
  assert.match(route, /throw createError\(\{statusCode:404,statusMessage:/);
  assert.match(route, /documentStatus\)\)\)throw createError\(\{statusCode:400/);
  assert.match(ui, /AdminErrorBanner message=\{loadError\}/);
  assert.match(ui, /if\(!r\.ok\)throw new Error\(x\?\.statusMessage/);
});

test("commission settlements match real completed deals and protect approved payouts", () => {
  const route = read("server/routes/api/admin-commission.post.ts");
  const ui = read("src/components/hirmand/admin-commission-settlement.tsx");
  const statusSql = read("src/lib/admin-deal-status-sql.ts");
  assert.match(route, /dbSource==="unconfigured"\) throw createError\(\{statusCode:503/);
  assert.match(route, /Number\.isSafeInteger\(commissionNumber\)/);
  assert.match(route, /select consultant,commission,status from admin_deals where id=\$1/);
  assert.match(route, /includes\(String\(deal\.status\)\)/);
  assert.match(route, /Number\(deal\.commission\)!==commissionNumber/);
  assert.match(route, /where deal_id=\$1 and status<>'cancelled' limit 1/);
  assert.match(route, /returning id/);
  assert.match(route, /status in \('pending','cancelled'\) returning id/);
  assert.match(statusSql, /status='pending' and \$2 in \('approved','cancelled'\)/);
  assert.match(statusSql, /status='approved' and \$2 in \('paid','cancelled'\)/);
  assert.match(statusSql, /status='cancelled' and \$2='pending'/);
  assert.match(route, /withSqlTransaction\(\(tx\)=>updateCommissionSettlementStatusWithDealGuard/);
  assert.match(statusSql, /select status from admin_deals where id=\$1 for update/);
  assert.match(statusSql, /select deal_id from admin_commission_settlements where id=\$1 for update/);
  assert.match(statusSql, /nextStatus !== "cancelled"/);
  assert.ok(statusSql.indexOf("select status from admin_deals where id=$1 for update") < statusSql.indexOf("select deal_id from admin_commission_settlements where id=$1 for update"));
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
    const deleteSqlSource = read("src/lib/admin-deal-delete-sql.ts");
    const deleteSql = deleteSqlSource.match(/export const DELETE_ADMIN_DEAL_WITH_DOCUMENTS_SQL = `([\s\S]*?)`;/)?.[1];
    assert.ok(deleteSql, "deal deletion SQL must remain independently executable");
    await db.exec("create table admin_deals(id text primary key); create table admin_deal_documents(id text primary key, deal_id text not null, document_type text not null, file_url text, unique(deal_id,document_type)); create table admin_commission_settlements(id text primary key,deal_id text);");
    await db.query("insert into admin_deals(id) values($1)", ["deal-1"]);
    const seedSql = "insert into admin_deal_documents(id,deal_id,document_type) select gen_random_uuid()::text,$1,document_type from unnest($2::text[]) as docs(document_type) on conflict(deal_id,document_type) do nothing returning id";
    const seeded = await db.query(seedSql, ["deal-1", ["identity", "ownership"]]);
    const repeated = await db.query(seedSql, ["deal-1", ["identity", "ownership"]]);
    assert.equal(seeded.rows.length, 2);
    assert.equal(repeated.rows.length, 0);
    await db.query("insert into admin_commission_settlements(id,deal_id) values($1,$2)", ["settlement-1", "deal-1"]);
    await db.query("update admin_deal_documents set file_url='https://media.example/identity.pdf' where document_type='identity'");
    const blockedDelete = await db.query(deleteSql, ["deal-1"]);
    assert.equal(blockedDelete.rows[0]?.id, null);
    assert.deepEqual(blockedDelete.rows[0]?.file_urls, []);
    assert.equal((await db.query("select id from admin_deal_documents where deal_id=$1", ["deal-1"])).rows.length, 2);
    await db.query("delete from admin_commission_settlements where deal_id=$1", ["deal-1"]);
    const deleted = await db.query(deleteSql, ["deal-1"]);
    const remaining = await db.query("select id from admin_deal_documents where deal_id=$1", ["deal-1"]);
    assert.equal(deleted.rows[0]?.id, "deal-1");
    assert.deepEqual(deleted.rows[0]?.file_urls, ["https://media.example/identity.pdf"]);
    assert.equal(remaining.rows.length, 0);
  } finally {
    await db.close();
  }
});
