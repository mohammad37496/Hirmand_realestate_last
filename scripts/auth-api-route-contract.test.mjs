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

const providerSource = readFileSync(new URL("../src/lib/auth/providers.ts", import.meta.url), "utf8");
const envExampleSource = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const readmeSource = readFileSync(new URL("../README.md", import.meta.url), "utf8");

test("documented production OAuth callbacks match Better Auth provider routes", () => {
  for (const providerId of ["grok-google", "grok-x"]) {
    assert.ok(providerSource.includes(`providerId: "${providerId}"`));
    assert.ok(envExampleSource.includes(`https://hirmandrealestate.ir/api/auth/callback/${providerId}`));
    assert.ok(readmeSource.includes(`https://hirmandrealestate.ir/api/auth/callback/${providerId}`));
  }
  assert.doesNotMatch(envExampleSource, /\/api\/auth\/oauth2\/callback\//);
  assert.doesNotMatch(readmeSource, /\/api\/auth\/oauth2\/callback\//);
  assert.match(readmeSource, /GROK_PREVIEW_CLIENT_SECRET/);
  assert.match(readmeSource, /https:\/\/\*\.grok-sandbox\.com\/api\/auth\/callback\/\*/);
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
  assert.match(logoutBlock, /setCookie\(event, ADMIN_SESSION_COOKIE, "",[\s\S]*?maxAge:\s*0/);
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

const logoutHelperPath = fileURLToPath(new URL("../src/lib/admin-session-logout.ts", import.meta.url));
const logoutHelperSource = readFileSync(logoutHelperPath, "utf8");

const adminSessionServerPath = fileURLToPath(new URL("../src/lib/admin-session.server.ts", import.meta.url));
const adminSessionServerSource = readFileSync(adminSessionServerPath, "utf8");

test("production rejects stateless admin JWTs when database configuration is missing", () => {
  assert.match(adminSessionServerSource, /shouldRejectStatelessAdminSession\(dbSource !== "unconfigured", process\.env\.NODE_ENV === "production" \|\| process\.env\.VERCEL === "1"\)/);
  assert.match(adminSessionServerSource, /if \(shouldRejectStatelessAdminSession[\s\S]*?return null/);
});

test("stateless admin-key logout clears the local cookie without claiming server-side revocation", () => {
  assert.match(logoutBlock, /dbSource !== "unconfigured"/);
  assert.match(logoutHelperSource, /if \(!databaseConfigured\) return true/);
  assert.match(logoutHelperSource, /copied development JWT remains[\s\S]*?valid until expiry/);
});

test("production rejects stateless admin-key login before issuing a cookie", () => {
  const probeIndex = adminSessionSource.indexOf('if (!submittedKey && !accountLogin) return');
  const guardIndex = adminSessionSource.indexOf('shouldRejectStatelessAdminSession(dbSource !== "unconfigured", secureCookie)');
  const cookieIndex = adminSessionSource.indexOf('setCookie(event, ADMIN_SESSION_COOKIE, token');
  assert.ok(probeIndex >= 0 && guardIndex > probeIndex && cookieIndex > guardIndex);
  assert.match(adminSessionSource, /if \(shouldRejectStatelessAdminSession\([\s\S]*?statusCode:\s*503/);
});
