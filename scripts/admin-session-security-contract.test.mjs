import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../", import.meta.url);
const source = async (path) => readFile(new URL(path, root), "utf8");

test("deployed admin sessions require a session id and persisted database row", async () => {
  const code = await source("src/lib/admin-session.server.ts");
  assert.match(code, /if \(!sessionId\) return null/);
  assert.match(code, /dbSource === "unconfigured"[\s\S]{0,180}process\.env\.NODE_ENV === "production"/);
  assert.match(code, /accountId = sessionRow\.account_id/);
});

test("deployed login fails closed when session persistence is unavailable", async () => {
  const code = await source("server/routes/api/admin/session.post.ts");
  assert.match(code, /if \(secureCookie && dbSource === "unconfigured"\)/);
  assert.match(code, /statusCode: 503/);
});

test("logout revocation errors return 503 instead of claiming success", async () => {
  const code = await source("server/routes/api/admin/session.post.ts");
  assert.match(code, /getVerifiedAdminSessionId\(token\)/);
  assert.match(code, /catch \{[\s\S]*?statusCode: 503[\s\S]*?خروج امن از پنل انجام نشد/);
  assert.doesNotMatch(code, /setCookie\(event, ADMIN_SESSION_COOKIE, "",[\s\S]*?\.catch\(\(\) => \{\}\)/);
});

test("lead assignment fails closed when consultant or unassigned-lead queries fail", async () => {
  const code = await source("server/routes/api/admin-lead-assignment.post.ts");
  assert.doesNotMatch(code, /\)\.catch\(\(error\) => \{[\s\S]*?return \[\];[\s\S]*?\}\);/);
  assert.doesNotMatch(code, /from leads where trim\(coalesce\(consultant,''\)\)=''[\s\S]*?\.catch\(\(\) => \[\]\)/);
});

test("admin notification source-query failures cannot masquerade as an empty notification list", async () => {
  const code = await source("src/lib/admin-notifications.ts");
  assert.equal((code.match(/\.catch\(\(\) => \[\]\)/g) || []).length, 0);
});

test("notification center distinguishes source failures from an empty inbox and offers retry", async () => {
  const code = await source("src/components/hirmand/admin-notification-center.tsx");
  assert.ok(code.includes("const [loadError, setLoadError] = useState(false)"));
  assert.match(code, /setLoadError\(true\)/);
  assert.ok(code.includes('role="alert"'));
  assert.ok(code.includes("onClick={() => void load()}"));
});

test("admin UI checks the logout response before clearing its local session", async () => {
  const code = await source("src/components/hirmand/_admin_impl.tsx");
  const start = code.indexOf("function logout() {");
  const end = code.indexOf("function toggleSelected", start);
  assert.ok(start >= 0 && end > start, "logout function should remain discoverable");
  const logout = code.slice(start, end);
  assert.match(logout, /if \(!response\.ok\)/);
  assert.match(logout, /catch \(error\)[\s\S]*?toast\.error[\s\S]*?return;/);
  assert.ok(logout.indexOf("if (!response.ok)") < logout.indexOf("setUnlocked(false)"));
});

async function walk(dir) {
  const found = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) found.push(...await walk(path));
    else if (/\.(ts|tsx)$/.test(item.name)) found.push(path);
  }
  return found;
}

