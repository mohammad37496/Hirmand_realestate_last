#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createServer as createNetServer } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { chromium } from "playwright";
import { installAdminApiStubs } from "./admin-fixtures.mjs";
import { mergeAppEnv, readAppEnv } from "./with-app-env.mjs";
import { pendingMigrations } from "./migration-plan.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dbDir = await mkdtemp(join(tmpdir(), "hirmand-confirm-focus-"));
const adminKey = "qa-local-confirm-focus-20261112";

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
        await tx.exec(await (await import("node:fs/promises")).readFile(join(root, "migrations", migration.path), "utf8"));
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

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fa-IR" });
    const page = await context.newPage();
    await installAdminApiStubs(page, baseUrl);
    await page.goto(`${baseUrl}/admin`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const password = page.locator('input[type="password"]');
    if (await password.count()) {
      await password.fill(adminKey);
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(1500);
    }

    await page.addScriptTag({
      type: "module",
      content: `
        import { mountAdminConfirmDialogFocusFixture } from "/scripts/admin-confirm-dialog-focus-fixture.tsx";
        window.__qaConfirmDialogFocusRoot = mountAdminConfirmDialogFocusFixture(document.body);
      `,
    });

    const confirmDialog = page.getByRole("alertdialog", { name: "QA confirmation dialog" });
    const confirmResult = page.locator("[data-confirm-result]");
    for (const flow of ["cancel", "confirm", "escape"]) {
      const opener = page.locator(`[data-confirm-flow="${flow}"]`);
      await opener.click();
      await confirmDialog.waitFor({ state: "visible" });
      assert.equal(
        await confirmDialog.locator(".btn-gold").evaluate((element) => element === document.activeElement),
        true,
        `${flow} confirmation should initially focus the confirm action`,
      );
      if (flow === "cancel") {
        await page.screenshot({ path: join(root, "screenshots", "admin-confirm-dialog-focus-restore-20261112.png") });
        await confirmDialog.getByRole("button", { name: "انصراف" }).click();
      } else if (flow === "confirm") {
        await confirmDialog.getByRole("button", { name: "تأیید" }).click();
      } else {
        await page.keyboard.press("Escape");
      }
      await confirmDialog.waitFor({ state: "hidden" });
      assert.equal(
        await opener.evaluate((element) => element === document.activeElement),
        true,
        `${flow} close should restore focus to the exact opener`,
      );
      assert.equal(await confirmResult.textContent(), flow === "confirm" ? "confirmed" : "cancelled", `${flow} should settle the confirmation promise`);
    }
    await context.close();
  } finally {
    await browser.close();
  }

  console.log("[admin-confirm-dialog-focus-browser] PASS: cancel, confirm and Escape all restore focus to the exact invoking button; initial focus remains on the confirm action.");
} catch (error) {
  console.error("[admin-confirm-dialog-focus-browser] FAIL");
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  if (serverLog) console.error(serverLog);
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([new Promise((resolveExit) => server.once("exit", resolveExit)), delay(5000)]);
  }
}
