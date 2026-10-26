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
         'دادهٔ آزمایشی محلی برای آزمون رابط واقعی کارت ملک.', '[]'::jsonb, '[]'::jsonb,
         'مشاور آزمایشی','09130000000',now(),now(),now())
         on conflict (id) do nothing`,
        [id, slug, title, transaction, type, neighborhood, area, bedrooms, year, price],
      );
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
  server = spawn(process.execPath, [join(root, "scripts/with-app-env.mjs"), "vite", "dev", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: { ...isolatedEnv, PGLITE_DATA_DIR: dbDir, NODE_ENV: "development", CI: "" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  server.stdout.on("data", (chunk) => { serverLog += chunk.toString(); });
  server.stderr.on("data", (chunk) => { serverLog += chunk.toString(); });
}

async function waitForServer() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Local Vite server exited early.\n${serverLog}`);
    try {
      const response = await fetch(`${baseUrl}/properties`, { signal: AbortSignal.timeout(2500) });
      if (response.ok) return;
    } catch { /* server is still booting */ }
    await delay(500);
  }
  throw new Error(`Local Vite server did not become ready.\n${serverLog}`);
}

try {
  await seedDatabase();
  startServer();
  await waitForServer();
  const testScript = visualMode ? "desktop-property-card-visual-qa.mjs" : "property-card-actions-browser.test.mjs";
  const child = spawn(process.execPath, [join(root, "scripts", testScript)], {
    cwd: root,
    env: {
      ...process.env,
      PROPERTY_CARD_BROWSER_BASE_URL: baseUrl,
      PROPERTY_CARD_VISUAL_BASE_URL: `${baseUrl}/properties`,
      PROPERTY_CARD_VISUAL_SCREENSHOT_DIR: process.env.PROPERTY_CARD_VISUAL_SCREENSHOT_DIR || join(dbDir, "screenshots"),
    },
    stdio: "inherit",
    windowsHide: true,
  });
  const exitCode = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolveExit(code ?? (signal ? 1 : 0)));
  });
  if (exitCode !== 0) throw new Error(`Local property-card browser assertions failed with exit code ${exitCode}.`);
  console.log(`[property-card-local-browser] PASS (${visualMode ? "visual QA" : "action QA"}): real local app + isolated migrated PGlite database + 3 controlled published fixtures`);
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
