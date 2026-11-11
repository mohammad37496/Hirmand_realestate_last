import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  assertRequiredMigrationFiles,
  assertRequiredMigrationLedger,
  CUSTOMER_AUTH_MIGRATIONS,
  LEAD_CONSULTANT_RELATION_MIGRATIONS,
  PROPERTY_CONSULTANT_RELATION_MIGRATIONS,
  isMigrationFile,
  migrationName,
  pendingMigrations,
} from "./migration-plan.mjs";
import { projectRoot } from "./with-app-env.mjs";

const AUTH_MIGRATION = "0001_auth.sql";

/**
 * The auth-on copy of the Better Auth schema and its source, or null when the
 * app has turned sign-in on.
 */
function authSchemaCopy(root) {
  const copy = join(root, "migrations", AUTH_MIGRATION);
  const source = join(root, "migrations/auth", AUTH_MIGRATION);
  if (!existsSync(copy) || !existsSync(source)) return null;
  return { copy: readFileSync(copy, "utf8"), source: readFileSync(source, "utf8") };
}

test("_migrations keys on basename, not path", () => {
  assert.equal(migrationName("/migrations/0002_todos.sql"), "0002_todos.sql");
  assert.equal(migrationName("migrations/auth/0001_auth.sql"), "0001_auth.sql");
  assert.equal(migrationName("0001_auth.sql"), "0001_auth.sql");
});

test("a file already applied from another directory does not re-apply", () => {
  // The auth-on path copies migrations/auth/0001_auth.sql into the globbed
  // directory; a database that already has it must not run it twice.
  assert.deepEqual(pendingMigrations(["/migrations/0001_auth.sql"], ["0001_auth.sql"]), []);
});

test("pending migrations are returned in name order", () => {
  assert.deepEqual(
    pendingMigrations(
      ["/migrations/0003_c.sql", "/migrations/0001_a.sql", "/migrations/0002_b.sql"],
      ["0001_a.sql"],
    ),
    [
      { name: "0002_b.sql", path: "/migrations/0002_b.sql" },
      { name: "0003_c.sql", path: "/migrations/0003_c.sql" },
    ],
  );
});

test("customer-auth migration verification rejects a missing root migration file", () => {
  assert.throws(
    () => assertRequiredMigrationFiles(["0001_auth.sql"]),
    /0058_customer_workspace\.sql/,
  );
  assert.throws(
    () => assertRequiredMigrationFiles(["0001_auth.sql", "0058_customer_workspace.sql"]),
    /0059_customer_workspace_revision\.sql/,
  );
  assert.throws(
    () => assertRequiredMigrationFiles(["0001_auth.sql", "0058_customer_workspace.sql", "0059_customer_workspace_revision.sql"]),
    /0101_auth_rate_limit\.sql/,
  );
});

test("customer-auth migration verification rejects a missing ledger row", () => {
  assert.throws(
    () => assertRequiredMigrationLedger(["0001_auth.sql", "0058_customer_workspace.sql"]),
    /0059_customer_workspace_revision\.sql/,
  );
  assert.throws(
    () => assertRequiredMigrationLedger(["0001_auth.sql", "0058_customer_workspace.sql", "0059_customer_workspace_revision.sql"]),
    /0101_auth_rate_limit\.sql/,
  );
});

test("customer-auth migration verification accepts all required files and ledger rows", () => {
  assert.deepEqual(CUSTOMER_AUTH_MIGRATIONS, ["0001_auth.sql", "0058_customer_workspace.sql", "0059_customer_workspace_revision.sql", "0101_auth_rate_limit.sql"]);
  assert.doesNotThrow(() => assertRequiredMigrationFiles(CUSTOMER_AUTH_MIGRATIONS));
  assert.doesNotThrow(() => assertRequiredMigrationLedger(CUSTOMER_AUTH_MIGRATIONS));
});

