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
  // Vite can briefly remove/re-apply route CSS while optimizing a newly
  // discovered dependency. Wait for the shared stylesheet and its fixed
  // positioning to be applied before measuring; a missing stylesheet still
  // times out and fails rather than weakening the geometry assertions.
  await page.waitForFunction(() => {
    const node = document.querySelector('#hirmand-site-music-player[aria-label="پخش موسیقی هیرمند"]');
    const musicStylesheetLoaded = [...document.styleSheets].some((sheet) => sheet.href?.includes("music-player.css"));
    return !!node && musicStylesheetLoaded && getComputedStyle(node).position === "fixed";
  }, null, { timeout: 15_000 });
  await page.evaluate(() => new Promise((resolveFrame) =>
    requestAnimationFrame(() => requestAnimationFrame(resolveFrame)),
  ));
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
      musicStylesheetLoaded: [...document.styleSheets].some((sheet) => sheet.href?.includes("music-player.css")),
      zIndex: style.zIndex,
      boxSizing: style.boxSizing,
      borderRadius: style.borderRadius,
      backgroundImage: style.backgroundImage,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      classes: node.className,
      activePlayer: !node.classList.contains("music-player-float-empty") && !node.classList.contains("is-collapsed"),
      rootDisplay: style.display,
      rootPadding: style.padding,
      contentWidth: node.querySelector(".music-player-full-content")?.getBoundingClientRect().width ?? null,
      headHeight: node.querySelector(".music-player-float-head")?.getBoundingClientRect().height ?? null,
      discWidth: node.querySelector(".music-player-disc")?.getBoundingClientRect().width ?? null,
      controlWidth: node.querySelector(".music-player-float-controls button:not(.music-player-float-play)")?.getBoundingClientRect().width ?? null,
      playWidth: node.querySelector(".music-player-float-controls .music-player-float-play")?.getBoundingClientRect().width ?? null,
      progressDisplay: node.querySelector(".music-player-float-progress") ? getComputedStyle(node.querySelector(".music-player-float-progress")).display : null,
    };
  });
  assert.equal(result.count, 1, `exactly one shared player should exist on ${page.url()}: ${JSON.stringify(result)}`);
  assert.equal(result.parentIsBody, true, "the player should remain outside route-specific transformed wrappers");
  assert.deepEqual(result.containingBlockRisks, [], `an ancestor may be creating a fixed-position containing block: ${JSON.stringify(result.containingBlockRisks)}`);
  assert.equal(result.position, "fixed", `player must be viewport-fixed on ${page.url()}: ${JSON.stringify(result)}`);
  assert.equal(result.zIndex, "1150", `player layer must stay above page content on ${page.url()}`);
  assert.equal(result.boxSizing, "border-box", `player dimensions must include padding and border on ${page.url()}`);
  assert.equal(result.borderRadius, "18px", `desktop Hirmand dock corners must stay consistent on ${page.url()}: ${JSON.stringify(result)}`);
  assert.match(result.backgroundImage, /radial-gradient.*linear-gradient/s, `the Hirmand navy/gold surface must remain applied on ${page.url()}`);
  const routePath = new URL(page.url()).pathname;
  const compactTabletListing = routePath === "/properties" && viewport.width >= 721 && viewport.width <= 1024;
  if (compactTabletListing) {
    assert.ok(Math.abs(result.left - 10) <= 1, `tablet listing dock should stay 10px from the left edge: ${JSON.stringify(result)}`);
    assert.ok(Math.abs(result.bottom - (viewport.height - 78)) <= 1, `tablet listing dock should stay above the bottom navigation: ${JSON.stringify(result)}`);
    assert.ok(Math.abs(result.width - 112) <= 1, `tablet listing dock should remain 112px wide: ${JSON.stringify(result)}`);
    assert.ok(Math.abs(result.height - 54) <= 1, `tablet listing dock should remain 54px high: ${JSON.stringify(result)}`);
    assert.equal(result.rootPadding, "5px 8px", `tablet listing dock padding must stay compact: ${JSON.stringify(result)}`);
    if (result.activePlayer) {
      assert.ok(Math.abs(result.headHeight - 54) <= 1, `tablet listing dock head must fill its compact shell: ${JSON.stringify(result)}`);
      assert.ok(Math.abs(result.playWidth - 44) <= 1, `tablet listing play control must retain a 44px target: ${JSON.stringify(result)}`);
      assert.equal(result.progressDisplay, "none", `tablet listing dock must hide the progress row to preserve card actions: ${JSON.stringify(result)}`);
    }
    return result;
  }
  assert.ok(Math.abs(result.left - 20) <= 1, `expected left=20px on ${page.url()}: ${JSON.stringify(result)}`);
  assert.ok(Math.abs(result.bottom - (viewport.height - 20)) <= 1, `expected bottom=20px on ${page.url()}: ${JSON.stringify(result)}`);
  assert.ok(Math.abs(result.width - 292) <= 1, `expected width=292px on ${page.url()}: ${JSON.stringify(result)}`);
  assert.ok(Math.abs(result.height - 132) <= 1, `expected height=132px on ${page.url()}: ${JSON.stringify(result)}`);
  assert.equal(result.rootPadding, "9px 10px 7px", `desktop player padding must be route-independent on ${page.url()}: ${JSON.stringify(result)}`);
  if (result.activePlayer) {
    assert.equal(result.rootDisplay, "block", `desktop player root display must be route-independent on ${page.url()}`);
    assert.ok(Math.abs(result.contentWidth - 270) <= 1, `desktop player content width must remain 270px on ${page.url()}: ${JSON.stringify(result)}`);
    assert.ok(Math.abs(result.headHeight - 26) <= 1, `desktop player header must remain 26px on ${page.url()}: ${JSON.stringify(result)}`);
    assert.ok(Math.abs(result.discWidth - 34) <= 1, `desktop player disc must remain 34px on ${page.url()}: ${JSON.stringify(result)}`);
    assert.ok(Math.abs(result.controlWidth - 24) <= 1, `desktop player transport buttons must remain 24px on ${page.url()}: ${JSON.stringify(result)}`);
    assert.ok(Math.abs(result.playWidth - 30) <= 1, `desktop player play button must remain 30px on ${page.url()}: ${JSON.stringify(result)}`);
    assert.equal(result.progressDisplay, "grid", `desktop progress must remain visible on ${page.url()}: ${JSON.stringify(result)}`);
  }
  return result;
}

