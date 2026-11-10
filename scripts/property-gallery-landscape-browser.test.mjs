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
const screenshotDir = process.env.GALLERY_SCREENSHOT_DIR?.trim()
  ? resolve(process.env.GALLERY_SCREENSHOT_DIR)
  : join(root, "screenshots", "mobile-device-audit", "gallery-landscape-main-20261103");
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
  const devWatermarkProbe = await fetch(new URL("/api/public-watermark", baseUrl), { signal: AbortSignal.timeout(5_000) });
  assert.equal(devWatermarkProbe.status, 404, `Vite dev does not mount Nitro server routes; the browser fixture must cover this endpoint (got ${devWatermarkProbe.status}: ${(await devWatermarkProbe.text()).slice(0, 240)})`);

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
      const railStyle = getComputedStyle(rail);
      const thumbElements = [...rail.querySelectorAll(".property-gallery-thumb")];
      const rect = (element) => {
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
      };
      return {
        gridColumns: getComputedStyle(gallery).gridTemplateColumns,
        railDisplay: railStyle.display,
        railDirection: railStyle.flexDirection,
        railFlexWrap: railStyle.flexWrap,
        railWritingDirection: railStyle.direction,
        railOverflowX: railStyle.overflowX,
        railOverflowY: railStyle.overflowY,
        railGridAutoFlow: railStyle.gridAutoFlow,
        railGridTemplateRows: railStyle.gridTemplateRows,
        gallery: rect(gallery),
        main: rect(main),
        rail: rect(rail),
        thumbCount: thumbElements.length,
        visibleThumbCount: thumbElements.filter((thumb) => getComputedStyle(thumb).display !== "none").length,
        thumbRects: thumbElements.map(rect),
        railClientWidth: rail.clientWidth,
        railScrollWidth: rail.scrollWidth,
        rootScrollWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      };
    });
    assert.equal(geometry.thumbCount, imageUrls.length, `${device.name}: all eight image choices must be rendered`);
    if (device.width <= 720) {
      assert.equal(geometry.railDisplay, "flex", `${device.name}: phone thumbnails must use the horizontal flex rail`);
      assert.equal(geometry.railDirection, "row", `${device.name}: phone thumbnails must flow horizontally`);
      assert.equal(geometry.railFlexWrap, "nowrap", `${device.name}: phone thumbnails must stay on one swipeable row`);
      assert.equal(geometry.railWritingDirection, "rtl", `${device.name}: phone thumbnails must preserve RTL reading order`);
      assert.equal(geometry.railOverflowX, "auto", `${device.name}: phone rail must expose horizontal scrolling`);
      assert.equal(geometry.railOverflowY, "hidden", `${device.name}: phone rail must not scroll vertically`);
      assert.equal(geometry.visibleThumbCount, imageUrls.length, `${device.name}: all eight phone thumbnails must be visible in the horizontal rail`);
      assert.ok(geometry.rail.width >= device.width - 30, `${device.name}: horizontal rail should span the gallery width; got ${geometry.rail.width}px`);
      assert.ok(Math.abs(geometry.thumbRects[0].width - 68) <= 1 && Math.abs(geometry.thumbRects[0].height - 54) <= 1, `${device.name}: phone thumbnails should remain 68×54px; got ${geometry.thumbRects[0].width}×${geometry.thumbRects[0].height}`);
      assert.ok(geometry.railScrollWidth >= geometry.railClientWidth, `${device.name}: horizontal rail must preserve its scrollable content width`);
      assert.ok(geometry.thumbRects[7].x < geometry.thumbRects[0].x, `${device.name}: the last thumbnail must follow the first from right to left`);
      assert.ok(geometry.main.width > device.width - 40, `${device.name}: phone main image should use the available gallery width; got ${geometry.main.width}px`);
    } else {
      assert.equal(geometry.railDisplay, "grid", `${device.name}: tablet thumbnails must use the vertical CSS grid rail`);
      assert.equal(geometry.railGridAutoFlow, "row", `${device.name}: tablet thumbnails must flow down the vertical grid`);
      assert.equal(geometry.railGridTemplateRows.split(" ").length, imageUrls.length, `${device.name}: tablet rail must expose one vertical grid row per thumbnail`);
      assert.equal(geometry.visibleThumbCount, imageUrls.length, `${device.name}: all eight tablet thumbnails must be visible in the vertical rail`);
      assert.ok(geometry.rail.width >= 94 && geometry.rail.width <= 102, `${device.name}: tablet rail width should remain 98px; got ${geometry.rail.width}`);
      assert.equal(geometry.railOverflowY, "hidden", `${device.name}: all tablet thumbnails must fit without a clipped vertical scroller`);
      assert.ok(geometry.rail.height >= imageUrls.length * 54 && geometry.rail.height <= geometry.main.height + 24, `${device.name}: vertical rail must fit all eight 68×54px thumbnails beside the main image; got ${geometry.rail.height}px`);
      const visibleThumbs = geometry.thumbRects;
      assert.ok(visibleThumbs.every((thumb) => Math.abs(thumb.x - visibleThumbs[0].x) <= 1), `${device.name}: visible tablet thumbnails must share one vertical column`);
      assert.ok(visibleThumbs.every((thumb, index) => index === 0 || thumb.y > visibleThumbs[index - 1].y), `${device.name}: visible tablet thumbnails must progress down the rail`);
      assert.ok(visibleThumbs.every((thumb) => Math.abs(thumb.width - 68) <= 1 && Math.abs(thumb.height - 54) <= 1), `${device.name}: tablet thumbnails should remain 68×54px`);
      assert.ok(geometry.main.width > device.width * 0.38, `${device.name}: main image should retain a substantial share of the tablet gallery; got ${geometry.main.width}px`);
    }
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

    if (device.width <= 720) {
      await thumbs.nth(7).scrollIntoViewIfNeeded();
      await thumbs.nth(7).click();
    } else {
      const nextImage = page.getByRole("button", { name: "تصویر بعدی" });
      for (let step = 0; step < imageUrls.length - 2; step += 1) {
        await nextImage.click();
      }
    }
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
    await page.getByText("لینک فایل کپی شد.").waitFor({ state: "hidden", timeout: 5_000 });
    const finalScroll = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, scrollX: window.scrollX }));
    assert.ok(finalScroll.scrollWidth <= finalScroll.clientWidth + 1 && Math.abs(finalScroll.scrollX) <= 1, `${device.name}: interactions must not introduce horizontal page scrolling`);

    await page.screenshot({ path: join(screenshotDir, `${device.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-landscape.png`), fullPage: false, scale: "css" });
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
