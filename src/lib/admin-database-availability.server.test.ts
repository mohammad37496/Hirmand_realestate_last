import assert from "node:assert/strict";
import { test } from "node:test";
import { assertAdminDatabaseConfigured } from "./admin-database-availability.server.ts";

test("unconfigured admin database is an explicit service-unavailable error", () => {
  assert.throws(
    () => assertAdminDatabaseConfigured("unconfigured", "پایگاه داده آماده نیست."),
    (error: unknown) => Boolean(error && typeof error === "object" && "statusCode" in error && error.statusCode === 503),
  );
});

test("configured database sources pass the availability guard", () => {
  assert.doesNotThrow(() => assertAdminDatabaseConfigured("postgres", "پایگاه داده آماده نیست."));
  assert.doesNotThrow(() => assertAdminDatabaseConfigured("pglite", "پایگاه داده آماده نیست."));
});