async function scrollToPageBottom(page, requestedPath, viewportWidth) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.evaluate(() => window.scrollTo(0, Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)));
      return;
    } catch (error) {
      const message = String(error?.message || error);
      const navigationRace = /Execution context was destroyed|Cannot find context|navigation/i.test(message);
      if (!navigationRace || attempt === 2) {
        throw new Error(`could not scroll after navigation to ${requestedPath} at ${viewportWidth}px (actual URL: ${page.url()}): ${message}`);
      }
      await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
      await page.waitForFunction(
        () => document.readyState !== "loading" && !!document.querySelector("#hirmand-site-music-player"),
        null,
        { timeout: 15_000 },
      );
    }
  }
}

async function navigateToRoute(page, baseUrl, routePath) {
  const url = new URL(routePath, baseUrl).toString();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForFunction(
        () => document.readyState !== "loading" && !!document.querySelector("#hirmand-site-music-player"),
        null,
        { timeout: 60_000 },
      );
      // The root-mounted dock exists before route content hydrates. On the
      // tablet listing breakpoint its compact geometry is activated by
      // body:has(.pf-page), so wait for the actual listing DOM before measuring.
      if (routePath === "/properties") {
        await page.locator(".pf-page").waitFor({ state: "visible", timeout: 60_000 });
      } else if (routePath === "/favorites") {
        await page.locator(".favorites-page").waitFor({ state: "visible", timeout: 60_000 });
      }
      await page.evaluate(() => new Promise((resolveFrame) =>
        requestAnimationFrame(() => requestAnimationFrame(resolveFrame)),
      ));
      await page.waitForFunction(() =>
        [...document.styleSheets].some((sheet) => sheet.href?.includes("music-player.css")),
      null, { timeout: 15_000 });
      return;
    } catch (error) {
      const message = String(error?.message || error);
      if (!/net::ERR_ABORTED|Execution context was destroyed/i.test(message) || attempt === 2) {
        throw new Error(`navigation to ${routePath} failed (actual URL: ${page.url()}): ${message}`);
      }
      // Vite can reload once when a newly visited route discovers an optimized
      // dependency. Retry only this known navigation-abort race; real failures
      // still fail the test with the route and browser error attached.
      await delay(300 * (attempt + 1));
    }
  }
}

