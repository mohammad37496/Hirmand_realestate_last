#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const baseUrl = process.env.CUSTOMER_AUTH_SMOKE_URL || "http://127.0.0.1:3018";
const origin = new URL(baseUrl).origin;
const password = `Hirmand-${randomUUID()}-A9!`;
const email = `customer-auth-${randomUUID()}@example.com`;
const secondEmail = `customer-auth-${randomUUID()}@example.com`;

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const errors = [];

async function signUp(context, address, displayName, seedGuestWorkspace = false) {
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  const sessionCheck = page.waitForResponse((response) =>
    response.url().includes("/api/auth/get-session"),
  );
  await page.goto(new URL("/login?next=%2F", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await sessionCheck;
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
  assert.deepEqual(secondWorkspace.savedSearches, []);

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

  assert.deepEqual(errors, [], "auth pages should not throw browser errors");
  console.log(JSON.stringify({
    signUp: "passed",
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
    browserErrors: errors,
  }, null, 2));
  await secondContext.close();
  await firstContext.close();
} finally {
  await browser.close();
}
