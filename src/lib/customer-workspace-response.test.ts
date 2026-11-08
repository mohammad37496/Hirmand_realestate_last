import assert from "node:assert/strict";
import test from "node:test";
import { customerWorkspaceStatusText } from "./customer-workspace-response.server.ts";

test("workspace database outage uses the correct 503 status text", () => {
  assert.equal(customerWorkspaceStatusText(503), "Service Unavailable");
});
