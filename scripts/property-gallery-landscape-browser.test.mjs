#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, mkdir } from "node:fs/promises";
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
const dbDir = await mkdtemp(join(tmpdir(), "hirmand-gallery-landscape-"));
const screenshotDir = join(root, "screenshots", "mobile-device-audit", "gallery-landscape-main-20261103");
const imageUrls = Array.from({ length: 8 }, (_, index) => `/images/isfahan-hero.jpg?qa-gallery=${index + 1}`);
const devices = [
  { name: "Galaxy J7 Pro", width: 640, height: 360, dpr: 3, ua: "Mozilla/5.0 (Linux; Android 8.1.0; SM-J701F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36" },
  { name: "Xiaomi Redmi Note 10", width: 915, height: 412, dpr: 2.75, ua: "Mozilla/5.0 (Linux; Android 13; Redmi Note 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36" },
  { name: "Google Pixel 7", width: 915, height: 412, dpr: 2.625, ua: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36" },
];

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
       values ($1,$2,'published',$3,'buy','apartment','محله آزمون گالری',120,2,1402,18500000000,
       'فایل آزمایشی محلی برای بررسی انتخاب واقعی تصاویر گالری در حالت افقی','[]'::jsonb,$4::jsonb,
       'مشاور آزمایشی','09130000000',now(),now(),now())
       on conflict (id) do nothing`,
      ["qa-gallery-landscape-001", "qa-gallery-landscape", "آپارتمان آزمایشی گالری افقی", JSON.stringify(imageUrls)],
    );
    const rows = await db.query("select count(*)::int as count from properties where id=$1 and status='published'", ["qa-gallery-landscape-001"]);
    assert.equal(Number(rows.rows[0]?.count), 1, "isolated database must contain the published gallery fixture");
    const storedMedia = await db.query("select images from properties where id=$1", ["qa-gallery-landscape-001"]);
    assert.deepEqual(storedMedia.rows[0]?.images, imageUrls, "the PGlite fixture must preserve all eight distinct gallery media references");
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
  await mkdir(screenshotDir, { recursive: true });
  const isolatedEnv = { ...process.env };
  for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_URL", "POSTGRES_URL_NON_POOLING", "POSTGRES_PRISMA_URL", "NEON_DATABASE_URL"]) isolatedEnv[key] = "";
  server = spawn(process.execPath, [join(root, "node_modules/vite/bin/vite.js"), "dev", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: mergeAppEnv(readAppEnv(root), { ...isolatedEnv, PGLITE_DATA_DIR: dbDir, NODE_ENV: "development", CI: "", PORT: String(port), HOST: "127.0.0.1" }),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  server.stdout.on("data", (chunk) => { serverLog += chunk.toString(); });
  server.stderr.on("data", (chunk) => { serverLog += chunk.toString(); });

  const propertyUrl = `${baseUrl}/properties/qa-gallery-landscape`;
  const deadline = Date.now() + 90_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Vite server exited early.\n${serverLog}`);
    try {
      const response = await fetch(propertyUrl, { signal: AbortSignal.timeout(2500) });
      if (response.status === 200) { ready = true; break; }
    } catch { /* server is still booting */ }
    await delay(500);
  }
  assert.ok(ready, `local property-detail route did not become ready.\n${serverLog}`);

  const launchOptions = { headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] };
  try {
    browser = await chromium.launch(launchOptions);
  } catch {
    browser = await chromium.launch({ ...launchOptions, channel: "chrome" });
  }

  const runtimeFailures = [];
  for (const device of devices) {
    const context = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      deviceScaleFactor: device.dpr,
      isMobile: true,
      hasTouch: true,
      userAgent: device.ua,
      locale: "fa-IR",
    });
    const page = await context.newPage();
    // Vite dev does not register Nitro's server/routes/api handlers; the
    // production API is covered by server-route tests, while this browser run
    // focuses on the real gallery UI and uses the documented public defaults.
    await page.route("**/api/public-watermark", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enabled: true, showLogo: true, showText: true, text: "املاک هیرمند", opacity: 0.82, size: 1 }),
    }));
    await page.addInitScript(() => {
      window.__qaShareCalls = [];
      window.__qaClipboardWrites = [];
      window.__qaShareMode = "fallback";
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data) => {
          window.__qaShareCalls.push(data);
          if (window.__qaShareMode === "fallback") throw new DOMException("No native share sheet", "NotAllowedError");
          if (window.__qaShareMode === "abort") throw new DOMException("Share cancelled", "AbortError");
        },
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async (value) => window.__qaClipboardWrites.push(value) },
      });
    });
    page.on("pageerror", (error) => runtimeFailures.push(`${device.name}: ${error.message}`));
    page.on("response", (response) => {
      if (response.status() >= 500 && new URL(response.url()).origin === baseUrl) runtimeFailures.push(`${device.name}: HTTP ${response.status()} ${response.url()}`);
    });
    await page.goto(propertyUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.locator(".property-gallery-main img[itemprop='image']").waitFor({ state: "visible" });
    await page.waitForFunction(() => {
      const image = document.querySelector(".property-gallery-main img[itemprop='image']");
      return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
    });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    const emptyPlayerStyle = await page.locator(".music-player-empty").evaluate((element) => {
      const style = getComputedStyle(element);
      return { display: style.display, pointerEvents: style.pointerEvents };
    }).catch(() => null);
    assert.ok(!emptyPlayerStyle || (emptyPlayerStyle.display === "none" && emptyPlayerStyle.pointerEvents === "none"), `${device.name}: empty music player must not cover page controls`);

    const geometry = await page.locator(".property-gallery").evaluate((gallery) => {
      const main = gallery.querySelector(".property-gallery-main");
      const rail = gallery.querySelector(".property-gallery-rail");
      const rect = (element) => {
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
      };
      return {
        gridColumns: getComputedStyle(gallery).gridTemplateColumns,
        railDirection: getComputedStyle(rail).flexDirection,
        railOverflowY: getComputedStyle(rail).overflowY,
        gallery: rect(gallery),
        main: rect(main),
        rail: rect(rail),
        thumbCount: rail.querySelectorAll(".property-gallery-thumb").length,
        rootScrollWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      };
    });

    assert.equal(geometry.thumbCount, imageUrls.length, `${device.name}: all eight image choices must be rendered`);
    assert.equal(geometry.railDirection, "column", `${device.name}: landscape thumbnails must form a vertical rail`);
    assert.ok(geometry.rail.width >= 68 && geometry.rail.width <= 76, `${device.name}: thumbnail rail width should remain 72px; got ${geometry.rail.width}`);
    assert.ok(geometry.main.width > device.width - 130, `${device.name}: main image should retain most of the viewport width; got ${geometry.main.width}px`);
    assert.ok(geometry.rail.height >= 130 && geometry.rail.height <= 172, `${device.name}: gallery rail should fit the short viewport; got ${geometry.rail.height}`);
    assert.ok(geometry.rootScrollWidth <= geometry.viewportWidth + 1, `${device.name}: page must not overflow horizontally (${geometry.rootScrollWidth} > ${geometry.viewportWidth})`);

    const thumbs = page.locator(".property-gallery-thumb");
    await page.waitForTimeout(700);
    await thumbs.nth(1).scrollIntoViewIfNeeded();
    await thumbs.nth(1).click();
    const secondSelected = await page.waitForFunction(() => document.querySelectorAll('.property-gallery-thumb[aria-current="true"]').length === 1 && document.querySelectorAll('.property-gallery-thumb[aria-current="true"]')[0]?.getAttribute("aria-label")?.includes("۲"), null, { timeout: 5_000 }).catch(() => null);
    if (!secondSelected) {
      const state = await page.evaluate(() => ({ active: [...document.querySelectorAll(".property-gallery-thumb")].map((button) => ({ label: button.getAttribute("aria-label"), current: button.getAttribute("aria-current"), active: button.classList.contains("is-active") })), main: document.querySelector(".property-gallery-main img[itemprop='image']")?.getAttribute("src") }));
      throw new Error(`${device.name}: clicking thumbnail two did not change the active image: ${JSON.stringify(state)}`);
    }
    const secondImage = await page.locator(".property-gallery-main img[itemprop='image']").getAttribute("src");
    assert.ok(secondImage?.includes("qa-gallery=2"), `${device.name}: selecting thumbnail two must change the main image; got ${secondImage}`);

    await thumbs.nth(7).scrollIntoViewIfNeeded();
    await thumbs.nth(7).click();
    await page.waitForFunction(() => document.querySelectorAll('.property-gallery-thumb[aria-current="true"]').length === 1 && document.querySelectorAll('.property-gallery-thumb[aria-current="true"]')[0]?.getAttribute("aria-label")?.includes("۸"));
    const lastImage = await page.locator(".property-gallery-main img[itemprop='image']").getAttribute("src");
    assert.ok(lastImage?.includes("qa-gallery=8"), `${device.name}: selecting the final scrolled thumbnail must change the main image; got ${lastImage}`);

    const imageState = await page.locator(".property-gallery-main img[itemprop='image']").evaluate((image) => ({ complete: image.complete, naturalWidth: image.naturalWidth, currentSrc: image.currentSrc }));
    assert.ok(imageState.complete && imageState.naturalWidth > 0, `${device.name}: selected gallery image must load successfully`);
    const shareButton = page.getByRole("button", { name: "اشتراک" }).last();
    await shareButton.scrollIntoViewIfNeeded();
    await shareButton.click();
    await page.waitForFunction(() => window.__qaShareCalls?.length === 1 && window.__qaClipboardWrites?.length === 1);
    const fallbackShare = await page.evaluate(() => ({ share: window.__qaShareCalls[0], copied: window.__qaClipboardWrites[0] }));
    assert.equal(fallbackShare.share?.url, page.url(), `${device.name}: native-share rejection must copy the exact property URL`);
    assert.equal(fallbackShare.copied, page.url(), `${device.name}: clipboard fallback must preserve the exact property URL`);
    await page.evaluate(() => { window.__qaShareMode = "success"; });
    await shareButton.click();
    await page.waitForFunction(() => window.__qaShareCalls?.length === 2);
    assert.equal(await page.evaluate(() => window.__qaClipboardWrites.length), 1, `${device.name}: successful native sharing must not also copy to clipboard`);
    await page.evaluate(() => { window.__qaShareMode = "abort"; });
    await shareButton.click();
    await page.waitForFunction(() => window.__qaShareCalls?.length === 3);
    assert.equal(await page.evaluate(() => window.__qaClipboardWrites.length), 1, `${device.name}: cancelling the native share sheet must not trigger a clipboard fallback`);
    const finalScroll = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, scrollX: window.scrollX }));
    assert.ok(finalScroll.scrollWidth <= finalScroll.clientWidth + 1 && Math.abs(finalScroll.scrollX) <= 1, `${device.name}: interactions must not introduce horizontal page scrolling`);

    await page.screenshot({ path: join(screenshotDir, `${device.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-landscape.png`), fullPage: false });
    console.log(`[gallery-landscape] PASS ${device.name} ${device.width}x${device.height}: rail=${geometry.rail.width}x${geometry.rail.height}, main=${geometry.main.width}x${geometry.main.height}, all 8 thumbnails, image switching and no horizontal overflow`);
    await context.close();
  }

  assert.deepEqual(runtimeFailures, [], `gallery browser runtime must remain clean: ${runtimeFailures.join("; ")}`);
} catch (error) {
  console.error("[gallery-landscape] FAIL");
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  if (serverLog) console.error(serverLog);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([new Promise((resolveExit) => server.once("exit", resolveExit)), delay(5000)]);
  }
}
