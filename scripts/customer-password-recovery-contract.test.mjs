import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const authServer = read("src/lib/auth/server.ts");
const login = read("src/routes/login.tsx");
const favorites = read("src/routes/favorites.tsx");
const migration = read("migrations/0101_auth_rate_limit.sql");
const migrationPlan = read("scripts/migration-plan.mjs");
const mailer = read("src/lib/auth/password-reset-email.server.ts");
const e2e = read("scripts/password-reset-e2e-smoke.mjs");
const verify = read(".github/workflows/verify.yml");
const deploy = read(".github/workflows/deploy-liara.yml");

test("Better Auth uses a one-hour, one-use recovery token and revokes sessions", () => {
  assert.match(authServer, /resetPasswordTokenExpiresIn:\s*60\s*\*\s*60/);
  assert.match(authServer, /revokeSessionsOnPasswordReset:\s*true/);
  assert.match(authServer, /cookieCache:\s*\{\s*enabled:\s*false\s*\}/,
    "revoked sessions must not remain valid in another device's signed cookie cache");
  assert.match(authServer, /"reset-password:":\s*"hashed"/);
  assert.match(authServer, /minPasswordLength:\s*8/);
  assert.match(authServer, /maxPasswordLength:\s*128/);
  assert.match(authServer, /sendResetPassword:\s*\(\{ user, url \}/);
  assert.match(authServer, /void sendPasswordResetEmail\(/);
  assert.doesNotMatch(authServer, /await sendPasswordResetEmail\(/);
});

test("password recovery has persistent per-endpoint rate limits and a compatible database model", () => {
  assert.match(authServer, /rateLimit:\s*\{\s*storage:\s*"database"/s);
  assert.match(authServer, /"\/request-password-reset":\s*\{ window: 60, max: 3 \}/);
  assert.match(authServer, /"\/reset-password":\s*\{ window: 60, max: 5 \}/);
  assert.match(migration, /"key" text not null unique/i);
  assert.match(migration, /"count" integer not null/i);
  assert.match(migration, /"lastRequest" double precision not null/i);
  assert.match(migrationPlan, /"0101_auth_rate_limit\.sql"/);
  assert.match(deploy, /0059_customer_workspace_revision\.sql, 0101_auth_rate_limit\.sql/);
});

test("customer login exposes generic recovery and token redemption without leaking email existence", () => {
  assert.match(login, /authClient\.requestPasswordReset/);
  assert.match(login, /authClient\.resetPassword/);
  assert.match(login, /اگر این ایمیل در هیرمند حساب کاربری داشته باشد/);
  assert.match(login, /نامعتبر، منقضی یا قبلاً استفاده شده است/);
  assert.match(login, /window\.location\.replace\("\/login\?reset=success"\)/);
});

test("customer password changes require the current password and revoke other sessions", () => {
  assert.match(favorites, /authClient\.changePassword\(\{/);
  assert.match(favorites, /currentPassword,/);
  assert.match(favorites, /revokeOtherSessions:\s*true/);
  assert.match(favorites, /رمز عبور فعلی درست نیست/);
});

test("Resend credentials stay server-only and test overrides are loopback-only CI", () => {
  assert.match(mailer, /process\.env\.RESEND_API_KEY/);
  assert.match(mailer, /https:\/\/api\.resend\.com\/emails/);
  assert.match(mailer, /process\.env\.CI !== "true" \|\| !loopback/);
  assert.match(mailer, /Authorization: `Bearer \$\{apiKey\}`/);
  assert.match(mailer, /response\.status/);
});

test("Verify runs a real recovery lifecycle against disposable PostgreSQL and a local mail mock", () => {
  assert.match(verify, /node scripts\/password-reset-mail-mock\.mjs/);
  assert.match(verify, /BETTER_AUTH_URL=http:\/\/localhost:8081/);
  assert.match(verify, /PASSWORD_RESET_SMOKE_URL=http:\/\/localhost:8081 node scripts\/password-reset-e2e-smoke\.mjs/);
  assert.match(e2e, /refusing to mutate a non-local database/);
  for (const behavior of [
    "unknown email must receive the same successful response",
    "the recovery token must be persisted in the disposable database",
    "weak passwords must be rejected before the token is consumed",
    "a consumed recovery token must not be reusable",
    "password reset token redemption must be rate limited",
    "password reset must revoke every previous session",
    "an incorrect current password must not change the credential",
    "changePassword must revoke other active sessions",
  ]) assert.ok(e2e.includes(behavior), `E2E must cover: ${behavior}`);
  assert.doesNotMatch(e2e, /get-session\?disableCookieCache=true/,
    "cross-device revocation must be tested through the default session endpoint behavior");
  assert.match(e2e, /headers:\s*\{\s*cookie:\s*`\$\{secondSessionTokenCookieBeforeReset\.name\}/,
    "reset revocation must send the second browser's original cookie even if the server clears it in its response");
  assert.match(e2e, /headers:\s*\{\s*cookie:\s*`\$\{otherSessionTokenCookieBeforeChange\.name\}/,
    "password-change revocation must send the other browser's original cookie even if the server clears it in its response");
  assert.match(e2e, /typeof session\.status === "function" \? session\.status\(\) : session\.status/,
    "the smoke must read status consistently from Playwright and native Fetch responses");
});
