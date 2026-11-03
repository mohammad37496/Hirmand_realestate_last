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
  console.log("[admin-overlay-focus-browser] PASS: real mobile drawer and desktop command palette both focus their first control, wrap Tab/Shift+Tab, close with Escape and restore focus to the opener.");
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
