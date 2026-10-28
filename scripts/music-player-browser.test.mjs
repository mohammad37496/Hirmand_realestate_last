#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createServer as createNetServer } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { chromium } from "playwright";
import { pendingMigrations } from "./migration-plan.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dbDir = await mkdtemp(join(tmpdir(), "hirmand-music-player-pglite-"));
let server;
let serverLog = "";
let browser;
let failed = false;

async function findFreePort() {
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

async function migrateIsolatedDatabase() {
  const db = new PGlite({ dataDir: dbDir });
  try {
    await db.waitReady;
    await db.exec("create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())");
    const files = (await readdir(join(root, "migrations"))).filter((name) => name.endsWith(".sql"));
    const done = (await db.query("select name from _migrations")).rows.map((row) => row.name);
    for (const migration of pendingMigrations(files, done)) {
      await db.transaction(async (tx) => {
        await tx.exec(await readFile(join(root, "migrations", migration.path), "utf8"));
        await tx.query("insert into _migrations (name) values ($1)", [migration.name]);
      });
    }
  } finally {
    await db.close();
  }
}

function startServer(port) {
  const isolatedEnv = { ...process.env };
  for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_URL", "POSTGRES_URL_NON_POOLING", "POSTGRES_PRISMA_URL", "NEON_DATABASE_URL"]) {
    delete isolatedEnv[key];
  }
  server = spawn(process.execPath, [join(root, "scripts/with-app-env.mjs"), "vite", "dev", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: { ...isolatedEnv, PGLITE_DATA_DIR: dbDir, NODE_ENV: "development", CI: "" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  server.stdout.on("data", (chunk) => { serverLog += chunk.toString(); });
  server.stderr.on("data", (chunk) => { serverLog += chunk.toString(); });
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Vite exited before ready.\n${serverLog}`);
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(2500) });
      if (response.ok) return;
    } catch { /* still starting */ }
    await delay(500);
  }
  throw new Error(`Vite did not become ready.\n${serverLog}`);
}

async function assertDock(page, viewport) {
  const result = await page.evaluate(() => {
    const nodes = document.querySelectorAll('#hirmand-site-music-player[aria-label="پخش موسیقی هیرمند"]');
    const node = nodes[0];
    if (!node) return { count: nodes.length, missing: true };
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const containingBlockRisks = [];
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      const parentStyle = getComputedStyle(parent);
      const risks = [];
      if (parentStyle.transform !== "none") risks.push("transform");
      if (parentStyle.filter !== "none") risks.push("filter");
      if (parentStyle.perspective !== "none") risks.push("perspective");
      if (parentStyle.backdropFilter !== "none") risks.push("backdrop-filter");
      if (parentStyle.contain !== "none") risks.push("contain");
      if (/transform|filter|perspective/.test(parentStyle.willChange)) risks.push("will-change");
      if (risks.length) containingBlockRisks.push(`${parent.tagName.toLowerCase()}:${risks.join(",")}`);
    }
    return {
      count: nodes.length,
      parentIsBody: node.parentElement === document.body,
      containingBlockRisks,
      position: style.position,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      classes: node.className,
    };
  });
  assert.equal(result.count, 1, `exactly one shared player should exist on ${page.url()}: ${JSON.stringify(result)}`);
  assert.equal(result.parentIsBody, true, "the player should remain outside route-specific transformed wrappers");
  assert.deepEqual(result.containingBlockRisks, [], `an ancestor may be creating a fixed-position containing block: ${JSON.stringify(result.containingBlockRisks)}`);
  assert.equal(result.position, "fixed", `player must be viewport-fixed on ${page.url()}`);
  assert.ok(Math.abs(result.left - 20) <= 1, `expected left=20px on ${page.url()}: ${JSON.stringify(result)}`);
  assert.ok(Math.abs(result.bottom - (viewport.height - 20)) <= 1, `expected bottom=20px on ${page.url()}: ${JSON.stringify(result)}`);
  assert.ok(Math.abs(result.width - 292) <= 1, `expected width=292px on ${page.url()}: ${JSON.stringify(result)}`);
  assert.ok(Math.abs(result.height - 132) <= 1, `expected height=132px on ${page.url()}: ${JSON.stringify(result)}`);
  return result;
}

try {
  await migrateIsolatedDatabase();
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  startServer(port);
  await waitForServer(baseUrl);
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

  let holdFirstResponse = true;
  let releaseFirstResponse;
  let firstRequestStarted;
  const firstRequestStartedPromise = new Promise((resolveStarted) => { firstRequestStarted = resolveStarted; });
  const firstResponseGate = new Promise((resolveGate) => { releaseFirstResponse = resolveGate; });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(window, "__qaAudioCalls", {
      configurable: true,
      value: { play: 0, pause: 0 },
    });
    const mediaPrototype = HTMLMediaElement.prototype;
    Object.defineProperty(mediaPrototype, "paused", {
      configurable: true,
      get() { return this.__qaPaused ?? true; },
    });
    mediaPrototype.play = function () {
      this.__qaPaused = false;
      window.__qaAudioCalls.play += 1;
      this.dispatchEvent(new Event("play"));
      return Promise.resolve();
    };
    mediaPrototype.pause = function () {
      this.__qaPaused = true;
      window.__qaAudioCalls.pause += 1;
      this.dispatchEvent(new Event("pause"));
    };
  });
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(String(error?.message || error)));
  await page.route("**/api/music", async (route) => {
    if (holdFirstResponse) {
      holdFirstResponse = false;
      firstRequestStarted();
      await firstResponseGate;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ tracks: [{ id: "qa-track-1", title: "آهنگ آزمایشی", artist: "هیرمند", stream: "/qa-track.mp3" }] }),
    });
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await firstRequestStartedPromise;
  await page.waitForFunction(() => document.querySelector("#hirmand-site-music-player")?.classList.contains("music-player-float-empty"));
  const loadingGeometry = await assertDock(page, { width: 1280, height: 800 });
  releaseFirstResponse();
  await page.waitForFunction(() => !document.querySelector("#hirmand-site-music-player")?.classList.contains("music-player-float-empty"));
  const loadedGeometry = await assertDock(page, { width: 1280, height: 800 });
  const timeOriginBeforeSpaNavigation = await page.evaluate(() => performance.timeOrigin);
  const propertiesLink = page.locator('a[href="/properties"]').first();
  if (await propertiesLink.count() && await propertiesLink.isVisible().catch(() => false)) {
    await propertiesLink.click();
    await page.waitForURL((url) => url.pathname === "/properties" || url.pathname === "/properties/");
    assert.equal(await page.evaluate(() => performance.timeOrigin), timeOriginBeforeSpaNavigation,
      "client-side route navigation should preserve the same document and shared player instance");
    await assertDock(page, { width: 1280, height: 800 });
  }
  assert.equal(loadedGeometry.left, loadingGeometry.left);
  assert.equal(loadedGeometry.bottom, loadingGeometry.bottom);
  assert.equal(loadedGeometry.width, loadingGeometry.width);
  assert.equal(loadedGeometry.height, loadingGeometry.height);

  // Exercise the actual React controls with deterministic media-element stubs:
  // CI validates UI/state transitions without relying on a live audio codec or
  // an externally hosted MP3 file.
  await page.getByRole("button", { name: "نمایش فهرست موسیقی" }).click();
  await page.locator('.music-player-float-play[aria-label="پخش"]').click();
  await page.locator('.music-player-float-play[aria-label="مکث"]').waitFor();
  assert.ok(await page.evaluate(() => window.__qaAudioCalls.play > 0), "play should invoke HTMLMediaElement.play()");
  await page.locator('.music-player-float-play[aria-label="مکث"]').click();
  await page.locator('.music-player-float-play[aria-label="پخش"]').waitFor();
  assert.ok(await page.evaluate(() => window.__qaAudioCalls.pause > 0), "pause should invoke HTMLMediaElement.pause()");
  await page.locator('.music-player-float-play[aria-label="پخش"]').click();
  await page.locator('.music-player-float-play[aria-label="مکث"]').waitFor();
  await page.getByRole("button", { name: "توقف آهنگ" }).click();
  await page.locator('.music-player-float-play[aria-label="پخش"]').waitFor();

  const volumeControl = page.getByRole("slider", { name: "کم و زیاد کردن صدا" });
  await volumeControl.evaluate((element) => {
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    nativeSetter?.call(element, "0.35");
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction(() => Math.abs(document.querySelector("#hirmand-site-music-player audio")?.volume - 0.35) < 0.001);
  await page.getByRole("button", { name: "قطع صدا" }).click();
  await page.waitForFunction(() => document.querySelector("#hirmand-site-music-player audio")?.muted === true);
  await page.getByRole("button", { name: "روشن کردن صدا" }).click();
  await page.waitForFunction(() => document.querySelector("#hirmand-site-music-player audio")?.muted === false);
  assert.deepEqual(runtimeErrors, [], "media control interactions must not produce browser runtime errors");

  const routeMatrix = [
    { path: "/", label: "home" },
    { path: "/properties", label: "property listing" },
    { path: "/properties/qa-apartment-long-title", label: "property detail" },
    { path: "/guides", label: "content page" },
    { path: "/card", label: "digital business card" },
    { path: "/admin-mobile-management", label: "independent admin layout" },
  ];
  const desktopViewports = [
    { width: 1024, height: 768 },
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ];
  const geometrySnapshots = new Map();

  for (const viewport of desktopViewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const route of routeMatrix) {
      await page.goto(new URL(route.path, baseUrl).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForFunction(() => !!document.querySelector("#hirmand-site-music-player"));
      const beforeScroll = await assertDock(page, viewport);
      const key = `${viewport.width}:${route.path}:before-scroll`;
      geometrySnapshots.set(key, beforeScroll);

      await page.evaluate(() => window.scrollTo(0, Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)));
      await page.waitForTimeout(80);
      const afterScroll = await assertDock(page, viewport);
      assert.deepEqual(
        { left: afterScroll.left, bottom: afterScroll.bottom, width: afterScroll.width, height: afterScroll.height },
        { left: beforeScroll.left, bottom: beforeScroll.bottom, width: beforeScroll.width, height: beforeScroll.height },
        `player geometry must remain fixed after scrolling on ${route.path} at ${viewport.width}px`,
      );
      assert.equal(afterScroll.count, 1, `route ${route.path} must contain exactly one shared player`);
    }
  }

  // Verify history navigation and a hard reload also retain the global dock.
  await page.goBack({ waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(() => !!document.querySelector("#hirmand-site-music-player"));
  await assertDock(page, { width: 1920, height: 1080 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(() => !!document.querySelector("#hirmand-site-music-player"));
  await assertDock(page, { width: 1920, height: 1080 });

  // Keep the existing collapse/restore checks on a common supported desktop size.
  await page.setViewportSize({ width: 1024, height: 768 });
  await assertDock(page, { width: 1024, height: 768 });
  await page.getByRole("button", { name: "جمع کردن پلیر" }).click();
  await page.waitForFunction(() => document.querySelector("#hirmand-site-music-player")?.classList.contains("is-collapsed"));
  await assertDock(page, { width: 1024, height: 768 });
  await page.getByRole("button", { name: "باز کردن پلیر موسیقی" }).click();
  await page.waitForFunction(() => !document.querySelector("#hirmand-site-music-player")?.classList.contains("is-collapsed"));
  await assertDock(page, { width: 1024, height: 768 });
  assert.deepEqual(runtimeErrors, [], `browser runtime errors: ${runtimeErrors.join("; ")}`);
  await page.close();

  // A separate empty-list response verifies that a successful empty result and
  // an API error do not create another dock or alter the desktop shell geometry.
  const emptyPage = await context.newPage();
  await emptyPage.route("**/api/music", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ tracks: [] }),
  }));
  await emptyPage.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await emptyPage.waitForFunction(() => {
    const node = document.querySelector("#hirmand-site-music-player .music-player-empty-copy");
    return node?.textContent?.includes("به‌زودی با موسیقی هیرمند");
  });
  await assertDock(emptyPage, { width: 1280, height: 800 });
  await emptyPage.close();

  const errorPage = await context.newPage();
  await errorPage.route("**/api/music", (route) => route.abort("failed"));
  await errorPage.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await errorPage.waitForFunction(() => {
    const node = document.querySelector("#hirmand-site-music-player .music-player-empty-copy");
    return node?.textContent?.includes("دریافت فهرست موسیقی ممکن نشد.");
  });
  await assertDock(errorPage, { width: 1280, height: 800 });
  await errorPage.close();

  const mobilePage = await context.newPage();
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  await mobilePage.route("**/api/music", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ tracks: [] }),
  }));
  await mobilePage.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await mobilePage.waitForFunction(() => document.querySelector("#hirmand-site-music-player")?.classList.contains("is-collapsed"));
  const mobileDock = await mobilePage.evaluate(() => {
    const nodes = document.querySelectorAll("#hirmand-site-music-player");
    const node = nodes[0];
    if (!node) return { count: nodes.length, missing: true };
    const rect = node.getBoundingClientRect();
    return { count: nodes.length, position: getComputedStyle(node).position, left: rect.left, right: rect.right };
  });
  assert.equal(mobileDock.count, 1, "mobile must retain the same single shared player instance");
  assert.equal(mobileDock.position, "fixed", "mobile launcher must remain viewport-fixed");
  assert.ok(mobileDock.left >= 0 && mobileDock.right <= 390, `mobile launcher must remain inside the viewport: ${JSON.stringify(mobileDock)}`);
  await mobilePage.close();
  await context.close();

  console.log("[music-player-browser] PASS: loading -> loaded -> empty/error, single instance, SPA/full route navigation, back/reload, scroll, collapse/restore, desktop viewport geometry, and mobile launcher bounds.");
} catch (error) {
  failed = true;
  console.error("[music-player-browser] FAIL");
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  if (serverLog) console.error(serverLog);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([new Promise((resolveExit) => server.once("exit", resolveExit)), delay(5000)]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  await rm(dbDir, { recursive: true, force: true });
}
if (failed) process.exitCode = 1;
