#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { chromium } from "playwright";
import pg from "pg";

const baseUrl = process.env.PASSWORD_RESET_SMOKE_URL || "http://127.0.0.1:8081";
const origin = new URL(baseUrl).origin;
const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, "password-reset smoke requires the disposable Verify DATABASE_URL");
const databaseHost = new URL(databaseUrl).hostname;
assert.ok(["localhost", "127.0.0.1", "::1"].includes(databaseHost), `refusing to mutate a non-local database: ${databaseHost}`);

const email = `password-reset-${randomUUID()}@example.com`;
const oldPassword = `Hirmand-${randomUUID()}-A9!`;
const resetPassword = `Reset-${randomUUID()}-B7!`;
const changedPassword = `Changed-${randomUUID()}-C8!`;
const unknownEmail = `unknown-${randomUUID()}@example.com`;
const mailMockUrl = "http://127.0.0.1:4321";
const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const errors = [];

async function mailState() {
  const response = await fetch(`${mailMockUrl}/last`);
  assert.equal(response.status, 200);
  return response.json();
}

async function waitForMailCount(expected) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const state = await mailState();
    if (state.count >= expected) return state;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`timed out waiting for ${expected} mocked reset emails`);
}

async function extractResetUrl() {
  const state = await mailState();
  assert.ok(state.message?.text, "Resend mock should capture a plain-text recovery message");
  const match = state.message.text.match(/https?:\/\/[^\s]+/);
  assert.ok(match, "recovery email should contain the Better Auth reset URL");
  return match[0].replace(/[),.]+$/, "");
}

function storedResetIdentifier(token) {
  return createHash("sha256").update(`reset-password:${token}`).digest("base64url");
}

