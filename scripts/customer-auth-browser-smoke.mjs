#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.env.CUSTOMER_AUTH_SMOKE_URL || "http://127.0.0.1:8080";
const screenshotDir = process.env.CUSTOMER_AUTH_SCREENSHOT_DIR || "screenshots";
const expectGrokOAuth = process.env.EXPECT_GROK_OAUTH === "true";
mkdirSync(screenshotDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  desktop.on("pageerror", (error) => pageErrors.push(error.message));

  const loginResponse = await desktop.goto(new URL("/login", baseUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
  await desktop.locator(".customer-login-form input[type=email]").waitFor();
  await desktop.getByRole("tab", { name: "ساخت حساب", exact: true }).click();
  await desktop.locator(".customer-login-form input[autocomplete=name]").waitFor();
  await desktop.getByRole("tab", { name: "ورود", exact: true }).click();
  await desktop.locator(".customer-login-form input[type=password]").waitFor();
  await desktop.screenshot({
    path: `${screenshotDir}/customer-login-1280.png`,
    fullPage: true,
  });

  const sessionResponse = await desktop.request.get(new URL("/api/auth/get-session", baseUrl).toString());
  const sessionPayload = await sessionResponse.json();
  const workspaceResponse = await desktop.request.get(new URL("/api/customer-workspace", baseUrl).toString());
  const workspaceWriteResponse = await desktop.request.post(new URL("/api/customer-workspace", baseUrl).toString(), {
    headers: { origin: new URL(baseUrl).origin },
    data: { ownerId: "signed-out-smoke", favorites: [], favoriteMeta: {}, savedSearches: [], recentProperties: [] },
  });
  const crossOriginWriteResponse = await desktop.request.post(new URL("/api/customer-workspace", baseUrl).toString(), {
    headers: { origin: "https://attacker.example" },
    data: { ownerId: "signed-out-smoke", favorites: [], favoriteMeta: {}, savedSearches: [], recentProperties: [] },
  });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const homeResponse = await mobile.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await mobile.waitForTimeout(900);
  const menuToggle = mobile.locator(".menu-toggle");
  await menuToggle.click();
  await mobile.waitForTimeout(300);
  const accountLink = mobile.locator(".mobile-menu .customer-account-access");
  await mobile.screenshot({
    path: `${screenshotDir}/customer-account-mobile-390.png`,
    fullPage: true,
  });
  const mobileMenuState = await mobile.evaluate(() => ({
    expanded: document.querySelector(".menu-toggle")?.getAttribute("aria-expanded"),
    menuClass: document.querySelector(".mobile-menu")?.className,
    accountDisplay: document.querySelector(".mobile-menu .customer-account-access")
      ? getComputedStyle(document.querySelector(".mobile-menu .customer-account-access")).display
      : "missing",
  }));

  assert.equal(loginResponse?.status(), 200, "login route should render");
  assert.equal(await desktop.locator(".customer-login-form input[type=email]").isVisible(), true);
  assert.equal(await desktop.locator(".customer-login-form input[type=password]").isVisible(), true);
  if (expectGrokOAuth) {
    assert.equal(await desktop.getByRole("button", { name: "Google", exact: true }).isVisible(), true);
    assert.equal(await desktop.getByRole("button", { name: "X", exact: true }).isVisible(), true);
  } else {
    assert.equal(await desktop.locator(".customer-login-providers").count(), 0);
  }
  assert.equal(sessionResponse.status(), 200, "Better Auth session endpoint should return JSON");
  assert.ok(sessionPayload === null || typeof sessionPayload === "object");
  assert.equal(workspaceResponse.status(), 401, "signed-out workspace requests must be rejected");
  assert.match(workspaceResponse.headers()["cache-control"] || "", /no-store/);
  assert.equal(workspaceWriteResponse.status(), 401, "signed-out workspace writes must be rejected");
  assert.match(workspaceWriteResponse.headers()["cache-control"] || "", /no-store/);
  assert.equal(crossOriginWriteResponse.status(), 403, "cross-origin workspace writes must be rejected");
  assert.match(crossOriginWriteResponse.headers()["cache-control"] || "", /no-store/);
  assert.equal(homeResponse?.status(), 200, "homepage should render");
  assert.equal(mobileMenuState.expanded, "true", "mobile menu should open from its toggle");
  assert.equal(await accountLink.isVisible(), true, "mobile navigation should expose account access");
  assert.deepEqual(pageErrors, [], "login route should not throw browser errors");

  console.log(JSON.stringify({
    loginStatus: loginResponse.status(),
    sessionStatus: sessionResponse.status(),
    workspaceSignedOutStatus: workspaceResponse.status(),
    workspaceCacheControl: workspaceResponse.headers()["cache-control"],
    workspaceWriteSignedOutStatus: workspaceWriteResponse.status(),
    crossOriginWriteStatus: crossOriginWriteResponse.status(),
    homepageStatus: homeResponse.status(),
    mobileAccountAccess: true,
    grokOAuthButtonsVisible: expectGrokOAuth,
    mobileMenuState,
    screenshots: [
      `${screenshotDir}/customer-login-1280.png`,
      `${screenshotDir}/customer-account-mobile-390.png`,
    ],
    pageErrors,
  }, null, 2));
} finally {
  await browser.close();
}
