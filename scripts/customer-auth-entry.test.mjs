import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { getSafeLoginReturnPath } from "../src/lib/auth/return-path.mjs";

const source = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const login = source("../src/routes/login.tsx");
const authConfig = source("../src/lib/auth/email-password.ts");
const header = source("../src/components/hirmand/header.tsx");
const workspace = source("../src/components/hirmand/customer-workspace-sync.tsx");
const favorites = source("../src/routes/favorites.tsx");
const properties = source("../src/routes/properties.index.tsx");
const actions = source("../src/components/hirmand/property-actions.tsx");
const tracker = source("../src/components/hirmand/visitor-tracker.tsx");
const detail = source("../src/components/hirmand/property-detail-view.tsx");
const root = source("../src/routes/__root.tsx");
const siteChrome = source("../src/components/hirmand/site-chrome.tsx");
const client = source("../src/lib/auth/client.ts");
const server = source("../src/lib/auth/server.ts");
const workspaceGet = source("../src/routes/api/customer-workspace.ts");
const workspacePost = workspaceGet;
const workspaceResponse = source("../src/lib/customer-workspace-response.server.ts");
const workspaceE2e = source("./customer-auth-e2e-smoke.mjs");
const verify = source("../src/lib/auth/verify.server.ts");
const verifyWorkflow = source("../.github/workflows/verify.yml");

