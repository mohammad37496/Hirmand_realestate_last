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
import { mergeAppEnv, readAppEnv } from "./with-app-env.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dbDir = await mkdtemp(join(tmpdir(), "hirmand-card-failover-"));
const brokenImage = "/images/qa-card-intentionally-missing.webp";
const healthyImage = "/images/qa-card-healthy.webp";
const healthyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ZkAAAAASUVORK5CYII=",
  "base64",
);

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

async function seedDatabase() {
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
    await db.query(
      `insert into properties (id, slug, status, title, transaction_type, property_type, neighborhood,
       area_m2, bedrooms, built_year, price, description, features, images, contact_name, contact_phone,
       published_at, created_at, updated_at)
       values ($1,$2,'published',$3,'buy','apartment','محله آزمون کارت',90,2,1400,9000000000,
       'فایل آزمایشی محلی برای بررسی failover تصویر کارت ملک','[]'::jsonb,$4::jsonb,
       'مشاور آزمایشی','09130000000',now(),now(),now())
       on conflict (id) do nothing`,
      [
        "qa-card-failover-001",
        "qa-card-failover",
        "آپارتمان آزمایشی failover کارت",
        JSON.stringify([brokenImage, healthyImage]),
      ],
    );
    const row = await db.query("select images from properties where id=$1 and status='published'", ["qa-card-failover-001"]);
    assert.deepEqual(row.rows[0]?.images, [brokenImage, healthyImage]);
  } finally {
    await db.close();
  }
}

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
let server;
let serverLog = "";
let browser;

try {
  await seedDatabase();
  const isolatedEnv = { ...process.env };
  for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_URL", "POSTGRES_URL_NON_POOLING", "POSTGRES_PRISMA_URL", "NEON_DATABASE_URL"]) isolatedEnv[key] = "";
  server = spawn(process.execPath, [join(root, "node_modules/vite/bin/vite.js"), "dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: root,
    env: mergeAppEnv(readAppEnv(root), { ...isolatedEnv, PGLITE_DATA_DIR: dbDir, NODE_ENV: "development", CI: "", PORT: String(port), HOST: "127.0.0.1" }),
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
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(2500) });
      if (response.status === 200) { ready = true; break; }
    } catch { /* server is still booting */ }
    await delay(500);
  }
  assert.ok(ready, `local homepage did not become ready.\n${serverLog}`);

  const launchOptions = { headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] };
  try {
    browser = await chromium.launch(launchOptions);
  } catch {
    browser = await chromium.launch({ ...launchOptions, channel: "chrome" });
  }

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fa-IR" });
  const page = await context.newPage();
  const requested = [];
  await page.route(`**${brokenImage}*`, (route) => {
    requested.push("broken");
    return route.fulfill({ status: 404, contentType: "text/plain", body: "intentional QA image failure" });
  });
  await page.route(`**${healthyImage}*`, (route) => {
    requested.push("healthy");
    return route.fulfill({ status: 200, contentType: "image/png", body: healthyPng });
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const card = page.locator('.pcard [data-property-id="qa-card-failover-001"]').first();
  await card.waitFor({ state: "visible", timeout: 20_000 });
  const image = page.locator('.pcard [data-property-id="qa-card-failover-001"] img').first();
  await image.scrollIntoViewIfNeeded();
  await page.waitForFunction((expected) => {
    const node = document.querySelector('.pcard [data-property-id="qa-card-failover-001"] img');
    return node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0 && node.getAttribute("src") === expected;
  }, healthyImage, { timeout: 10_000 });

  const finalState = await image.evaluate((node) => ({
    src: node.getAttribute("src"),
    naturalWidth: node.naturalWidth,
    naturalHeight: node.naturalHeight,
    fallbackVisible: Boolean(node.closest(".pcard")?.querySelector(".property-image-fallback")),
  }));
  assert.deepEqual(finalState, { src: healthyImage, naturalWidth: 1, naturalHeight: 1, fallbackVisible: false });
  assert.ok(requested.indexOf("broken") >= 0, "browser must request the intentionally broken first source");
  assert.ok(requested.indexOf("healthy") > requested.indexOf("broken"), "browser must advance from the failed source to the next stored image");
  console.log(JSON.stringify({ result: "passed", requested, finalState }, null, 2));
  await context.close();
} catch (error) {
  console.error(error);
  if (serverLog) console.error(serverLog);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  if (server && server.exitCode === null) {
    server.kill();
    await Promise.race([new Promise((resolveExit) => server.once("exit", resolveExit)), delay(5_000)]);
  }
  await rm(dbDir, { recursive: true, force: true });
}
