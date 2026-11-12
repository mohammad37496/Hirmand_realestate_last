#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createServer as createNetServer } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { chromium } from "playwright";
import { installAdminApiStubs } from "./admin-fixtures.mjs";
import { mergeAppEnv, readAppEnv } from "./with-app-env.mjs";
import { pendingMigrations } from "./migration-plan.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dbDir = await mkdtemp(join(tmpdir(), "hirmand-admin-focus-"));
const reportPath = join(dbDir, "admin-focus-report.json");
const adminKey = "qa-local-admin-overlay-focus-20261103";

async function freePort() {
  const probe = createNetServer();
  await new Promise((resolveListen, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolveListen);
  });
  const address = probe.address();
  assert.ok(address && typeof address === "object");
  await new Promise((resolveClose, reject) => probe.close((error) => error ? reject(error) : resolveClose()));
  return address.port;
}

async function migrateDatabase() {
  const db = new PGlite({ dataDir: dbDir });
  try {
    await db.waitReady;
    await db.exec("create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())");
    const files = (await readdir(join(root, "migrations"))).filter((name) => name.endsWith(".sql"));
    const applied = (await db.query("select name from _migrations")).rows.map((row) => row.name);
    for (const migration of pendingMigrations(files, applied)) {
      await db.transaction(async (tx) => {
        await tx.exec(await readFile(join(root, "migrations", migration.path), "utf8"));
        await tx.query("insert into _migrations (name) values ($1)", [migration.name]);
      });
    }
  } finally {
    await db.close();
  }
}

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
let server;
let serverLog = "";
let auditLog = "";

