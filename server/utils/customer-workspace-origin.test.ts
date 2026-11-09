import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertCustomerWorkspacePostOrigin } from "./customer-workspace-origin.ts";

const route = readFileSync(new URL("../../src/routes/api/customer-workspace.ts", import.meta.url), "utf8");

function statusOf(callback: () => void) {
  try {
    callback();
    return 200;
  } catch (error) {
    return Number((error as { statusCode?: number }).statusCode ?? 500);
  }
}

test("customer workspace POST rejects a missing Origin with 403", () => {
  assert.equal(statusOf(() => assertCustomerWorkspacePostOrigin({ origin: undefined, host: "hirmandrealestate.ir", requestOrigin: "https://hirmandrealestate.ir" })), 403);
});

test("customer workspace POST rejects a missing host context with 403", () => {
  assert.equal(statusOf(() => assertCustomerWorkspacePostOrigin({ origin: "https://hirmandrealestate.ir", host: undefined, requestOrigin: "https://hirmandrealestate.ir" })), 403);
});

test("customer workspace POST rejects a foreign Origin with 403", () => {
  assert.equal(statusOf(() => assertCustomerWorkspacePostOrigin({ origin: "https://attacker.example", host: "hirmandrealestate.ir", requestOrigin: "https://hirmandrealestate.ir" })), 403);
});

test("customer workspace POST accepts a matching Origin and host", () => {
  assert.equal(statusOf(() => assertCustomerWorkspacePostOrigin({ origin: "https://hirmandrealestate.ir", host: "hirmandrealestate.ir", requestOrigin: "https://hirmandrealestate.ir" })), 200);
});

test("customer workspace POST rejects a scheme mismatch even when the host matches", () => {
  assert.equal(statusOf(() => assertCustomerWorkspacePostOrigin({ origin: "http://hirmandrealestate.ir", host: "hirmandrealestate.ir", requestOrigin: "https://hirmandrealestate.ir" })), 403);
});

test("the customer workspace POST route enforces the fail-closed guard before authentication and body processing", () => {
  const post = route.slice(route.indexOf("async function saveWorkspace"), route.indexOf("export const Route"));
  assert.match(post, /assertCustomerWorkspacePostOrigin\(\{\s*origin:\s*request\.headers\.get\("origin"\),\s*host:\s*request\.headers\.get\("x-forwarded-host"\) \?\? request\.headers\.get\("host"\),\s*requestOrigin:\s*forwardedRequestOrigin\(request\),?\s*\}\)/);
  assert.ok(post.indexOf("assertCustomerWorkspacePostOrigin(") < post.indexOf("requireUserIdFromHeaders("));
  assert.ok(post.indexOf("assertCustomerWorkspacePostOrigin(") < post.indexOf("request.json()"));
  assert.match(post, /assertServerFnSameOrigin\(/, "retain the shared strict same-origin comparison");
  assert.match(route, /createFileRoute\("\/api\/customer-workspace"\)/,
    "run auth session resolution in a TanStack Start request context");
  assert.doesNotMatch(route, /getRequest\(\)/);
});