test("property-consultant relation migration is required in every production deploy ledger", () => {
  assert.deepEqual(PROPERTY_CONSULTANT_RELATION_MIGRATIONS, ["0103_property_consultant_relation.sql"]);
  assert.doesNotThrow(() => assertRequiredMigrationFiles(PROPERTY_CONSULTANT_RELATION_MIGRATIONS, PROPERTY_CONSULTANT_RELATION_MIGRATIONS));
  assert.doesNotThrow(() => assertRequiredMigrationLedger(PROPERTY_CONSULTANT_RELATION_MIGRATIONS, PROPERTY_CONSULTANT_RELATION_MIGRATIONS));
  assert.throws(() => assertRequiredMigrationFiles([], PROPERTY_CONSULTANT_RELATION_MIGRATIONS), /0103_property_consultant_relation\.sql/);
  assert.throws(() => assertRequiredMigrationLedger([], PROPERTY_CONSULTANT_RELATION_MIGRATIONS), /0103_property_consultant_relation\.sql/);
});

test("CRM lead-consultant relation migration is required in every production deploy ledger", () => {
  assert.deepEqual(LEAD_CONSULTANT_RELATION_MIGRATIONS, ["0104_lead_consultant_relation.sql"]);
  assert.doesNotThrow(() => assertRequiredMigrationFiles(LEAD_CONSULTANT_RELATION_MIGRATIONS, LEAD_CONSULTANT_RELATION_MIGRATIONS));
  assert.doesNotThrow(() => assertRequiredMigrationLedger(LEAD_CONSULTANT_RELATION_MIGRATIONS, LEAD_CONSULTANT_RELATION_MIGRATIONS));
  assert.throws(() => assertRequiredMigrationFiles([], LEAD_CONSULTANT_RELATION_MIGRATIONS), /0104_lead_consultant_relation\.sql/);
  assert.throws(() => assertRequiredMigrationLedger([], LEAD_CONSULTANT_RELATION_MIGRATIONS), /0104_lead_consultant_relation\.sql/);
});

test("non-.sql entries are dropped (readdir also yields the auth/ directory)", () => {
  assert.equal(isMigrationFile("auth"), false);
  assert.deepEqual(pendingMigrations(["auth", "README.md"], []), []);
});

test("duplicate migration basenames fail closed instead of silently dropping one", () => {
  assert.throws(
    () =>
      pendingMigrations(
        ["/migrations/0019_featured_expiry.sql", "/migrations/0019_featured_expiry.sql"],
        [],
      ),
    /Duplicate migration basename/,
  );
});

test("this workspace contains no duplicate migration basenames", () => {
  const migrationsDir = join(projectRoot(), "migrations");
  const names = readdirSync(migrationsDir).filter(isMigrationFile);
  assert.doesNotThrow(() => pendingMigrations(names, []));
});

test("the auth schema is copied into the globbed directory when sign-in is enabled", () => {
  const migrationsDir = join(projectRoot(), "migrations");
  const pending = pendingMigrations(readdirSync(migrationsDir), []);
  assert.equal(pending.some((item) => item.name === AUTH_MIGRATION), true);
  assert.ok(readdirSync(join(migrationsDir, "auth")).includes(AUTH_MIGRATION));
});

test("this workspace's auth schema copy is byte-identical to its source", () => {
  // An edited copy diverges silently: basename keying skips it on a database
  // that already ran the original, and applies it on a fresh PGLite preview.
  const pair = authSchemaCopy(projectRoot());
  if (pair === null) return; // sign-in off — nothing has been copied up
  assert.equal(
    pair.copy,
    pair.source,
    "migrations/0001_auth.sql has been edited — it must stay a verbatim copy of migrations/auth/0001_auth.sql",
  );
});

test("the copy check reads both files and catches an edit", () => {
  const root = mkdtempSync(join(tmpdir(), "auth-schema-"));
  mkdirSync(join(root, "migrations/auth"), { recursive: true });
  writeFileSync(join(root, "migrations/auth", AUTH_MIGRATION), "create table t ();\n");
  assert.equal(authSchemaCopy(root), null);

  writeFileSync(join(root, "migrations", AUTH_MIGRATION), "create table t ();\n");
  const same = authSchemaCopy(root);
  assert.equal(same.copy, same.source);

  writeFileSync(join(root, "migrations", AUTH_MIGRATION), "create table t (x int);\n");
  const drifted = authSchemaCopy(root);
  assert.notEqual(drifted.copy, drifted.source);
});
