#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import pg from "pg";

const baseUrl = process.env.CUSTOMER_AUTH_SMOKE_URL || "http://127.0.0.1:3018";
const origin = new URL(baseUrl).origin;
const password = `Hirmand-${randomUUID()}-A9!`;
const email = `customer-auth-${randomUUID()}@example.com`;
const secondEmail = `customer-auth-${randomUUID()}@example.com`;

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const errors = [];

async function assertHeaderAccountAccess(page, signedIn) {
  const desktopAccess = page.locator(".nav-actions > .customer-account-access");
  await desktopAccess.waitFor({ state: "visible" });
  if (signedIn) {
    assert.equal(await desktopAccess.locator('a[aria-label="فضای شخصی من"]').isVisible(), true);
    assert.equal(await desktopAccess.locator('button[aria-label="خروج از حساب"]').isVisible(), true);
  } else {
    assert.match(await desktopAccess.innerText(), /ورود \/ ثبت‌نام/);
  }

  await page.setViewportSize({ width: 320, height: 800 });
  const menuToggle = page.locator(".menu-toggle");
  await menuToggle.waitFor({ state: "visible" });
  await menuToggle.click();
  const mobileAccess = page.locator(".mobile-menu.is-open .customer-account-access.is-compact");
  await mobileAccess.waitFor({ state: "visible" });
  if (signedIn) {
    assert.equal(await mobileAccess.locator('a[aria-label="فضای شخصی من"]').isVisible(), true);
    assert.equal(await mobileAccess.locator('button[aria-label="خروج از حساب"]').isVisible(), true);
  } else {
    assert.match(await mobileAccess.innerText(), /ورود \/ ثبت‌نام/);
  }
  await menuToggle.click();
  await page.setViewportSize({ width: 1280, height: 800 });
}

async function expireUserSessionsInDisposableDatabase(userId, context) {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, "expired-session smoke requires the disposable Verify DATABASE_URL");
  const databaseHost = new URL(databaseUrl).hostname;
  assert.ok(
    ["localhost", "127.0.0.1", "::1"].includes(databaseHost),
    `refusing to mutate a non-local database during auth smoke: ${databaseHost}`,
  );

  const cookies = await context.cookies(baseUrl);
  const sessionTokenCookie = cookies.find((cookie) => cookie.name === "__Host-grok-auth.session_token");
  const sessionDataCookie = cookies.find((cookie) => cookie.name === "__Host-grok-auth.session_data");
  assert.ok(sessionTokenCookie, "the signed-in browser must have a Better Auth session token cookie");
  assert.ok(sessionDataCookie, "the signed-in browser must retain its Better Auth cached session cookie");

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const expired = await pool.query(
      'update "session" set "expiresAt" = current_timestamp - interval \'1 minute\' where "userId" = $1 returning id',
      [userId],
    );
    assert.ok(expired.rowCount > 0, "the disposable database should contain the signed-in session");
  } finally {
    await pool.end();
  }
}