test("customer accounts support email registration and sign-in on Better Auth", () => {
  assert.match(authConfig, /emailAndPasswordEnabled\s*=\s*true/);
  assert.match(login, /authClient\.signUp\.email/);
  assert.match(login, /authClient\.signIn\.email/);
  assert.match(login, /<Link to=\{next\}/);
  assert.match(client, /VITE_GROK_OAUTH_ENABLED/);
  assert.doesNotMatch(client, /runPreSignInSignOut\(\{[^}]*clearWorkspace/);
  assert.match(server, /process\.env\.NODE_ENV === "production" \? \[\] : LOCAL_DEV_ORIGINS/);
  assert.match(server, /"http:\/\/localhost:8081"/,
    "the isolated production-preview E2E origin must be trusted for credentialed sign-up");
  assert.match(verifyWorkflow, /CUSTOMER_AUTH_SMOKE_URL=http:\/\/localhost:8081 node scripts\/customer-auth-e2e-smoke\.mjs/,
    "Verify must exercise real sign-up, account isolation, sign-out and sign-in against its temporary PostgreSQL database");
  assert.match(server, /allowPreviewOAuth/);
  assert.match(server, /requireLocalEmailVerified:\s*true/);
  assert.doesNotMatch(server, /requireLocalEmailVerified:\s*false/);
  assert.match(login, /GROK_PROVIDERS\.map/);
  assert.match(login, /!mounted \|\| isPending/);
});

test("login return path is restricted to same-origin absolute paths", () => {
  assert.match(login, /next:\s*getSafeLoginReturnPath\(search\.next\)/);
  assert.equal(getSafeLoginReturnPath("/favorites"), "/favorites");
  assert.equal(getSafeLoginReturnPath("/favorites?tab=saved#recent"), "/favorites?tab=saved#recent");
});

test("login return path rejects WHATWG backslash and protocol-relative open redirects", () => {
  for (const value of ["//evil.example", "/\\evil.example", "/\\\\evil.example", "https://evil.example/path"]) {
    assert.equal(getSafeLoginReturnPath(value), "/favorites", `must reject ${JSON.stringify(value)}`);
  }
  assert.equal(getSafeLoginReturnPath("/%5C%5Cevil.example"), "/%5C%5Cevil.example");
});

test("site header exposes account access on desktop and mobile navigation", () => {
  assert.match(header, /<CustomerAccountAccess\s*\/>/);
  assert.match(header, /<CustomerAccountAccess compact\s*\/>/);
  assert.match(header, /to="\/login"/);
  assert.match(header, /if \(!mounted \|\| !authEnabled \|\| isPending\) return null/);
  assert.match(workspaceE2e, /assertHeaderAccountAccess\(page, false\)/,
    "the browser smoke must verify signed-out account access in desktop and mobile navigation");
  assert.match(workspaceE2e, /assertHeaderAccountAccess\(firstPage, true\)/,
    "the browser smoke must verify signed-in account access in desktop and mobile navigation");
  assert.match(workspaceE2e, /\.mobile-menu\.is-open \.customer-account-access\.is-compact/);
  assert.match(workspaceE2e, /width: 320, height: 800/);
  assert.match(workspaceE2e, /expireUserSessionsInDisposableDatabase/,
    "the browser smoke must force an expired session in the disposable database");
  assert.match(workspaceE2e, /refusing to mutate a non-local database/,
    "the expired-session test must refuse non-disposable database hosts");
  assert.match(workspaceE2e, /expired session must not read the customer workspace/);
});

test("personal workspace sends signed-out visitors to the shared account flow", () => {
  assert.match(workspace, /to="\/login"\s+search=\{\{\s*next:\s*"\/favorites"\s*\}\}/);
  assert.match(root, /<CustomerWorkspaceSyncProvider enabled=\{!isAdminPath\}>\s*<Outlet \/>/);
  assert.match(favorites, /<CustomerWorkspaceSyncStatus \/>/);
  assert.ok(favorites.indexOf("<CustomerWorkspaceSyncStatus />") < favorites.indexOf("{planOpen ? ("),
    "workspace sync status and retry must render inside the favorites page content");
  assert.doesNotMatch(workspace, /createPortal\(|document\.getElementById\("customer-workspace-status-slot"\)/,
    "workspace status must render in the owning React tree rather than portaling into hydrated content");
  assert.match(workspace, /CustomerWorkspaceSyncContext\.Provider/);
  assert.match(workspace, /onClick=\{retry\}\s+disabled=\{busy\}/,
    "the in-page retry control must keep the existing single-flight disabled state and retry callback");
  assert.doesNotMatch(siteChrome, /customer-workspace-status-slot/);
});

test("personal workspace syncs changes and prevents data crossing between accounts", () => {
  assert.match(workspace, /hirmand:workspace-changed/);
  assert.match(workspace, /window\.addEventListener\("focus", onFocus\)/);
  assert.match(workspace, /document\.addEventListener\("visibilitychange", onVisibilityChange\)/);
  assert.match(workspace, /ownerId: storedOwner/);
  assert.match(workspace, /currentUserId: user\.id/);
  assert.match(workspace, /WORKSPACE_OWNER_KEY/);
  assert.match(workspace, /getBearerToken\(\)/);
  assert.match(workspace, /Authorization: `Bearer \$\{bearerToken\}`/);
  assert.match(workspace, /WORKSPACE_PENDING_KEY/);
  assert.match(workspace, /activeUserId\.current !== user\.id/);
  assert.match(workspace, /chooseCustomerWorkspaceSync/);
  assert.match(favorites, /hirmand:workspace-changed/);
  assert.match(properties, /hirmand:workspace-changed/);
  assert.match(actions, /hirmand:workspace-changed/);
  assert.match(tracker, /hirmand:workspace-changed/);
  assert.match(detail, /hirmand:workspace-changed/);
  assert.match(workspace, /clearWorkspaceForSignedOutUser\(\{ storage: localStorage, target: window \}\)/);
  assert.match(workspaceGet, /select favorites,favorite_meta/);
  assert.match(workspaceGet, /requireUserIdFromHeaders\(new Headers\(request\.headers\)\)/);
  assert.equal((workspaceGet.match(/requireUserIdFromHeaders\(new Headers\(request\.headers\)\)/g) ?? []).length, 2);
  assert.match(workspaceResponse, /Cache-Control.*private, no-store, max-age=0/);
  assert.match(workspaceResponse, /Vary: "Cookie, Authorization"/);
  assert.match(workspaceGet, /createFileRoute\("\/api\/customer-workspace"\)/);
  assert.doesNotMatch(workspaceGet, /getRequestHeaders\(event\)|setHeader\(event/);
  assert.doesNotMatch(workspaceGet, /defineEventHandler\(|H3Event/,
    "the route must run in TanStack Start's request context for Better Auth cookie middleware");
  assert.equal(existsSync(fileURLToPath(new URL("../server/routes/api/customer-workspace.get.ts", import.meta.url))), false);
  assert.equal(existsSync(fileURLToPath(new URL("../server/routes/api/customer-workspace.post.ts", import.meta.url))), false);
  assert.match(workspaceGet, /ownerId: userId/);
  assert.match(workspacePost, /body\.data\.ownerId !== userId/);
  assert.doesNotMatch(favorites, /import \{ CustomerWorkspaceSync \}/);
  assert.match(verify, /export async function requireUserIdFromHeaders/);
  assert.match(verify, /statusCode: 401, statusMessage: "Unauthorized"/);
});

test("cross-device workspace smoke verifies favorites, metadata, saved searches and history", () => {
  assert.match(workspaceE2e, /device-two-favorite/);
  assert.match(workspaceE2e, /saved on device two/);
  assert.match(workspaceE2e, /device-two-search/);
  assert.match(workspaceE2e, /device-two-recent/);
  assert.match(workspaceE2e, /secondWorkspace\.favoriteMeta/);
  assert.match(workspaceE2e, /secondWorkspace\.recentProperties/);
  assert.match(workspaceE2e, /firstDeviceSyncedWorkspace\.favoriteMeta/);
  assert.match(workspaceE2e, /firstDeviceSyncedWorkspace\.recentProperties/);
});

test("server-side session authorization bypasses Better Auth's cached session cookie", () => {
  const serverSessionCalls = [...verify.matchAll(/auth\.api\.getSession\(\{([\s\S]*?)\}\)/g)];
  assert.equal(serverSessionCalls.length, 2, "both server session resolvers must verify against the database");
  for (const [, options] of serverSessionCalls) {
    assert.match(options, /headers/);
    assert.match(options, /query:\s*\{\s*disableCookieCache:\s*true\s*\}/);
  }
  assert.match(server, /cookieCache:\s*\{\s*enabled:\s*false\s*\}/,
    "ordinary session reads must not accept a revoked session from the signed cookie cache");
});

test("expired-session smoke retains both cookies and uses the authoritative default session read", () => {
  assert.match(workspaceE2e, /cookie\.name === "__Host-grok-auth\.session_token"/);
  assert.match(workspaceE2e, /cookie\.name === "__Host-grok-auth\.session_data"/);
  assert.doesNotMatch(workspaceE2e, /context\.clearCookies\(\)|context\.addCookies\(/,
    "the smoke must preserve the original browser cookies while expiring the database row");
  assert.match(workspaceE2e, /\/api\/auth\/get-session/);
  assert.doesNotMatch(workspaceE2e, /get-session\?disableCookieCache=true/);
  assert.match(workspaceE2e, /expiredSession\?\.user \?\? null, null/);
  assert.match(workspaceE2e, /expiredWorkspaceResponse\.status\(\), 401/);
  assert.match(workspaceE2e, /expiredWorkspaceResponse\.headers\(\)\["cache-control"\]/);
});
