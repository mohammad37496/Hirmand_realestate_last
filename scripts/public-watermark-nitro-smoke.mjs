#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverEntry = join(root, ".output", "server", "index.mjs");
assert.ok(existsSync(serverEntry), "build the Nitro production server before running this smoke test");

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

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
let server;
let serverLog = "";

try {
  const env = { ...process.env };
  for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_URL", "POSTGRES_URL_NON_POOLING", "POSTGRES_PRISMA_URL", "NEON_DATABASE_URL"]) env[key] = "";
  Object.assign(env, {
    NODE_ENV: "production",
    CI: "true",
    PORT: String(port),
    NITRO_PORT: String(port),
    HOST: "127.0.0.1",
    NITRO_HOST: "127.0.0.1",
    HIRMAND_ADMIN_KEY: "qa-only-public-watermark-smoke-key",
  });
  server = spawn(process.execPath, [serverEntry], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  server.stdout.on("data", (chunk) => { serverLog += chunk.toString(); });
  server.stderr.on("data", (chunk) => { serverLog += chunk.toString(); });

  let response;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Nitro exited before serving requests.\n${serverLog}`);
    try {
      response = await fetch(new URL("/api/public-watermark", baseUrl), { signal: AbortSignal.timeout(2_500) });
      break;
    } catch {
      await delay(250);
    }
  }
  assert.ok(response, `Nitro did not become ready.\n${serverLog}`);
  assert.equal(response.status, 200, `the production Nitro route must return a successful public settings response.\n${serverLog}`);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/i);
  assert.match(response.headers.get("cache-control") ?? "", /public, max-age=60/);
  const body = await response.json();
  assert.deepEqual(body, {
    enabled: true,
    showLogo: true,
    showText: true,
    text: "املاک هیرمند",
    opacity: 0.82,
    size: 1,
  });
  console.log("[public-watermark-nitro] PASS: the built Nitro server serves /api/public-watermark as JSON with the documented defaults and cache policy when no database is configured.");
} catch (error) {
  console.error("[public-watermark-nitro] FAIL");
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  if (serverLog) console.error(serverLog);
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([new Promise((resolveExit) => server.once("exit", resolveExit)), delay(5_000)]);
  }
}
