import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
const workspaceGet = source("../server/routes/api/customer-workspace.get.ts");
const workspacePost = source("../server/routes/api/customer-workspace.post.ts");
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
  assert.match(workspaceGet, /requireUserIdFromHeaders\(new Headers\(getRequestHeaders\(event\)\)\)/);
  assert.match(workspacePost, /requireUserIdFromHeaders\(new Headers\(getRequestHeaders\(event\)\)\)/);
  assert.match(workspaceGet, /setHeader\(event, "Cache-Control", "private, no-store, max-age=0"\)/);
  assert.match(workspaceGet, /setHeader\(event, "Vary", "Cookie, Authorization"\)/);
  assert.match(workspacePost, /setHeader\(event, "Cache-Control", "private, no-store, max-age=0"\)/);
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