test("admin API handlers have both session validation and server-side role permission checks", async () => {
  const apiRoot = fileURLToPath(new URL("../server/routes/api/", import.meta.url));
  const files = await walk(apiRoot);
  const protectedFiles = files.filter((file) => {
    const rel = relative(apiRoot, file).split(sep).join("/");
    return (/(^|\/)admin([-/])|^admin-/.test(rel)) && rel !== "admin/session.post.ts";
  });
  assert.ok(protectedFiles.length > 20, "expected the admin API surface to be scanned");
  const missing = [];
  for (const file of protectedFiles) {
    const code = await readFile(file, "utf8");
    if (!/defineEventHandler|createServerFn/.test(code)) continue;
    if (!/verifyAdminSessionToken|getAdminSessionClaims/.test(code)) missing.push(`${relative(apiRoot, file)}: session check`);
    if (!/hasAdminPermission|requireAdminPermission|requireAdmin\s*\(|requireAccountsAdmin/.test(code)) missing.push(`${relative(apiRoot, file)}: role permission check`);
  }
  assert.deepEqual(missing, []);
});

test("lead dedupe scan does not turn database failures into an empty duplicate list", async () => {
  const code = await source("server/routes/api/admin-lead-dedupe.post.ts");
  const start = code.indexOf('if (action === "list")');
  const end = code.indexOf("const canonicalId", start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(code.slice(start, end), /\.catch\s*\(/);
});

test("lead dedupe merge locks both rows and requires both state transitions before success", async () => {
  const code = await source("server/routes/api/admin-lead-dedupe.post.ts");
  const mergeSql = await source("src/lib/admin-lead-dedupe-sql.ts");
  const mutation = await source("src/lib/admin-lead-dedupe.server.ts");
  assert.match(code, /withSqlTransaction\(async \(tx\)/);
  assert.match(code, /mergeLeadDedupeRelations\(tx, canonicalId, duplicateId\)/);
  assert.match(code, /if \(!mutation\) return \{ kind: "stale" as const \}/);
  assert.match(mutation, /MERGE_LEADS_WITH_ACTIVITY_SQL/);
  assert.match(mutation, /update admin_deals set lead_id=\$1/);
  assert.match(mutation, /update finance_transactions set lead_id=\$1/);
  assert.match(mutation, /update admin_tasks set entity_id=\$1/);
  assert.match(mergeSql, /locked as materialized\s*\([\s\S]*?where id = any\(\$3::text\[\]\) and merged_into_lead_id is null\s+order by id for update/);
  assert.match(mergeSql, /and \(select count\(\*\) from locked\) = 2/);
  assert.match(mergeSql, /where lead_id = \$2 and exists \(select 1 from merged\)/);
  assert.match(mergeSql, /where id = \$2 and exists \(select 1 from merged\)/);
  assert.match(mergeSql, /merge_history as \(/);
  assert.match(mergeSql, /merged_into_lead_id = \$1/);
  assert.doesNotMatch(code + mutation, /\.catch\(\(\)\s*=>\s*\{\}\)/);
});

test("management report finance totals include exactly the selected calendar-day range", async () => {
  const code = await source("server/routes/api/admin-management-report.get.ts");
  assert.match(code, /transaction_date >= current_date - \(\$1::int - 1\) and transaction_date < current_date \+ 1/);
  assert.doesNotMatch(code, /transaction_date >= current_date - \(\$1::int\)\s*["']/);
});
test("customer chat cooldown is claimed atomically and migration preserves recent-message cooldowns", async () => {
  const route = await source("server/routes/api/customer-chat.post.ts");
  const migration = await source("migrations/0106_customer_message_cooldown.sql");
  assert.match(route, /customer_message_cooldowns/);
  assert.match(route, /where customer_message_cooldowns\.next_allowed_at <= current_timestamp/);
  assert.match(route, /if \(!inserted\.length\)/);
  assert.doesNotMatch(route, /select created_at as "createdAt" from customer_messages/);
  const sqlMatch = route.match(/const inserted = await sql\.query<\{ id: string \}>\(\s*`([\s\S]*?)`,\s*\[/);
  assert.ok(sqlMatch, "production route must use one cooldown-claim/message-insert statement");
  const sendSql = sqlMatch[1];
  const db = new PGlite();
  try {
    await db.exec(`
      create table leads (id text primary key, tracking_token text not null);
      create table customer_messages (id text primary key, lead_id text not null, tracking_token text not null, sender_type text not null, sender_name text not null, message text not null, created_at timestamptz not null default current_timestamp);
      insert into leads values ('lead-1','HIR-26-AAAAAAAAAAAA');
      insert into customer_messages (id,lead_id,tracking_token,sender_type,sender_name,message,created_at) values ('existing','lead-1','HIR-26-AAAAAAAAAAAA','customer','Customer','existing message',current_timestamp);
    `);
    await db.exec(migration);
    const send = (id) => db.query(sendSql, ['lead-1',id,'HIR-26-AAAAAAAAAAAA','Customer','new message']);
    assert.equal((await send('cooldown-blocked')).rows.length,0,"recent existing messages must retain the cooldown across migration");
    await db.query("update customer_message_cooldowns set next_allowed_at=current_timestamp - interval '1 second' where lead_id='lead-1'");
    const concurrent = await Promise.all([send('message-a'),send('message-b')]);
    assert.equal(concurrent.reduce((count,result)=>count+result.rows.length,0),1,"only one concurrent send should claim the cooldown");
    const messages = await db.query("select id from customer_messages where lead_id='lead-1'");
    assert.equal(messages.rows.length,2);
    const cooldown = await db.query("select next_allowed_at > current_timestamp as active from customer_message_cooldowns where lead_id='lead-1'");
    assert.equal(cooldown.rows[0].active,true);
  } finally { await db.close(); }
});