async function signUp(context, address, displayName, seedGuestWorkspace = false) {
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  const sessionCheck = page.waitForResponse((response) =>
    response.url().includes("/api/auth/get-session"),
  );
  await page.goto(new URL("/login?next=%2F", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await sessionCheck;
  if (seedGuestWorkspace) await assertHeaderAccountAccess(page, false);
  await page.getByRole("tab", { name: "ساخت حساب", exact: true }).click();
  await page.locator(".customer-login-form input[autocomplete=name]").fill(displayName);
  await page.locator(".customer-login-form input[type=email]").fill(address);
  await page.locator(".customer-login-form input[type=password]").fill(password);
  if (seedGuestWorkspace) {
    await page.locator(".customer-login-form").evaluate(() => {
      localStorage.setItem("hirmand-favorite-properties", JSON.stringify(["guest-favorite"]));
      localStorage.setItem("hirmand-favorite-meta-v1", JSON.stringify({ "guest-favorite": { note: "saved before sign-up" } }));
      localStorage.setItem("hirmand-saved-searches", JSON.stringify([
        { id: "guest-search", name: "Guest search", params: "city=isfahan", alerts: false },
      ]));
      localStorage.setItem("hirmand-recent-properties", JSON.stringify(["guest-recent"]));
    });
  }
  const signUpResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/auth/sign-up/email"),
  );
  await page.getByRole("button", { name: "ساخت حساب و ورود", exact: true }).click();
  const signUpResponse = await signUpResponsePromise;
  const signUpPayload = await signUpResponse.json().catch(() => null);
  assert.equal(signUpResponse.status(), 200, `email sign-up failed: ${JSON.stringify(signUpPayload)}`);
  await page.waitForURL((url) => url.pathname === "/");
  await page.waitForTimeout(800);
  return page;
}

try {
  const firstContext = await browser.newContext();
  const firstPage = await signUp(firstContext, email, "Auth Smoke One", true);
  await assertHeaderAccountAccess(firstPage, true);
  const firstSessionResponse = await firstPage.request.get(new URL("/api/auth/get-session", baseUrl).toString());
  assert.equal(firstSessionResponse.status(), 200);
  const firstSession = await firstSessionResponse.json();
  assert.ok(firstSession?.user?.id, "sign-up should establish a real Better Auth session");

  const firstWorkspaceResponse = await firstPage.request.get(new URL("/api/customer-workspace", baseUrl).toString());
  assert.equal(firstWorkspaceResponse.status(), 200);
  let firstWorkspace = await firstWorkspaceResponse.json();
  if (!firstWorkspace.favorites.includes("guest-favorite")) {
    const syncResponsePromise = firstPage.waitForResponse((response) =>
      response.url().endsWith("/api/customer-workspace") && response.request().method() === "POST",
    );
    await firstPage.evaluate(() => window.dispatchEvent(new Event("hirmand:workspace-changed")));
    const syncResponse = await syncResponsePromise;
    assert.equal(syncResponse.status(), 200, "first sign-in should merge and persist the guest workspace");
    const refreshedWorkspace = await firstPage.request.get(new URL("/api/customer-workspace", baseUrl).toString());
    firstWorkspace = await refreshedWorkspace.json();
  }
  assert.equal(firstWorkspace.ownerId, firstSession.user.id);
  assert.deepEqual(firstWorkspace.favorites, ["guest-favorite"]);
  assert.equal(firstWorkspace.favoriteMeta["guest-favorite"].note, "saved before sign-up");
  assert.equal(firstWorkspace.savedSearches[0].id, "guest-search");
  assert.deepEqual(firstWorkspace.recentProperties, ["guest-recent"]);

  const foreignOwnerWrite = await firstPage.request.post(new URL("/api/customer-workspace", baseUrl).toString(), {
    headers: { origin },
    data: { ...firstWorkspace, ownerId: "another-user" },
  });
  assert.equal(foreignOwnerWrite.status(), 409, "a client cannot write another account's workspace");

  const crossOriginWrite = await firstPage.request.post(new URL("/api/customer-workspace", baseUrl).toString(), {
    headers: { origin: "https://attacker.example" },
    data: { ...firstWorkspace, ownerId: firstSession.user.id },
  });
  assert.equal(crossOriginWrite.status(), 403, "workspace writes must reject cross-origin requests");

  const secondContext = await browser.newContext();
  const secondPage = await signUp(secondContext, secondEmail, "Auth Smoke Two");
  const secondSessionResponse = await secondPage.request.get(new URL("/api/auth/get-session", baseUrl).toString());
  const secondSession = await secondSessionResponse.json();
  assert.ok(secondSession?.user?.id);
  assert.notEqual(secondSession.user.id, firstSession.user.id);
  const secondWorkspaceResponse = await secondPage.request.get(new URL("/api/customer-workspace", baseUrl).toString());
  assert.equal(secondWorkspaceResponse.status(), 200);
  const secondWorkspace = await secondWorkspaceResponse.json();
  assert.equal(secondWorkspace.ownerId, secondSession.user.id);
  assert.deepEqual(secondWorkspace.favorites, [], "a second account must not see the first account's favorites");
  assert.deepEqual(secondWorkspace.favoriteMeta, {}, "a second account must not see the first account's favorite metadata");
  assert.deepEqual(secondWorkspace.savedSearches, []);
  assert.deepEqual(secondWorkspace.recentProperties, [], "a second account must not see the first account's browsing history");

  const signOutResponse = await firstPage.request.post(new URL("/api/auth/sign-out", baseUrl).toString(), {
    headers: { origin },
    data: {},
  });
  assert.equal(signOutResponse.status(), 200, "the server should confirm sign-out");
  const signedOutWorkspace = await firstPage.request.get(new URL("/api/customer-workspace", baseUrl).toString());
  assert.equal(signedOutWorkspace.status(), 401, "a signed-out session must no longer access its workspace");

  const loginSessionCheck = firstPage.waitForResponse((response) =>
    response.url().includes("/api/auth/get-session"),
  );
  await firstPage.goto(new URL("/login?next=%2F", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await loginSessionCheck;
  await firstPage.locator(".customer-login-form input[type=email]").fill(email);
  await firstPage.locator(".customer-login-form input[type=password]").fill(password);
  const signInResponsePromise = firstPage.waitForResponse((response) =>
    response.url().endsWith("/api/auth/sign-in/email"),
  );
  await firstPage.getByRole("button", { name: "ورود به حساب", exact: true }).click();
  const signInResponse = await signInResponsePromise;
  assert.equal(signInResponse.status(), 200, "an existing account should sign in with its password");
  await firstPage.waitForURL((url) => url.pathname === "/");
  const resumedSessionResponse = await firstPage.request.get(new URL("/api/auth/get-session", baseUrl).toString());
  const resumedSession = await resumedSessionResponse.json();
  assert.equal(resumedSession?.user?.id, firstSession.user.id, "sign-in should restore the same account");
  const restoredWorkspaceResponse = await firstPage.request.get(new URL("/api/customer-workspace", baseUrl).toString());
  assert.equal(restoredWorkspaceResponse.status(), 200);
  const restoredWorkspace = await restoredWorkspaceResponse.json();
  assert.deepEqual(restoredWorkspace.favorites, ["guest-favorite"], "server workspace must survive sign-out and sign-in");

  // A second isolated browser context represents another device for the SAME
  // account. A local edit there must reach the first device on its next focus.
  const secondDeviceContext = await browser.newContext();
  const secondDevicePage = await secondDeviceContext.newPage();
  secondDevicePage.on("pageerror", (error) => errors.push(error.message));
  const secondDeviceSessionCheck = secondDevicePage.waitForResponse((response) =>
    response.url().includes("/api/auth/get-session"),
  );
  await secondDevicePage.goto(new URL("/login?next=%2F", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await secondDeviceSessionCheck;
  await secondDevicePage.locator(".customer-login-form input[type=email]").fill(email);
  await secondDevicePage.locator(".customer-login-form input[type=password]").fill(password);
  const secondDeviceSignInPromise = secondDevicePage.waitForResponse((response) =>
    response.url().endsWith("/api/auth/sign-in/email"),
  );
  await secondDevicePage.getByRole("button", { name: "ورود به حساب", exact: true }).click();
  const secondDeviceSignIn = await secondDeviceSignInPromise;
  assert.equal(secondDeviceSignIn.status(), 200, "the same account should sign in from a second device");
  await secondDevicePage.waitForURL((url) => url.pathname === "/");
  const secondDeviceSessionResponse = await secondDevicePage.request.get(new URL("/api/auth/get-session", baseUrl).toString());
  const secondDeviceSession = await secondDeviceSessionResponse.json();
  assert.equal(secondDeviceSession?.user?.id, firstSession.user.id, "both devices should resolve to the same account");
  await secondDevicePage.waitForFunction(() =>
    localStorage.getItem("hirmand-workspace-owner-v1") !== null &&
    localStorage.getItem("hirmand-workspace-pending-v1") === null,
  );
  const secondDeviceInitialWorkspace = await secondDevicePage.request.get(new URL("/api/customer-workspace", baseUrl).toString());
  assert.equal(secondDeviceInitialWorkspace.status(), 200);
  assert.deepEqual((await secondDeviceInitialWorkspace.json()).favorites, ["guest-favorite"]);

  const secondDeviceSyncPromise = secondDevicePage.waitForResponse((response) =>
    response.url().endsWith("/api/customer-workspace") && response.request().method() === "POST",
  );
  await secondDevicePage.evaluate(() => {
    const favorites = JSON.parse(localStorage.getItem("hirmand-favorite-properties") || "[]");
    localStorage.setItem("hirmand-favorite-properties", JSON.stringify([...new Set([...favorites, "device-two-favorite"])]));
    const favoriteMeta = JSON.parse(localStorage.getItem("hirmand-favorite-meta-v1") || "{}");
    localStorage.setItem("hirmand-favorite-meta-v1", JSON.stringify({
      ...favoriteMeta,
      "device-two-favorite": { note: "saved on device two" },
    }));
    const searches = JSON.parse(localStorage.getItem("hirmand-saved-searches") || "[]");
    localStorage.setItem("hirmand-saved-searches", JSON.stringify([
      ...searches,
      { id: "device-two-search", name: "Device two", params: "city=isfahan", alerts: false },
    ]));
    const recent = JSON.parse(localStorage.getItem("hirmand-recent-properties") || "[]");
    localStorage.setItem("hirmand-recent-properties", JSON.stringify([...new Set(["device-two-recent", ...recent])]));
    window.dispatchEvent(new Event("hirmand:workspace-changed"));
  });
  const secondDeviceSync = await secondDeviceSyncPromise;
  assert.equal(secondDeviceSync.status(), 200, "the second device should persist its workspace edit");

  const firstDevicePullPromise = firstPage.waitForResponse((response) =>
    response.url().endsWith("/api/customer-workspace") && response.request().method() === "GET",
  );
  await firstPage.evaluate(() => window.dispatchEvent(new Event("focus")));
  const firstDevicePull = await firstDevicePullPromise;
  assert.equal(firstDevicePull.status(), 200, "the first device should fetch the latest remote workspace on focus");
  await firstPage.waitForFunction(() => {
    const favorites = JSON.parse(localStorage.getItem("hirmand-favorite-properties") || "[]");
    const searches = JSON.parse(localStorage.getItem("hirmand-saved-searches") || "[]");
    const recent = JSON.parse(localStorage.getItem("hirmand-recent-properties") || "[]");
    const favoriteMeta = JSON.parse(localStorage.getItem("hirmand-favorite-meta-v1") || "{}");
    return favorites.includes("device-two-favorite") &&
      searches.some((item) => item.id === "device-two-search") &&
      recent.includes("device-two-recent") &&
      favoriteMeta["device-two-favorite"]?.note === "saved on device two";
  });
  const firstDeviceAfterSync = await firstPage.request.get(new URL("/api/customer-workspace", baseUrl).toString());
  const firstDeviceSyncedWorkspace = await firstDeviceAfterSync.json();
  assert.ok(firstDeviceSyncedWorkspace.favorites.includes("device-two-favorite"));
  assert.equal(firstDeviceSyncedWorkspace.favoriteMeta["device-two-favorite"].note, "saved on device two");
  assert.ok(firstDeviceSyncedWorkspace.savedSearches.some((item) => item.id === "device-two-search"));
  assert.ok(firstDeviceSyncedWorkspace.recentProperties.includes("device-two-recent"));

  await expireUserSessionsInDisposableDatabase(firstSession.user.id, firstContext);
  const expiredSessionResponse = await firstPage.request.get(
    new URL("/api/auth/get-session", baseUrl).toString(),
  );
  assert.equal(expiredSessionResponse.status(), 200);
  const expiredSession = await expiredSessionResponse.json();
  assert.equal(expiredSession?.user ?? null, null, "Better Auth must reject a session whose database expiry has passed");
  const expiredWorkspaceResponse = await firstPage.request.get(new URL("/api/customer-workspace", baseUrl).toString());
  assert.equal(expiredWorkspaceResponse.status(), 401, "an expired session must not read the customer workspace");
  assert.match(expiredWorkspaceResponse.headers()["cache-control"] || "", /private.*no-store/i);

  assert.deepEqual(errors, [], "auth pages should not throw browser errors");
  console.log(JSON.stringify({
    signUp: "passed",
    desktopAndMobileHeaderAccess: "passed",
    session: "passed",
    guestWorkspaceMerge: "passed",
    workspacePersistence: "passed",
    foreignOwnerWriteStatus: foreignOwnerWrite.status(),
    crossOriginWriteStatus: crossOriginWrite.status(),
    secondAccountIsolation: "passed",
    signOutStatus: signOutResponse.status(),
    signedOutWorkspaceStatus: signedOutWorkspace.status(),
    signInAgain: "passed",
    workspaceRestoredAfterSignIn: "passed",
    sameAccountSecondDeviceSignIn: "passed",
    secondDeviceWorkspaceWrite: "passed",
    firstDevicePulledSecondDeviceChanges: "passed",
    expiredSession: "rejected",
    expiredSessionWorkspaceStatus: expiredWorkspaceResponse.status(),
    browserErrors: errors,
  }, null, 2));
  await secondDeviceContext.close();
  await secondContext.close();
  await firstContext.close();
} finally {
  await browser.close();
}
