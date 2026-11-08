import assert from "node:assert/strict";
import test from "node:test";
import { requireCustomerWorkspaceDatabase } from "./customer-workspace-database.server.mjs";

test("an unconfigured workspace database fails closed with HTTP 503", () => {
  assert.throws(
    () => requireCustomerWorkspaceDatabase("unconfigured"),
    (error) => {
      if (!error || typeof error !== "object") return false;
      const candidate = /** @type {{ statusCode?: number; statusMessage?: string }} */ (error);
      return candidate.statusCode === 503 && candidate.statusMessage === "Workspace database is unavailable";
    },
  );
});

test("a configured workspace database is allowed to serve the workspace", () => {
  assert.equal(requireCustomerWorkspaceDatabase("postgres"), undefined);
});