async function openLogin(context) {
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(new URL("/login", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  return page;
}

async function signIn(page, password, expectedStatus = 200) {
  await page.goto(new URL("/login", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await page.locator(".customer-login-form input[type=email]").fill(email);
  await page.locator(".customer-login-form input[type=password]").fill(password);
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/auth/sign-in/email"));
  await page.getByRole("button", { name: "ورود به حساب", exact: true }).click();
  const response = await responsePromise;
  assert.equal(response.status(), expectedStatus, `sign-in returned ${response.status()}`);
  if (expectedStatus === 200) await page.waitForURL((url) => url.pathname === "/favorites");
  return response;
}

try {
  const signupContext = await browser.newContext();
  const signupPage = await openLogin(signupContext);
  await signupPage.getByRole("tab", { name: "ساخت حساب", exact: true }).click();
  await signupPage.locator(".customer-login-form input[autocomplete=name]").fill("Password Reset Smoke");
  await signupPage.locator(".customer-login-form input[type=email]").fill(email);
  await signupPage.locator(".customer-login-form input[type=password]").fill(oldPassword);
  const signupResponsePromise = signupPage.waitForResponse((response) => response.url().endsWith("/api/auth/sign-up/email"));
  await signupPage.getByRole("button", { name: "ساخت حساب و ورود", exact: true }).click();
  const signupResponse = await signupResponsePromise;
  assert.equal(signupResponse.status(), 200, "test account should be created in disposable PostgreSQL");
  await signupPage.waitForURL((url) => url.pathname === "/favorites");

  const secondSessionContext = await browser.newContext();
  const secondSessionPage = await openLogin(secondSessionContext);
  await signIn(secondSessionPage, oldPassword);
  const secondSessionCookiesBeforeReset = await secondSessionContext.cookies(baseUrl);
  const secondSessionTokenCookieBeforeReset = secondSessionCookiesBeforeReset.find((cookie) => cookie.name.endsWith("session_token"));
  assert.ok(secondSessionTokenCookieBeforeReset, "the second browser must retain its original HttpOnly session token");
  assert.equal(
    secondSessionCookiesBeforeReset.some((cookie) => cookie.name.endsWith("session_data")),
    false,
    "session cookie caching must be disabled so a signed snapshot cannot outlive database revocation",
  );

  const recoveryContext = await browser.newContext();
  const recoveryPage = await openLogin(recoveryContext);
  await recoveryPage.getByRole("button", { name: "رمز عبور را فراموش کرده‌اید؟", exact: true }).click();
  await recoveryPage.locator(".customer-login-form input[type=email]").fill(unknownEmail);
  const beforeUnknown = await mailState();
  const unknownResponsePromise = recoveryPage.waitForResponse((response) => response.url().endsWith("/api/auth/request-password-reset"));
  await recoveryPage.getByRole("button", { name: "ارسال پیوند بازیابی", exact: true }).click();
  const unknownResponse = await unknownResponsePromise;
  assert.equal(unknownResponse.status(), 200, "unknown email must receive the same successful response");
  assert.match(await recoveryPage.locator('[role="status"]').innerText(), /اگر این ایمیل/);
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal((await mailState()).count, beforeUnknown.count, "unknown email must not send a message");

  // Issue a link and expire its persisted verification row before following it.
  await recoveryPage.locator(".customer-login-form input[type=email]").fill(email);
  const expiredRequestPromise = recoveryPage.waitForResponse((response) => response.url().endsWith("/api/auth/request-password-reset"));
  await recoveryPage.getByRole("button", { name: "ارسال پیوند بازیابی", exact: true }).click();
  const expiredRequest = await expiredRequestPromise;
  assert.equal(expiredRequest.status(), 200);
  await waitForMailCount(beforeUnknown.count + 1);
  const expiredUrl = await extractResetUrl();
  const expiredToken = new URL(expiredUrl).pathname.split("/").at(-1);
  assert.ok(expiredToken);
  const expiredIdentifier = storedResetIdentifier(expiredToken);
  const expiredRow = await pool.query(
    'update "verification" set "expiresAt" = current_timestamp - interval \'1 minute\' where "identifier" = $1 returning id',
    [expiredIdentifier],
  );
  assert.equal(expiredRow.rowCount, 1, "the recovery token must be persisted in the disposable database");
  await recoveryPage.goto(expiredUrl, { waitUntil: "domcontentloaded" });
  await recoveryPage.getByRole("heading", { name: "تعیین رمز عبور جدید" }).waitFor();
  assert.match(await recoveryPage.locator('[role="alert"]').innerText(), /نامعتبر یا منقضی/);

  // A fresh link works once, changes the credential, and revokes both sessions.
  await recoveryPage.getByRole("button", { name: "درخواست پیوند بازیابی تازه", exact: true }).click();
  await recoveryPage.locator(".customer-login-form input[type=email]").fill(email);
  const validRequestPromise = recoveryPage.waitForResponse((response) => response.url().endsWith("/api/auth/request-password-reset"));
  await recoveryPage.getByRole("button", { name: "ارسال پیوند بازیابی", exact: true }).click();
  const validRequest = await validRequestPromise;
  assert.equal(validRequest.status(), 200);
  await waitForMailCount(beforeUnknown.count + 2);
  const validUrl = await extractResetUrl();
  const validToken = new URL(validUrl).pathname.split("/").at(-1);
  assert.ok(validToken);
  const validIdentifier = storedResetIdentifier(validToken);
  const storedToken = await pool.query('select "identifier" from "verification" where "identifier" = $1', [validIdentifier]);
  assert.equal(storedToken.rowCount, 1, "the database must store a hash of the reset token, not the bearer token itself");
  assert.notEqual(validIdentifier, `reset-password:${validToken}`);
  // All three allowed request slots (unknown + expired + valid) were used
  // above. Assert the fourth immediately so the one-minute window cannot
  // expire while the remainder of the browser lifecycle runs.
  const requestRateLimit = await recoveryPage.request.post(new URL("/api/auth/request-password-reset", baseUrl).toString(), {
    headers: { origin, "content-type": "application/json" },
    data: JSON.stringify({ email: unknownEmail, redirectTo: `${origin}/login` }),
  });
  assert.equal(requestRateLimit.status(), 429, "password reset email requests must be rate limited");
  // Follow the link in a browser that already has an active session. Reset
  // must revoke that session and clear its cookie cache as well.
  await signupPage.goto(validUrl, { waitUntil: "domcontentloaded" });
  await signupPage.getByRole("heading", { name: "تعیین رمز عبور جدید" }).waitFor();

  const weakPasswordResponse = await signupPage.request.post(new URL("/api/auth/reset-password", baseUrl).toString(), {
    headers: { origin },
    data: { token: validToken, newPassword: "short" },
  });
  assert.equal(weakPasswordResponse.status(), 400, "weak passwords must be rejected before the token is consumed");

  await signupPage.locator(".customer-login-form input").nth(0).fill(resetPassword);
  await signupPage.locator(".customer-login-form input").nth(1).fill("not-the-same");
  await signupPage.getByRole("button", { name: "ثبت رمز جدید", exact: true }).click();
  assert.match(await signupPage.locator('[role="alert"]').innerText(), /یکسان نیست/);

  await signupPage.locator(".customer-login-form input").nth(1).fill(resetPassword);
  const resetResponsePromise = signupPage.waitForResponse((response) => response.url().endsWith("/api/auth/reset-password"));
  await signupPage.getByRole("button", { name: "ثبت رمز جدید", exact: true }).click();
  const resetResponse = await resetResponsePromise;
  assert.equal(resetResponse.status(), 200, "valid recovery token should update the password");
  await signupPage.getByRole("heading", { name: "به هیرمند خوش آمدید" }).waitFor();
  assert.match(await signupPage.locator('[role="status"]').innerText(), /با موفقیت تغییر کرد/);

  const reusedTokenResponse = await signupPage.request.post(new URL("/api/auth/reset-password", baseUrl).toString(), {
    headers: { origin },
    data: { token: validToken, newPassword: `Reuse-${randomUUID()}-D9!` },
  });
  assert.equal(reusedTokenResponse.status(), 400, "a consumed recovery token must not be reusable");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const invalid = await signupPage.request.post(new URL("/api/auth/reset-password", baseUrl).toString(), {
      headers: { origin },
      data: { token: `invalid-${randomUUID()}`, newPassword: `Invalid-${randomUUID()}-E1!` },
    });
    assert.equal(invalid.status(), 400);
  }
  const resetRateLimit = await signupPage.request.post(new URL("/api/auth/reset-password", baseUrl).toString(), {
    headers: { origin },
    data: { token: `invalid-${randomUUID()}`, newPassword: `Invalid-${randomUUID()}-E1!` },
  });
  assert.equal(resetRateLimit.status(), 429, "password reset token redemption must be rate limited");

  for (const context of [signupContext, secondSessionContext]) {
    const page = context === signupContext ? signupPage : secondSessionPage;
    const session = context === secondSessionContext
      ? await fetch(new URL("/api/auth/get-session", baseUrl), {
          headers: { cookie: `${secondSessionTokenCookieBeforeReset.name}=${secondSessionTokenCookieBeforeReset.value}` },
        })
      : await page.request.get(new URL("/api/auth/get-session", baseUrl).toString());
    assert.equal(session.status(), 200);
    assert.equal((await session.json())?.user ?? null, null, "password reset must revoke every previous session");
  }

  // The old password is invalid; the new password works. Respect the default
  // Better Auth sign-in limit between separate bursts.
  await new Promise((resolve) => setTimeout(resolve, 10_500));
  await signIn(recoveryPage, oldPassword, 401);
  await signIn(recoveryPage, resetPassword);
  await new Promise((resolve) => setTimeout(resolve, 10_500));
  const otherSessionContext = await browser.newContext();
  const otherSessionPage = await openLogin(otherSessionContext);
  await signIn(otherSessionPage, resetPassword);
  const otherSessionCookiesBeforeChange = await otherSessionContext.cookies(baseUrl);
  const otherSessionTokenCookieBeforeChange = otherSessionCookiesBeforeChange.find((cookie) => cookie.name.endsWith("session_token"));
  assert.ok(otherSessionTokenCookieBeforeChange, "the password-change browser must retain its original HttpOnly session token");
  assert.equal(
    otherSessionCookiesBeforeChange.some((cookie) => cookie.name.endsWith("session_data")),
    false,
    "password-change sessions must not receive a signed session snapshot cookie",
  );
  const passwordChangePage = recoveryPage;
  await passwordChangePage.goto(new URL("/favorites", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await passwordChangePage.locator(".customer-password-panel").waitFor();
  const passwordInputs = passwordChangePage.locator(".customer-password-panel input");
  await passwordInputs.nth(0).fill("incorrect-current-password");
  await passwordInputs.nth(1).fill(changedPassword);
  await passwordInputs.nth(2).fill(changedPassword);
  const wrongChangePromise = passwordChangePage.waitForResponse((response) => response.url().endsWith("/api/auth/change-password"));
  await passwordChangePage.getByRole("button", { name: "ذخیره رمز جدید", exact: true }).click();
  const wrongChange = await wrongChangePromise;
  assert.equal(wrongChange.status(), 400, "an incorrect current password must not change the credential");
  assert.match(await passwordChangePage.locator('[role="alert"]').innerText(), /رمز عبور فعلی درست نیست/);

  await passwordInputs.nth(0).fill(resetPassword);
  const goodChangePromise = passwordChangePage.waitForResponse((response) => response.url().endsWith("/api/auth/change-password"));
  await passwordChangePage.getByRole("button", { name: "ذخیره رمز جدید", exact: true }).click();
  const goodChange = await goodChangePromise;
  assert.equal(goodChange.status(), 200, "the current password should permit a password change");
  assert.match(await passwordChangePage.locator('.customer-password-panel [role="status"]').innerText(), /نشست‌های دیگر/);
  const otherSession = await fetch(new URL("/api/auth/get-session", baseUrl), {
    headers: { cookie: `${otherSessionTokenCookieBeforeChange.name}=${otherSessionTokenCookieBeforeChange.value}` },
  });
  assert.equal((await otherSession.json())?.user ?? null, null, "changePassword must revoke other active sessions");

  await passwordChangePage.request.post(new URL("/api/auth/sign-out", baseUrl).toString(), { headers: { origin }, data: {} });
  // Better Auth's default sign-in guard is 3 attempts per 10 seconds.
  await new Promise((resolve) => setTimeout(resolve, 10_500));
  await signIn(passwordChangePage, changedPassword);

  assert.deepEqual(errors, [], "password recovery and change pages must not throw browser errors");
  console.log(JSON.stringify({
    unknownEmail: "generic-success-no-email",
    emailDelivery: "mocked-resend-message-received",
    expiredToken: "rejected",
    weakPassword: "rejected-with-token-preserved",
    mismatchedConfirmation: "rejected-client-side",
    validReset: "passed",
    tokenReuse: "rejected",
    resetTokenRateLimit: resetRateLimit.status(),
    resetEmailRateLimit: requestRateLimit.status(),
    resetRevokedSessions: "passed",
    wrongCurrentPassword: "rejected",
    validPasswordChange: "passed",
    passwordChangeRevokedOtherSessions: "passed",
    newPasswordLogin: "passed",
    browserErrors: errors,
  }, null, 2));

  await otherSessionContext.close();
  await secondSessionContext.close();
  await signupContext.close();
  await recoveryContext.close();
} finally {
  await pool.end();
  await browser.close();
}
