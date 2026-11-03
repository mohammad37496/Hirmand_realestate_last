#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createServer as createNetServer } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { pendingMigrations } from "./migration-plan.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dbDir = await mkdtemp(join(tmpdir(), "hirmand-property-card-pglite-"));
async function findFreePort() {
  const probe = createNetServer();
  await new Promise((resolveListen, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolveListen);
  });
  const address = probe.address();
  assert.ok(address && typeof address === "object", "OS must assign an ephemeral test port");
  await new Promise((resolveClose, reject) => probe.close((error) => error ? reject(error) : resolveClose()));
  return address.port;
}
const port = await findFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const visualMode = process.argv[2] === "visual";
const j7ProMode = ["j7-pro", "site-j7-pro", "site-j7-pro-landscape"].includes(process.argv[2]);
const deviceMatrixMode = process.argv[2] === "site-device-matrix";
const adminOnlyMode = process.argv[2] === "site-admin-responsive";
const publicSearchMode = process.argv[2] === "public-search";
const fullSiteMode = process.argv[2] === "site-responsive" || process.argv[2] === "site-j7-pro" || process.argv[2] === "site-j7-pro-landscape" || deviceMatrixMode || adminOnlyMode || publicSearchMode;
const responsiveMode = !adminOnlyMode && !deviceMatrixMode && (process.argv[2] === "responsive" || j7ProMode || fullSiteMode);
const nitroMode = fullSiteMode;
const adminAuditMode = adminOnlyMode || process.env.RESPONSIVE_SMOKE_ADMIN_AUDIT === "1";
let server;
let serverLog = "";

async function seedDatabase() {
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
    const fixtures = [
      ["pcard-fixture-001", "qa-apartment-long-title", "آپارتمان دوخوابه نوساز با نورگیری عالی و دسترسی مناسب در محلهٔ آزمایشی هیرمند", "buy", "apartment", "محلهٔ آزمایشی", 123, 2, 1402, "18500000000"],
      ["pcard-fixture-002", "qa-rent-villa", "ویلای آزمایشی برای اجاره", "rent", "villa", "محلهٔ دوم", 180, 3, 1400, ""],
      ["pcard-fixture-003", "qa-office", "دفتر کار آزمایشی", "sell", "office", "محلهٔ سوم", 76, 1, 1398, "7200000000"],
    ];
    for (const [id, slug, title, transaction, type, neighborhood, area, bedrooms, year, price] of fixtures) {
      await db.query(
        `insert into properties (id, slug, status, title, transaction_type, property_type, neighborhood,
         area_m2, bedrooms, built_year, price, deposit, rent, description, features, images,
         contact_name, contact_phone, published_at, created_at, updated_at)
         values ($1,$2,'published',$3,$4,$5,$6,$7,$8,$9,nullif($10,'')::numeric,null, null,
         'دادهٔ آزمایشی محلی برای آزمون رابط واقعی کارت ملک.', '[]'::jsonb,
         case when $1 = 'pcard-fixture-001' then '["/images/type-apartment.jpg","/images/type-villa.jpg"]'::jsonb else '[]'::jsonb end,
         'مشاور آزمایشی','09130000000',now(),now(),now())
         on conflict (id) do nothing`,
        [id, slug, title, transaction, type, neighborhood, area, bedrooms, year, price],
      );
    }
    if (publicSearchMode) {
      for (let index = 1; index <= 49; index += 1) {
        const suffix = String(index).padStart(3, "0");
        await db.query(
          `insert into properties (id, slug, status, title, transaction_type, property_type, neighborhood,
           area_m2, bedrooms, built_year, price, description, features, images, contact_name, contact_phone,
           created_at, updated_at, published_at)
           values ($1,$2,'published',$3,'buy','apartment','محله آزمون جستجوی هوشمند',90,2,1401,4500000000,
           'آپارتمان آزمایشی برای آزمون صفحه‌بندی جستجو','[]'::jsonb,'[]'::jsonb,'آزمون','09130000000',
           now() - ($4::int * interval '1 second'),now() - ($4::int * interval '1 second'),now())
           on conflict (id) do nothing`,
          [`qa-smart-apartment-${suffix}`, `qa-smart-apartment-${suffix}`, `آپارتمان آزمایشی ${suffix}`, index],
        );
      }
      for (let index = 1; index <= 205; index += 1) {
        const suffix = String(index).padStart(3, "0");
        await db.query(
          `insert into properties (id, slug, status, title, transaction_type, property_type, neighborhood,
           area_m2, bedrooms, built_year, price, description, features, images, contact_name, contact_phone,
           latitude, longitude, created_at, updated_at, published_at)
           values ($1,$2,'published',$3,'buy','villa','محله فایل‌های نزدیک',180,3,1400,8200000000,
           'ویلای آزمایشی دارای مختصات برای آزمون صفحه‌بندی اطراف','[]'::jsonb,'[]'::jsonb,'آزمون','09130000000',
           32.65 + ($4::int * 0.00005),51.67,now() - ($4::int * interval '1 second'),now() - ($4::int * interval '1 second'),now())
           on conflict (id) do nothing`,
          [`qa-nearby-villa-${suffix}`, `qa-nearby-villa-${suffix}`, `ویلای نزدیک آزمایشی ${suffix}`, index],
        );
      }
    }
    const count = (await db.query("select count(*)::int as count from properties where id like 'pcard-fixture-%' and status='published'")).rows[0]?.count;
    assert.equal(Number(count), 3, "isolated PGlite database must contain three published property fixtures");
  } finally {
    await db.close();
  }
}

