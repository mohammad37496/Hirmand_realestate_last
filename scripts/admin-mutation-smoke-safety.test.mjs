import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { assertSafeAdminSmokeDatabase, normalizeAdminSmokeTitleText } from "./admin-mutation-smoke-safety.mjs";

const source = readFileSync(new URL("./admin-mutation-smoke.mjs", import.meta.url), "utf8");

test("admin mutation smoke uses a per-run unique property title and checks DB safety before connecting", () => {
  assert.ok(source.includes("from \"node:crypto\""));
  assert.ok(source.includes("randomUUID()"));
  assert.ok(source.includes("-smoke-${randomUUID()}"));
  assert.ok(source.includes("assertSafeAdminSmokeDatabase(databaseUrl, process.env.ADMIN_SMOKE_ALLOW_REMOTE_DATABASE === \"1\")"));
  assert.ok(source.indexOf("assertSafeAdminSmokeDatabase(") < source.indexOf("new pg.Pool("));
  assert.ok(source.includes("delete from properties where title = $1"));
});

test("admin mutation smoke permits only local PostgreSQL by default", () => {
  assert.equal(assertSafeAdminSmokeDatabase("postgres://user:pass@localhost:5432/test"), "localhost");
  assert.equal(assertSafeAdminSmokeDatabase("postgres://user:pass@127.0.0.1:5432/test"), "127.0.0.1");
  assert.throws(() => assertSafeAdminSmokeDatabase("postgres://user:pass@db.example.com:5432/prod"), /remote database/i);
});

test("admin mutation smoke allows a remote database only after explicit opt-in", () => {
  assert.equal(assertSafeAdminSmokeDatabase("postgresql://user:pass@staging.example.com:5432/test", true), "staging.example.com");
});

test("admin mutation smoke rejects malformed and non-PostgreSQL database URLs", () => {
  assert.throws(() => assertSafeAdminSmokeDatabase("not a url"), /valid URL/i);
  assert.throws(() => assertSafeAdminSmokeDatabase("https://example.com"), /PostgreSQL protocol/i);
});


test("admin mutation smoke title comparison accepts Persian and Arabic digit rendering", () => {
  assert.equal(normalizeAdminSmokeTitleText("smoke-f۶۴۱b۱ad-۵۹۹۷-٠e١f"), "smoke-f641b1ad-5997-0e1f");
});