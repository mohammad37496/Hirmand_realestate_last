import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

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
const client = source("../src/lib/auth/client.ts");
const server = source("../src/lib/auth/server.ts");
const workspaceGet = source("../server/routes/api/customer-workspace.get.ts");
const workspacePost = source("../server/routes/api/customer-workspace.post.ts");
const verify = source("../src/lib/auth/verify.server.ts");

test("customer accounts support email registration and sign-in on Better Auth", () => {
  assert.match(authConfig, /emailAndPasswordEnabled\s*=\s*true/);
  assert.match(login, /authClient\.signUp\.email/);
  assert.match(login, /authClient\.signIn\.email/);
  assert.match(login, /<Link to=\{next\}/);
  assert.match(client, /VITE_GROK_OAUTH_ENABLED/);
  assert.doesNotMatch(client, /runPreSignInSignOut\(\{[^}]*clearWorkspace/);
  assert.match(server, /process\.env\.NODE_ENV === "production" \? \[\] : LOCAL_DEV_ORIGINS/);
  assert.match(server, /allowPreviewOAuth/);
  assert.match(login, /GROK_PROVIDERS\.map/);
  assert.match(login, /!mounted \|\| isPending/);
});

test("login return path is restricted to same-origin absolute paths", () => {
  assert.match(login, /search\.next\.startsWith\("\/"\)/);
  assert.match(login, /!search\.next\.startsWith\("\/\/"\)/);
});

test("site header exposes account access on desktop and mobile navigation", () => {
  assert.match(header, /<CustomerAccountAccess\s*\/>/);
  assert.match(header, /<CustomerAccountAccess compact\s*\/>/);
  assert.match(header, /to="\/login"/);
  assert.match(header, /if \(!mounted \|\| !authEnabled \|\| isPending\) return null/);
});

test("personal workspace sends signed-out visitors to the shared account flow", () => {
  assert.match(workspace, /to="\/login"\s+search=\{\{\s*next:\s*"\/favorites"\s*\}\}/);
  assert.match(root, /<CustomerWorkspaceSync enabled=\{!isAdminPath\} showStatus=\{pathname === "\/favorites"\}\s*\/>/);
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
  assert.match(workspace, /WORKSPACE_OWNER_KEY, WORKSPACE_PENDING_KEY/);
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
