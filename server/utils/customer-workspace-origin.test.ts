import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertCustomerWorkspacePostOrigin } from "./customer-workspace-origin.ts";

const route = readFileSync(new URL("../routes/api/customer-workspace.post.ts", import.meta.url), "utf8");

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
  assert.match(route, /assertCustomerWorkspacePostOrigin\(\{\s*origin:\s*getHeader\(event, "origin"\),\s*host:\s*getHeader\(event, "x-forwarded-host"\) \?\? getHeader\(event, "host"\),\s*requestOrigin:\s*getRequestURL\(event, \{ xForwardedHost: true, xForwardedProto: true \}\)\.origin,?\s*\}\)/);
  assert.ok(route.indexOf("assertCustomerWorkspacePostOrigin(") < route.indexOf("requireUserIdFromHeaders("));
  assert.ok(route.indexOf("assertCustomerWorkspacePostOrigin(") < route.indexOf("readBody(event)"));
  assert.match(route, /assertSameOrigin\(event\)/, "retain the shared strict same-origin comparison");
});
