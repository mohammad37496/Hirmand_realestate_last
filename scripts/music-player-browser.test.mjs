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
    env: { ...isolatedEnv, PGLITE_DATA_DIR: dbDir, NODE_ENV: "development", CI: "true" },
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
    return {
      count: nodes.length,
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
  assert.equal(loadedGeometry.left, loadingGeometry.left);
  assert.equal(loadedGeometry.bottom, loadingGeometry.bottom);
  assert.equal(loadedGeometry.width, loadingGeometry.width);
  assert.equal(loadedGeometry.height, loadingGeometry.height);

  const routes = ["/properties", "/properties/qa-apartment-long-title", "/admin"];
  for (const path of routes) {
    await page.goto(new URL(path, baseUrl).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForFunction(() => !!document.querySelector("#hirmand-site-music-player"));
    await assertDock(page, { width: 1280, height: 800 });
    await page.evaluate(() => window.scrollTo(0, Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)));
    await page.waitForTimeout(80);
    await assertDock(page, { width: 1280, height: 800 });
  }

  await page.goBack({ waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(() => !!document.querySelector("#hirmand-site-music-player"));
  await assertDock(page, { width: 1280, height: 800 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await assertDock(page, { width: 1440, height: 900 });
  await page.setViewportSize({ width: 1024, height: 768 });
  await assertDock(page, { width: 1024, height: 768 });
  assert.deepEqual(runtimeErrors, [], `browser runtime errors: ${runtimeErrors.join("; ")}`);
  await page.close();

  // A separate empty-list response verifies that a successful empty result and
  // an API error do not create another dock or alter the desktop shell geometry.
  const emptyPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await emptyPage.route("**/api/music", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ tracks: [] }),
  }));
  await emptyPage.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await emptyPage.waitForFunction(() => document.querySelector("#hirmand-site-music-player")?.classList.contains("music-player-float-empty"));
  await assertDock(emptyPage, { width: 1280, height: 800 });
  await emptyPage.close();

  console.log("[music-player-browser] PASS: loading -> loaded -> empty, single instance, route changes, back navigation, scroll, and 1280/1440/1024 desktop viewport geometry.");
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