try {
  await migrateIsolatedDatabase();
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  startServer(port);
  await waitForServer(baseUrl);
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

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
  page.on("pageerror", (error) => runtimeErrors.push({ message: String(error?.message || error), url: page.url() }));
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

  // A single-track playlist must stop when shuffle is on and repeat is off.
  const playbackOptions = page.locator(".music-player-options button");
  await playbackOptions.nth(1).click(); // all -> one
  await playbackOptions.nth(1).click(); // one -> off
  assert.equal(await playbackOptions.nth(1).getAttribute("aria-pressed"), "false");
  await playbackOptions.nth(0).click(); // shuffle on
  assert.equal(await playbackOptions.nth(0).getAttribute("aria-pressed"), "true");
  const playCallsBeforeRestart = await page.evaluate(() => window.__qaAudioCalls.play);
  await page.locator(".music-player-float-play").first().click();
  await page.waitForFunction((previous) => window.__qaAudioCalls.play > previous, playCallsBeforeRestart);
  const playCallsBeforeSingleTrackEnded = await page.evaluate(() => window.__qaAudioCalls.play);
  const playLabelBeforeSingleTrackEnded = await page.locator(".music-player-float-play").first().getAttribute("aria-label");
  await page.locator("#hirmand-site-music-player audio").dispatchEvent("ended");
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => window.__qaAudioCalls.play), playCallsBeforeSingleTrackEnded,
    "shuffle must not restart a one-track playlist after repeat has been turned off");
  assert.notEqual(await page.locator(".music-player-float-play").first().getAttribute("aria-label"), playLabelBeforeSingleTrackEnded,
    "the player must leave its playing state when the only track ends with repeat off");

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

  if (!process.argv.includes("--mobile-only")) {
  // Cover every generated top-level page family plus representative dynamic
  // routes and both management entry points. Auth-gated routes are still useful
  // here: the shared dock must survive the gate/redirect without duplicate mounts.
  const routeMatrix = [
    { path: "/", label: "home" },
    { path: "/properties", label: "property listing" },
    { path: "/properties/qa-apartment-long-title", label: "property detail" },
    { path: "/guides", label: "content page" },
    { path: "/card", label: "digital business card" },
    { path: "/areas", label: "areas index" },
    { path: "/areas/qa-area", label: "area detail" },
    { path: "/budget-match", label: "budget matching" },
    { path: "/compare", label: "property comparison" },
    { path: "/consultants", label: "consultants index" },
    { path: "/consultants/qa-consultant", label: "consultant detail" },
    { path: "/favorites", label: "favorites" },
    { path: "/file-code", label: "file code lookup" },
    { path: "/file/qa-file-id", label: "file detail" },
    { path: "/my-hirmand", label: "my Hirmand" },
    { path: "/nearby", label: "nearby search" },
    { path: "/notifications", label: "notifications" },
    { path: "/request-property", label: "property request" },
    { path: "/request-tracking", label: "request tracking" },
    { path: "/smart-search", label: "smart search" },
    { path: "/staff", label: "staff" },
    { path: "/staff-agreement", label: "staff agreement" },
    { path: "/submit-property", label: "property submission" },
    { path: "/tracking", label: "tracking" },
    { path: "/valuation", label: "valuation" },
    { path: "/tools", label: "tools index" },
    { path: "/tools/commission", label: "commission calculator" },
    { path: "/tools/deposit", label: "deposit calculator" },
    { path: "/tools/loan", label: "loan calculator" },
    { path: "/tools/rahn-rent", label: "rent and mortgage calculator" },
    { path: "/v/qa-slug/qa-id", label: "digital property card" },
    { path: "/admin", label: "admin entry" },
    { path: "/admin-mobile-management", label: "mobile management" },
    { path: "/admin-mobile-management/qa-employee", label: "employee management detail" },
  ];
  const desktopViewports = [
    { width: 1024, height: 768 },
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ];
  for (const viewport of desktopViewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const route of routeMatrix) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await navigateToRoute(page, baseUrl, route.path);
          const beforeScroll = await assertDock(page, viewport);
          await scrollToPageBottom(page, route.path, viewport.width);
          await page.waitForTimeout(80);
          const afterScroll = await assertDock(page, viewport);
          assert.deepEqual(
            { left: afterScroll.left, bottom: afterScroll.bottom, width: afterScroll.width, height: afterScroll.height },
            { left: beforeScroll.left, bottom: beforeScroll.bottom, width: beforeScroll.width, height: beforeScroll.height },
            `player geometry must remain fixed after scrolling on ${route.path} at ${viewport.width}px`,
          );
          assert.equal(afterScroll.count, 1, `route ${route.path} must contain exactly one shared player`);
          break;
        } catch (error) {
          const message = String(error?.message || error);
          const dependencyReloadRace = /Execution context was destroyed|Cannot find context|net::ERR_ABORTED|Error: aborted/i.test(message);
          if (!dependencyReloadRace || attempt === 2) {
            throw new Error(`route ${route.path} at ${viewport.width}px failed: ${message}`);
          }
          // Vite may optimize a newly discovered dependency after navigation has
          // resolved, destroying the page context during scroll/measurement.
          // Retry only that known race; geometry assertion failures remain fatal.
          await delay(350 * (attempt + 1));
        }
      }
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
  // Crossing the mobile breakpoint must synchronize collapsed state in both directions.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector("#hirmand-site-music-player")?.classList.contains("is-collapsed"));
  const resizedMobileDock = await page.evaluate(() => {
    const node = document.querySelector("#hirmand-site-music-player");
    const rect = node?.getBoundingClientRect();
    return { collapsed: node?.classList.contains("is-collapsed"), left: rect?.left ?? -1, right: rect?.right ?? Infinity };
  });
  assert.equal(resizedMobileDock.collapsed, true, "desktop -> mobile must activate the compact launcher");
  assert.ok(resizedMobileDock.left >= 0 && resizedMobileDock.right <= 390, `resized mobile launcher must fit the viewport: ${JSON.stringify(resizedMobileDock)}`);

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForFunction(() => !document.querySelector("#hirmand-site-music-player")?.classList.contains("is-collapsed"));
  await assertDock(page, { width: 1024, height: 768 });
  const desktopContentVisible = await page.locator("#hirmand-site-music-player .music-player-full-content").evaluate((node) => getComputedStyle(node).display !== "none");
  assert.equal(desktopContentVisible, true, "mobile -> desktop must restore the full desktop player content");
  }

  // Vite can occasionally fail one route's dynamically imported client entry
  // during a rapid full-route matrix. Retry that exact route once; suppress the
  // transient error only when the reload succeeds without repeating it.
  const transientImportFailures = runtimeErrors.filter(({ message }) =>
    message.includes("Failed to fetch dynamically imported module:") &&
    message.includes("/node_modules/@tanstack/react-start/dist/plugin/default-entry/client.tsx"),
  );
  for (const failure of transientImportFailures) {
    const beforeRetry = runtimeErrors.length;
    const failedUrl = new URL(failure.url);
    await navigateToRoute(page, baseUrl, failedUrl.pathname + failedUrl.search + failedUrl.hash);
    await page.waitForTimeout(250);
    const repeated = runtimeErrors.slice(beforeRetry).some((entry) => entry.message === failure.message);
    if (!repeated) {
      const originalIndex = runtimeErrors.indexOf(failure);
      if (originalIndex >= 0) runtimeErrors.splice(originalIndex, 1);
      console.log("[music-player-browser] recovered transient Vite module fetch after reloading " + failure.url);
    }
  }
  assert.deepEqual(
    runtimeErrors,
    [],
    `browser runtime errors: ${runtimeErrors.map(({ url, message }) => url + ": " + message).join("; ")}`,
  );
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
  await mobilePage.setViewportSize({ width: 320, height: 568 });
  await mobilePage.addInitScript(() => {
    window.__qaMobilePauseCalls = 0;
    const mediaPrototype = HTMLMediaElement.prototype;
    Object.defineProperty(mediaPrototype, "paused", {
      configurable: true,
      get() { return this.__qaPaused ?? true; },
    });
    mediaPrototype.play = function () {
      this.__qaPaused = false;
      this.dispatchEvent(new Event("play"));
      return Promise.resolve();
    };
    mediaPrototype.pause = function () {
      window.__qaMobilePauseCalls += 1;
      this.__qaPaused = true;
      setTimeout(() => this.dispatchEvent(new Event("pause")), 0);
    };
  });
  const silentWav = Buffer.alloc(44 + 8000);
  silentWav.write("RIFF", 0);
  silentWav.writeUInt32LE(36 + 8000, 4);
  silentWav.write("WAVEfmt ", 8);
  silentWav.writeUInt32LE(16, 16);
  silentWav.writeUInt16LE(1, 20);
  silentWav.writeUInt16LE(1, 22);
  silentWav.writeUInt32LE(8000, 24);
  silentWav.writeUInt32LE(8000, 28);
  silentWav.writeUInt16LE(1, 32);
  silentWav.writeUInt16LE(8, 34);
  silentWav.write("data", 36);
  silentWav.writeUInt32LE(8000, 40);
  silentWav.fill(128, 44);
  await mobilePage.route("**/qa-mobile-track-*.mp3", (route) => route.fulfill({
    status: 200,
    contentType: "audio/wav",
    body: silentWav,
  }));
  await mobilePage.route("**/api/music", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ tracks: [
      { id: "qa-mobile-track-1", title: "آهنگ اول", artist: "هیرمند", stream: "/qa-mobile-track-1.mp3" },
      { id: "qa-mobile-track-2", title: "آهنگ دوم", artist: "هیرمند", stream: "/qa-mobile-track-2.mp3" },
    ] }),
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
  assert.ok(mobileDock.left >= 0 && mobileDock.right <= 320, `mobile launcher must remain inside the 320px viewport: ${JSON.stringify(mobileDock)}`);

  await mobilePage.getByRole("button", { name: "باز کردن پلیر موسیقی" }).click();
  await mobilePage.waitForFunction(() => document.querySelector("#hirmand-site-music-player")?.classList.contains("is-expanded"));
  const mobilePanel = await mobilePage.evaluate(() => {
    const root = document.querySelector("#hirmand-site-music-player");
    const panel = root?.getBoundingClientRect();
    const targets = [...(root?.querySelectorAll("button, input[type=range]") ?? [])]
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((element) => ({
        label: element.getAttribute("aria-label") || element.textContent?.trim() || element.tagName,
        width: Math.round(element.getBoundingClientRect().width),
        height: Math.round(element.getBoundingClientRect().height),
      }));
    return {
      expanded: root?.classList.contains("is-expanded"),
      left: panel?.left ?? -1,
      right: panel?.right ?? Infinity,
      width: panel?.width ?? 0,
      height: panel?.height ?? 0,
      top: panel?.top ?? -1,
      bottom: panel?.bottom ?? Infinity,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      targets,
    };
  });
  assert.equal(mobilePanel.expanded, true, "the mobile launcher must open the full player panel");
  assert.ok(mobilePanel.left >= 0 && mobilePanel.right <= mobilePanel.viewportWidth, `expanded mobile player must fit horizontally: ${JSON.stringify(mobilePanel)}`);
  assert.ok(mobilePanel.width >= Math.min(350, mobilePanel.viewportWidth - 24) - 1, `expanded mobile player must retain its full panel width: ${JSON.stringify(mobilePanel)}`);
  assert.ok(mobilePanel.height >= Math.min(mobilePanel.viewportHeight * 0.74, 420) - 1, `expanded mobile player must reserve room for its scrollable controls: ${JSON.stringify(mobilePanel)}`);
  assert.ok(mobilePanel.top >= 0 && mobilePanel.bottom <= mobilePanel.viewportHeight, `expanded mobile player must fit vertically: ${JSON.stringify(mobilePanel)}`);
  assert.ok(mobilePanel.documentWidth <= mobilePanel.viewportWidth, `expanded mobile player must not cause horizontal page overflow: ${JSON.stringify(mobilePanel)}`);
  assert.deepEqual(
    mobilePanel.targets.filter((target) => target.width < 44 || target.height < 44),
    [],
    `every visible mobile player control must have a 44px touch target: ${JSON.stringify(mobilePanel.targets)}`,
  );

  await mobilePage.getByRole("button", { name: "پخش", exact: true }).click();
  await mobilePage.waitForFunction(() => document.querySelector("#hirmand-site-music-player audio")?.paused === false);
  await mobilePage.getByRole("button", { name: "آهنگ بعدی" }).click();
  await mobilePage.waitForFunction(() => document.querySelector("#hirmand-site-music-player .music-player-float-meta strong")?.textContent === "آهنگ دوم");
  await mobilePage.waitForFunction(() => document.querySelector("#hirmand-site-music-player audio")?.paused === false);
  await mobilePage.waitForTimeout(100);
  assert.equal(await mobilePage.locator("#hirmand-site-music-player audio").evaluate((audio) => audio.paused), false,
    "changing tracks from the mobile controls must keep playback active");
  await mobilePage.locator("#hirmand-site-music-player .music-player-float-item").first().evaluate((item) => {
    const content = item.closest(".music-player-full-content");
    if (content) {
      const contentRect = content.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      content.scrollTop += itemRect.top - contentRect.top - (content.clientHeight - itemRect.height) / 2;
    }
  });
  await mobilePage.waitForTimeout(50);
  const mobilePlaylistMetrics = await mobilePage.locator("#hirmand-site-music-player .music-player-float-item").first().evaluate((item) => {
    const content = item.closest(".music-player-full-content");
    const contentRect = content?.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    return {
      item: { top: itemRect.top, bottom: itemRect.bottom, width: itemRect.width, height: itemRect.height },
      content: { top: contentRect?.top, bottom: contentRect?.bottom, clientHeight: content?.clientHeight, scrollHeight: content?.scrollHeight, scrollTop: content?.scrollTop, overflowY: content ? getComputedStyle(content).overflowY : "missing" },
      viewportHeight: window.innerHeight,
    };
  });
  assert.ok(mobilePlaylistMetrics.item.top >= mobilePlaylistMetrics.content.top && mobilePlaylistMetrics.item.bottom <= mobilePlaylistMetrics.content.bottom,
    `mobile playlist items must be reachable inside the scrollable panel: ${JSON.stringify(mobilePlaylistMetrics)}`);
  await mobilePage.locator("#hirmand-site-music-player .music-player-float-item").first().click();
  await mobilePage.waitForFunction(() => document.querySelector("#hirmand-site-music-player .music-player-float-meta strong")?.textContent === "آهنگ اول");
  await mobilePage.waitForFunction(() => document.querySelector("#hirmand-site-music-player audio")?.paused === false);
  await mobilePage.waitForTimeout(100);
  assert.equal(await mobilePage.locator("#hirmand-site-music-player audio").evaluate((audio) => audio.paused), false,
    "selecting a track from the mobile playlist must keep playback active");
  await mobilePage.getByRole("button", { name: "آهنگ بعدی" }).click();
  await mobilePage.waitForFunction(() => document.querySelector("#hirmand-site-music-player .music-player-float-meta strong")?.textContent === "آهنگ دوم");
  await mobilePage.waitForFunction(() => document.querySelector("#hirmand-site-music-player audio")?.paused === false);
  const playingAudioNodeId = await mobilePage.locator("#hirmand-site-music-player audio").evaluate((audio) =>
    audio.dataset.qaNodeId || (audio.dataset.qaNodeId = "mobile-audio-playing"));
  const pauseCallsBeforeCollapse = await mobilePage.evaluate(() => window.__qaMobilePauseCalls);
  await mobilePage.getByRole("button", { name: "جمع کردن پلیر" }).click();
  await mobilePage.waitForFunction(() => document.querySelector("#hirmand-site-music-player")?.classList.contains("is-collapsed"));
  const collapsedPlayback = await mobilePage.locator("#hirmand-site-music-player audio").evaluate((audio, pauseCountBeforeCollapse) => ({
    paused: audio.paused,
    nodeId: audio.dataset.qaNodeId ?? null,
    pauseCalls: window.__qaMobilePauseCalls - pauseCountBeforeCollapse,
  }), pauseCallsBeforeCollapse);
  assert.equal(collapsedPlayback.paused, false,
    `collapsing the mobile panel must not stop the current track: ${JSON.stringify(collapsedPlayback)}`);
  assert.equal(collapsedPlayback.nodeId, playingAudioNodeId, "collapsing the player must preserve the same audio element");
  assert.equal(collapsedPlayback.pauseCalls, 0, "collapsing the player must not call audio.pause");
  await mobilePage.close();
  await context.close();

  console.log("[music-player-browser] PASS: loading -> loaded -> empty/error, single instance, SPA/full route navigation, back/reload, scroll, collapse/restore, desktop viewport geometry, mobile playback, and 44px mobile touch targets.");
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
