import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveDatabaseUrl, resolveMigrationDatabaseUrl, sanitizePostgresConnectionString } from "./resolve-database-url.mjs";

test("removes unsupported startup options from Postgres URLs", () => {
  const raw = "postgresql://user:pass@example.com/db?sslmode=require&options=statement_timeout%3D8000";
  const sanitized = sanitizePostgresConnectionString(raw);
  assert.ok(sanitized.includes("sslmode=require"));
  assert.equal(new URL(sanitized).searchParams.has("options"), false);
});

test("leaves non-Postgres URLs untouched", () => {
  const raw = "https://example.com/db?options=keep";
  assert.equal(sanitizePostgresConnectionString(raw), raw);
});

test("runtime resolver preserves preferred key ordering", () => {
  const result = resolveDatabaseUrl({
    DATABASE_URL: "postgresql://pooled/db?options=statement_timeout%3D1",
    DATABASE_URL_UNPOOLED: "postgresql://direct/db",
  });
  assert.equal(result.key, "DATABASE_URL");
  assert.ok(result.url?.includes("options=statement_timeout"));
});

test("migration resolver prefers direct database URL", () => {
  const result = resolveMigrationDatabaseUrl({
    DATABASE_URL: "postgresql://pooled/db",
    DATABASE_URL_UNPOOLED: "postgresql://direct/db",
  });
  assert.equal(result.key, "DATABASE_URL_UNPOOLED");
});
