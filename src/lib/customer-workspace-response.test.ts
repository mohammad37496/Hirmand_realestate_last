import assert from "node:assert/strict";
import test from "node:test";
import {
  customerWorkspaceErrorResponse,
  customerWorkspacePrivateHeaders,
  customerWorkspaceStatusText,
} from "./customer-workspace-response.server.ts";

test("workspace database outage uses the correct 503 status text", () => {
  assert.equal(customerWorkspaceStatusText(503), "Service Unavailable");
});

test("workspace responses remain private and uncached, including errors", async () => {
  const headers = customerWorkspacePrivateHeaders();
  assert.equal(headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(headers.get("vary"), "Cookie, Authorization");

  const response = customerWorkspaceErrorResponse(Object.assign(new Error("database unavailable"), { statusCode: 503 }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.deepEqual(await response.json(), {
    error: true,
    status: 503,
    statusText: "Service Unavailable",
    message: "Workspace service unavailable",
  });
});
