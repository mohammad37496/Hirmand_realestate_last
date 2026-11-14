import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const routePath = fileURLToPath(new URL("../src/routes/api/auth/$.ts", import.meta.url));
const source = readFileSync(routePath, "utf8");

test("Better Auth is mounted at the same-origin /api/auth catch-all", () => {
  assert.match(source, /createFileRoute\(["']\/api\/auth\/\$["']\)/);
  assert.match(source, /import\s*\{\s*auth\s*\}\s*from\s*["']@\/lib\/auth\/server["']/);
});

test("Better Auth handles both session reads and sign-in/sign-out writes", () => {
  assert.match(source, /GET\s*:\s*async\s*\(\{\s*request\s*\}\)\s*=>\s*auth\.handler\(request\)/);
  assert.match(source, /POST\s*:\s*async\s*\(\{\s*request\s*\}\)\s*=>\s*auth\.handler\(request\)/);
});

const adminSessionPath = fileURLToPath(new URL("../server/routes/api/admin/session.post.ts", import.meta.url));
const adminSessionSource = readFileSync(adminSessionPath, "utf8");
const logoutBlock = adminSessionSource.split('if (action === "logout") {')[1]?.split("\n  }")[0] ?? "";

test("admin logout verifies the signed token and awaits server-side revocation", () => {
  assert.match(logoutBlock, /getAdminSessionIdFromToken\(getCookie\(event, ADMIN_SESSION_COOKIE\)\)/);
  assert.match(logoutBlock, /completeAdminSessionLogout\([\s\S]*?revokeAdminSession/);
  assert.doesNotMatch(logoutBlock, /\.catch\(\(\)\s*=>\s*\{\s*\}\)/);
});

test("admin logout preserves the cookie on revoke failure and clears it only after success", () => {
  assert.ok(logoutBlock.indexOf("if (!logoutCompleted)") < logoutBlock.indexOf("setCookie(event, ADMIN_SESSION_COOKIE"));
  assert.match(logoutBlock, /if \(!logoutCompleted\)[\s\S]*?statusCode:\s*503/);
  assert.match(logoutBlock, /return \{ success: true \}/);
});

const smokePath = fileURLToPath(new URL("./browser-smoke.mjs", import.meta.url));
const smokeSource = readFileSync(smokePath, "utf8");

test("production-preview browser smoke forwards a synthetic client IP only to loopback", () => {
  assert.match(smokeSource, /const localSmokeTarget = \["localhost", "127\.0\.0\.1", "\[::1\]"\]\.includes\(new URL\(url\)\.hostname\)/);
  assert.match(smokeSource, /localSmokeTarget \? \{ extraHTTPHeaders: \{ "x-forwarded-for": "127\.0\.0\.1" \} \} : \{\}/);
  assert.doesNotMatch(smokeSource, /browser\.newPage\(/);
});

test("browser smoke requires a JSON 200 from the Better Auth session route", () => {
  assert.match(smokeSource, /new URL\(["']\/api\/auth\/get-session["'], url\)/);
  assert.match(smokeSource, /response.status\(\) === 200 && validJson/);
  assert.match(smokeSource, /if \(!authRouteCheck.ok\)/);
});