try {
  await migrateDatabase();
  const isolatedEnv = { ...process.env };
  for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_URL", "POSTGRES_URL_NON_POOLING", "POSTGRES_PRISMA_URL", "NEON_DATABASE_URL"]) isolatedEnv[key] = "";
  server = spawn(process.execPath, [join(root, "node_modules/vite/bin/vite.js"), "dev", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: mergeAppEnv(readAppEnv(root), { ...isolatedEnv, HIRMAND_ADMIN_KEY: adminKey, PGLITE_DATA_DIR: dbDir, NODE_ENV: "development", CI: "", PORT: String(port), HOST: "127.0.0.1" }),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  server.stdout.on("data", (chunk) => { serverLog += chunk.toString(); });
  server.stderr.on("data", (chunk) => { serverLog += chunk.toString(); });

  const deadline = Date.now() + 90_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Vite server exited early.\n${serverLog}`);
    try {
      const response = await fetch(`${baseUrl}/admin`, { signal: AbortSignal.timeout(2500) });
      if (response.status === 200) { ready = true; break; }
    } catch { /* server is still booting */ }
    await delay(500);
  }
  assert.ok(ready, `local admin route did not become ready.\n${serverLog}`);

  const audit = spawn(process.execPath, [join(root, "scripts/admin-visual-audit.mjs")], {
    cwd: root,
    env: {
      ...process.env,
      HIRMAND_ADMIN_KEY: adminKey,
      QA_BASE_URL: baseUrl,
      QA_VIEWPORTS: "360x800,1440x900",
      QA_VIEWS: "dashboard",
      QA_SCREENSHOTS: "0",
      QA_REPORT_PATH: reportPath,
      QA_FAIL_ON_FOCUS_FINDINGS: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const result = await new Promise((resolveExit, reject) => {
    audit.stdout.on("data", (chunk) => { auditLog += chunk.toString(); });
    audit.stderr.on("data", (chunk) => { auditLog += chunk.toString(); });
    audit.once("error", reject);
    audit.once("exit", (code, signal) => resolveExit({ code, signal }));
  });
  assert.equal(result.code, 0, `admin overlay focus browser audit failed (${result.signal ?? result.code}).\n${auditLog}\n${serverLog}`);

  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const drawer = report.overlays.find((entry) => entry.kind === "drawer");
  const palette = report.overlays.find((entry) => entry.kind === "command palette");
  assert.ok(drawer, `mobile drawer focus was not exercised.\n${auditLog}`);
  assert.ok(palette, `command palette focus was not exercised.\n${auditLog}`);
  const focusFindings = report.overlays.flatMap((entry) => (entry.issues.focus ?? []).map((issue) => `${entry.kind}: ${issue}`));
  assert.deepEqual(focusFindings, [], `all admin overlays must contain and restore keyboard focus: ${focusFindings.join("; ")}`);

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fa-IR" });
    const page = await context.newPage();
    await installAdminApiStubs(page, baseUrl);
    await page.route("**/api/admin/session", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, authenticated: true, role: "owner" }),
    }));
    await page.route("**/api/admin/mobile-management/summary", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        generatedAt: new Date().toISOString(),
        counts: { total: 1, active: 1, pending: 0, revoked: 0, online: 1, attention: 0, deviceOwner: 1, profileOwner: 0 },
        devices: [{
          id: "qa-device-row", deviceId: "qa-device-390", staffId: "qa-staff", staffName: "کارمند نمونه", staffRole: "مشاور",
          status: "active", appVersionName: "1.0.0", appVersionCode: 1, managementMode: "device_owner", managementModeLabel: "Fully Managed",
          manufacturer: "Google", model: "Pixel QA", androidVersion: "15", sdkInt: 35, createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(), approvedAt: new Date().toISOString(), revokedAt: null, lastSeenAt: new Date().toISOString(),
          lastSyncAt: new Date().toISOString(), latestPermissionAt: null, latestHeartbeatAt: new Date().toISOString(), latestLocationAt: null,
          presence: "online", presenceLabel: "آنلاین", permissions: [], locationCapability: "not_active",
          policy: { management: "managed", permissions: "managed", sync: "managed", retention: "managed", location: "disabled" },
          alerts: [], needsAttention: false,
        }],
        alerts: [],
        policy: { managementMode: "Device Owner", permissionPolicy: "مدیریت‌شده", securityPolicy: "فعال", appPolicy: "مدیریت‌شده", syncPolicy: "فعال", retentionPolicy: "پیش‌فرض", locationPolicy: "غیرفعال" },
      }),
    }));
    await page.route("**/api/mobile/staff-directory", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, staff: [{ id: "qa-staff", name: "کارمند نمونه", role: "مشاور" }] }),
    }));
    let mutationCalls = 0;
    await page.route("**/api/admin/mobile-devices", async (route) => {
      mutationCalls += 1;
      await route.abort();
    });

    await page.goto(`${baseUrl}/admin-mobile-management`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const enrollmentTrigger = page.getByRole("button", { name: /افزودن دستگاه/ });
    await enrollmentTrigger.waitFor({ state: "visible", timeout: 20_000 });
    await enrollmentTrigger.click();
    const enrollment = page.getByRole("dialog", { name: "ثبت دستگاه جدید" });
    await enrollment.waitFor({ state: "visible" });
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "بستن", "enrollment dialog should focus its close button");
    assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden", "enrollment dialog should lock page scrolling");
    const enrollmentButtons = enrollment.locator("button:not([disabled])");
    const enrollmentFirst = enrollmentButtons.first();
    const enrollmentLast = enrollmentButtons.last();
    await enrollmentFirst.focus();
    await page.keyboard.press("Shift+Tab");
    assert.equal(await enrollmentLast.evaluate((element) => element === document.activeElement), true, "enrollment Shift+Tab should wrap to the last control");
    await page.keyboard.press("Tab");
    assert.equal(await enrollmentFirst.evaluate((element) => element === document.activeElement), true, "enrollment Tab should wrap to the first control");
    await enrollmentTrigger.focus();
    await page.keyboard.press("Tab");
    assert.equal(await enrollmentFirst.evaluate((element) => element === document.activeElement), true, "Tab from outside enrollment dialog should enter its first control");
    await page.screenshot({ path: join(root, "screenshots", "admin-enrollment-dialog-after.png") });
    await page.keyboard.press("Escape");
    await enrollment.waitFor({ state: "hidden" });
    assert.equal(await enrollmentTrigger.evaluate((element) => element === document.activeElement), true, "Escape should restore focus to the enrollment trigger");
    assert.notEqual(await page.evaluate(() => document.body.style.overflow), "hidden", "closing enrollment dialog should restore page scrolling");

    const revokeTrigger = page.getByRole("button", { name: "لغو", exact: true }).first();
    await revokeTrigger.click();
    const revoke = page.getByRole("dialog", { name: "لغو دسترسی دستگاه؟" });
    await revoke.waitFor({ state: "visible" });
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "انصراف", "revoke dialog should focus the safe cancel action");
    const revokeButtons = revoke.locator("button:not([disabled])");
    const revokeFirst = revokeButtons.first();
    const revokeLast = revokeButtons.last();
    await revokeFirst.focus();
    await page.keyboard.press("Shift+Tab");
    assert.equal(await revokeLast.evaluate((element) => element === document.activeElement), true, "revoke Shift+Tab should wrap to the last control");
    await page.keyboard.press("Tab");
    assert.equal(await revokeFirst.evaluate((element) => element === document.activeElement), true, "revoke Tab should wrap to the first control");
    await page.screenshot({ path: join(root, "screenshots", "admin-revoke-dialog-after.png") });
    await page.getByRole("button", { name: "انصراف", exact: true }).click();
    await revoke.waitFor({ state: "hidden" });
    assert.equal(await revokeTrigger.evaluate((element) => element === document.activeElement), true, "cancel should restore focus to the revoke trigger");
    assert.equal(mutationCalls, 0, "dialog accessibility tests must not submit device mutations");

    for (const width of [320, 375, 430, 768, 1024, 1366, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await enrollmentTrigger.click();
      await enrollment.waitFor({ state: "visible" });
      const enrollmentBox = await enrollment.boundingBox();
      assert.ok(enrollmentBox && enrollmentBox.x >= 0 && enrollmentBox.x + enrollmentBox.width <= width && enrollmentBox.y >= 0 && enrollmentBox.y + enrollmentBox.height <= 900, `enrollment dialog must fit ${width}×900 viewport`);
      await page.keyboard.press("Escape");
      await enrollment.waitFor({ state: "hidden" });

      await revokeTrigger.click();
      await revoke.waitFor({ state: "visible" });
      const revokeBox = await revoke.boundingBox();
      assert.ok(revokeBox && revokeBox.x >= 0 && revokeBox.x + revokeBox.width <= width && revokeBox.y >= 0 && revokeBox.y + revokeBox.height <= 900, `revoke dialog must fit ${width}×900 viewport`);
      await page.getByRole("button", { name: "انصراف", exact: true }).click();
      await revoke.waitFor({ state: "hidden" });
    }
    assert.equal(mutationCalls, 0, "responsive modal checks must not submit device mutations");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addScriptTag({
      type: "module",
      content: `
        import React from "/node_modules/.vite/deps/react.js";
        import ReactDOMClient from "/node_modules/.vite/deps/react-dom_client.js";
        const { createRoot } = ReactDOMClient;
        import { AdminPropertyPreview } from "/src/components/hirmand/admin-property-preview.tsx";
        const container = document.createElement("div");
        container.id = "qa-property-preview-root";
        document.body.append(container);
        window.__qaPropertyPreviewRoot = createRoot(container);
        window.__qaPropertyPreviewRoot.render(React.createElement(AdminPropertyPreview, { data: {
          title: "پیش‌نمایش آزمایشی", transactionType: "sell", propertyType: "apartment", neighborhood: "چهارباغ",
          areaM2: "120", bedrooms: "2", bathrooms: "1", floor: "3", parking: true, elevator: true, storage: true,
          price: "8500000000", deposit: "", rent: "", description: "پیش‌نمایش بدون ذخیره یا انتشار داده آزمایشی.",
          images: "", contactName: "مشاور نمونه", contactPhone: "09120000000", featured: false, status: "draft"
        }}));
      `,
    });
    const previewTrigger = page.getByRole("button", { name: /پیش‌نمایش قبل از انتشار/ });
    await previewTrigger.waitFor({ state: "visible", timeout: 20_000 });
    const preview = page.getByRole("dialog", { name: "پیش‌نمایش آزمایشی" });
    for (const width of [320, 375, 430, 768, 1024, 1366, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await previewTrigger.click();
      await preview.waitFor({ state: "visible" });
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "بستن", "property preview should focus its close control");
      const previewBox = await preview.boundingBox();
      assert.ok(previewBox && previewBox.x >= 0 && previewBox.x + previewBox.width <= width && previewBox.y >= 0 && previewBox.y + previewBox.height <= 900, `property preview must fit ${width}×900 viewport`);
      if (width === 320 || width === 1440) {
        await page.screenshot({ path: join(root, "screenshots", `admin-property-preview-${width}-after.png`) });
      }
      if (width === 1440) {
        const previewButtons = preview.locator("button:not([disabled])");
        const first = previewButtons.first();
        const last = previewButtons.last();
        await first.focus();
        await page.keyboard.press("Shift+Tab");
        assert.equal(await last.evaluate((element) => element === document.activeElement), true, "preview Shift+Tab should wrap to its last control");
        await page.keyboard.press("Tab");
        assert.equal(await first.evaluate((element) => element === document.activeElement), true, "preview Tab should wrap to its first control");
        await page.keyboard.press("Escape");
      } else {
        await page.getByRole("button", { name: "بستن", exact: true }).first().click();
      }
      await preview.waitFor({ state: "hidden" });
      assert.equal(await previewTrigger.evaluate((element) => element === document.activeElement), true, `preview close should restore focus at ${width}px`);
    }
    await context.close();
  } finally {
    await browser.close();
  }

  console.log("[admin-overlay-focus-browser] PASS: shared drawer/palette, enrollment/revoke dialogs and property preview pass keyboard focus checks; all three dialogs fit 320/375/430/768/1024/1366/1920px and no device mutation was sent.");
} catch (error) {
  console.error("[admin-overlay-focus-browser] FAIL");
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  if (auditLog) console.error(auditLog);
  if (serverLog) console.error(serverLog);
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([new Promise((resolveExit) => server.once("exit", resolveExit)), delay(5000)]);
  }
}
