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
import { mergeAppEnv, readAppEnv } from "./with-app-env.mjs";
import { pendingMigrations } from "./migration-plan.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dbDir = await mkdtemp(join(tmpdir(), "hirmand-search-browser-"));

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

    for (let index = 1; index <= 50; index += 1) {
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

    const counts = await db.query(
      `select
         (select count(*)::int from properties where status='published' and property_type='apartment' and title like 'آپارتمان آزمایشی %') as apartments,
         (select count(*)::int from properties where status='published' and latitude is not null and longitude is not null and title like 'ویلای نزدیک آزمایشی %') as nearby`,
    );
    assert.equal(Number(counts.rows[0]?.apartments), 50, "isolated database must contain exactly 50 smart-search fixtures");
    assert.equal(Number(counts.rows[0]?.nearby), 205, "isolated database must contain exactly 205 geolocated nearby fixtures");
  } finally {
    await db.close();
  }
}

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
let server;
let serverLog = "";
let browserLog = "";

try {
  await seedDatabase();
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

  const deadline = Date.now() + 90_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Vite server exited early.\n${serverLog}`);
    try {
      const response = await fetch(`${baseUrl}/smart-search`, { signal: AbortSignal.timeout(2500) });
      if (response.status === 200) { ready = true; break; }
    } catch { /* server is still booting */ }
    await delay(500);
  }
  assert.ok(ready, `local smart-search route did not become ready.\n${serverLog}`);

  const browser = spawn(process.execPath, [join(root, "scripts/public-search-browser-smoke.mjs"), baseUrl], {
    cwd: root,
    env: { ...process.env, QA_BASE_URL: baseUrl },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const result = await new Promise((resolveExit, reject) => {
    browser.stdout.on("data", (chunk) => { browserLog += chunk.toString(); });
    browser.stderr.on("data", (chunk) => { browserLog += chunk.toString(); });
    browser.once("error", reject);
    browser.once("exit", (code, signal) => resolveExit({ code, signal }));
  });
  assert.equal(result.code, 0, `public-search browser workflows failed (${result.signal ?? result.code}).\n${browserLog}\n${serverLog}`);
  process.stdout.write(browserLog);
} catch (error) {
  console.error("[public-search-browser] FAIL");
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  if (browserLog) console.error(browserLog);
  if (serverLog) console.error(serverLog);
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([new Promise((resolveExit) => server.once("exit", resolveExit)), delay(5000)]);
  }
}
