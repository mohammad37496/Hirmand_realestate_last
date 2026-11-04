import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const routePath = fileURLToPath(new URL("../src/routes/api/auth/$.ts", import.meta.url));
const source = readFileSync(routePath, "utf8");

test("Better Auth is mounted at the same-origin /api/auth catch-all", () => {
  assert.match(source, /createFileRoute\(["']\/api\/auth\/\$["']\)/);
  assert.match(source, /import\s*\{\s*auth\s*\}\s*from\s*["']@\/lib\/auth\/server["']/);
});

test("Better Auth handles both session reads and sign-in/sign-out writes", () => {
  assert.match(source, /GET\s*:\s*async\s*\(\{\s*request\s*\}\)\s*=>\s*auth\.handler\(request\)/);
  assert.match(source, /POST\s*:\s*async\s*\(\{\s*request\s*\}\)\s*=>\s*auth\.handler\(request\)/);
});

const smokePath = fileURLToPath(new URL("./browser-smoke.mjs", import.meta.url));
const smokeSource = readFileSync(smokePath, "utf8");

test("browser smoke requires a JSON 200 from the Better Auth session route", () => {
  assert.match(smokeSource, /new URL\(["']\/api\/auth\/get-session["'], url\)/);
  assert.match(smokeSource, /response.status\(\) === 200 && validJson/);
  assert.match(smokeSource, /if \(!authRouteCheck.ok\)/);
});
