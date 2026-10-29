import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

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
  assert.match(code, /locked as materialized\s*\([\s\S]*?where id = any\(\$1::text\[\]\) order by id for update/);
  assert.match(code, /and \(select count\(\*\) from locked\) = 2/);
  assert.match(code, /where lead_id = \$2 and exists \(select 1 from merged\)/);
  assert.match(code, /where id = \$2 and exists \(select 1 from merged\)/);
  assert.match(code, /!rows\[0\]\?\.canonical_id \|\| !rows\[0\]\?\.duplicate_id/);
});

test("management report finance totals include exactly the selected calendar-day range", async () => {
  const code = await source("server/routes/api/admin-management-report.get.ts");
  assert.match(code, /transaction_date >= current_date - \(\$1::int - 1\) and transaction_date < current_date \+ 1/);
  assert.doesNotMatch(code, /transaction_date >= current_date - \(\$1::int\)\s*["']/);
});