function startServer() {
  // The application prefers DATABASE_URL over PGLITE_DATA_DIR. Remove every
  // supported PostgreSQL connection variable so QA cannot connect to or
  // mutate a developer/deployment database by inheriting the shell environment.
  const isolatedEnv = { ...process.env };
  for (const key of [
    "DATABASE_URL",
    "DATABASE_URL_UNPOOLED",
    "POSTGRES_URL",
    "POSTGRES_URL_NON_POOLING",
    "POSTGRES_PRISMA_URL",
    "NEON_DATABASE_URL",
  ]) {
    delete isolatedEnv[key];
  }
  const serverArgs = nitroMode
    ? [join(root, ".output", "server", "index.mjs")]
    : [join(root, "scripts/with-app-env.mjs"), "vite", "dev", "--host", "127.0.0.1", "--port", String(port)];
  if (nitroMode) assert.ok(existsSync(serverArgs[0]), "full-site responsive QA requires a freshly built Nitro server; run npm run build first");
  server = spawn(process.execPath, serverArgs, {
    cwd: root,
    env: {
      ...isolatedEnv,
      PGLITE_DATA_DIR: dbDir,
      NODE_ENV: nitroMode ? (adminAuditMode ? "development" : "production") : "development",
      PORT: String(port),
      NITRO_PORT: String(port),
      HOST: "127.0.0.1",
      NITRO_HOST: "127.0.0.1",
      CI: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  server.stdout.on("data", (chunk) => { serverLog += chunk.toString(); });
  server.stderr.on("data", (chunk) => { serverLog += chunk.toString(); });
}

async function waitForServer() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Local ${nitroMode ? "Nitro" : "Vite"} server exited early.\n${serverLog}`);
    try {
      const response = await fetch(`${baseUrl}/properties`, { signal: AbortSignal.timeout(2500) });
      if (response.ok) return;
    } catch { /* server is still booting */ }
    await delay(500);
  }
  throw new Error(`Local ${nitroMode ? "Nitro" : "Vite"} server did not become ready.\n${serverLog}`);
}

try {
  await seedDatabase();
  if (nitroMode) {
    const runtimeCopy = spawnSync(process.execPath, [join(root, "scripts/copy-pglite-runtime.mjs")], {
      cwd: root,
      env: { ...process.env, PGLITE_DATA_DIR: dbDir },
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(runtimeCopy.status, 0, `Nitro QA could not provision the isolated PGlite runtime.\n${runtimeCopy.stdout}\n${runtimeCopy.stderr}`);
  }
  startServer();
  await waitForServer();
  if (!adminOnlyMode) {
    const testScript = publicSearchMode
      ? "public-search-browser-smoke.mjs"
      : deviceMatrixMode
      ? "mobile-device-profile-smoke.mjs"
      : responsiveMode
        ? "responsive-layout-smoke.mjs"
        : visualMode ? "desktop-property-card-visual-qa.mjs" : "property-card-actions-browser.test.mjs";
    const childArgs = [join(root, "scripts", testScript), ...(responsiveMode || publicSearchMode ? [baseUrl] : [])];
    const child = spawn(process.execPath, childArgs, {
      cwd: root,
      env: {
        ...process.env,
        PROPERTY_CARD_BROWSER_BASE_URL: baseUrl,
        PROPERTY_CARD_VISUAL_BASE_URL: `${baseUrl}/properties`,
        PROPERTY_CARD_VISUAL_SCREENSHOT_DIR: process.env.PROPERTY_CARD_VISUAL_SCREENSHOT_DIR || join(dbDir, "screenshots"),
        PGLITE_DATA_DIR: dbDir,
        ...(deviceMatrixMode ? {
          QA_BASE_URL: baseUrl,
          QA_DEVICE_SCREENSHOT_DIR: process.env.QA_DEVICE_SCREENSHOT_DIR || join(root, "screenshots", "mobile-device-audit", "device-profiles"),
          QA_DEVICE_REPORT_PATH: process.env.QA_DEVICE_REPORT_PATH || join(root, "screenshots", "mobile-device-audit", "device-profiles", "report.json"),
        } : {}),
        ...(publicSearchMode ? { QA_BASE_URL: baseUrl } : {}),
        BROWSER_SMOKE_PROPERTY_ID: "pcard-fixture-001",
        BROWSER_SMOKE_PROPERTY_SLUG: "qa-apartment-long-title",
        ...(responsiveMode ? {
          ...(process.argv[2] === "site-j7-pro-landscape" ? { RESPONSIVE_SMOKE_J7_PRO_LANDSCAPE: "1" } : j7ProMode ? { RESPONSIVE_SMOKE_J7_PRO: "1" } : {}),
          ...(fullSiteMode ? { RESPONSIVE_SMOKE_FULL_ROUTES: "1" } : { RESPONSIVE_SMOKE_ONLY_PROPERTIES: "1" }),
          RESPONSIVE_SCREENSHOT_DIR: process.env.RESPONSIVE_SCREENSHOT_DIR || join(dbDir, "responsive-screenshots"),
        } : {}),
      },
      stdio: "inherit",
      windowsHide: true,
    });
    const exitCode = await new Promise((resolveExit, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolveExit(code ?? (signal ? 1 : 0)));
    });
    if (exitCode !== 0) throw new Error(`Local property-card browser assertions failed with exit code ${exitCode}.`);
  }

  if (adminAuditMode) {
    assert.ok(nitroMode, "admin responsive QA requires the built Nitro server");
    assert.ok(process.env.HIRMAND_ADMIN_KEY?.trim(), "admin responsive QA requires a temporary local HIRMAND_ADMIN_KEY");
    const adminAudit = spawnSync(process.execPath, [join(root, "scripts/admin-visual-audit.mjs")], {
      cwd: root,
      env: {
        ...process.env,
        PGLITE_DATA_DIR: dbDir,
        QA_BASE_URL: baseUrl,
        QA_VIEWPORTS: process.env.RESPONSIVE_ADMIN_VIEWPORTS || "360x640",
        QA_DEVICE_SCALE_FACTOR: process.env.RESPONSIVE_ADMIN_DPR || "3",
        QA_TOUCH: process.env.RESPONSIVE_ADMIN_TOUCH || "1",
        QA_SCREENSHOT_DIR: process.env.RESPONSIVE_ADMIN_SCREENSHOT_DIR || join(root, "artifacts", "responsive-site-audit-20261102", "admin-responsive"),
        QA_SCREENSHOTS: process.env.RESPONSIVE_ADMIN_SCREENSHOTS || "1",
        QA_REPORT_PATH: process.env.RESPONSIVE_ADMIN_REPORT_PATH || join(root, "artifacts", "responsive-site-audit-20261102", "admin-responsive", "report.json"),
        QA_QUIET: process.env.RESPONSIVE_ADMIN_QUIET || "0",
        QA_STUB_ADMIN_APIS: "0",
      },
      stdio: "inherit",
      windowsHide: true,
    });
    assert.equal(adminAudit.status, 0, `Admin responsive visual audit failed with exit code ${adminAudit.status ?? "unknown"}.`);
  }

  console.log(`[property-card-local-browser] PASS (${adminOnlyMode ? "admin responsive visual audit" : publicSearchMode ? "public search and nearby pagination browser workflows" : deviceMatrixMode ? "27-device portrait/landscape profile matrix" : process.argv[2] === "site-j7-pro-landscape" ? "Galaxy J7 Pro landscape device smoke" : j7ProMode ? "Galaxy J7 Pro portrait device smoke" : fullSiteMode ? "full-site responsive smoke" : responsiveMode ? "responsive smoke" : visualMode ? "visual QA" : "action QA"}): real local app + isolated migrated PGlite database + controlled published fixtures`);
} catch (error) {
  console.error("[property-card-local-browser] FAIL");
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  if (serverLog) console.error(serverLog);
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([new Promise((resolveExit) => server.once("exit", resolveExit)), delay(5000)]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  await rm(dbDir, { recursive: true, force: true });
}
