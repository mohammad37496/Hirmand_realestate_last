// @ts-check
/**
 * Migration bookkeeping shared by the two appliers — `scripts/prestart-migrate.mjs`
 * (Liara deploy, `readdir`) and `src/lib/db.ts` (PGLite development, `import.meta.glob`).
 *
 * Applied files are keyed by BASENAME, so the same file applies once no matter
 * which directory it is globbed from. That is what makes the auth schema safe to
 * copy from `migrations/auth/` into `migrations/` when an app turns sign-in on:
 * a database that already has `0001_auth.sql` will not re-run it.
 *
 * Neither applier descends into subdirectories, so `migrations/auth/*.sql` is
 * out of scope for both until it is copied up.
 */

/**
 * The `_migrations` key for a migration path (or bare filename).
 * @param {string} path
 * @returns {string}
 */
export function migrationName(path) {
  return path.split("/").pop() ?? path;
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isMigrationFile(path) {
  return path.endsWith(".sql");
}

/**
 * Migrations in `paths` that are not yet in `applied`, in apply order. Duplicate basenames fail closed because basename is the database key.
 * Non-`.sql` entries (a `readdir` also yields `migrations/auth/`) are dropped.
 * @param {Iterable<string>} paths
 * @param {Iterable<string>} applied
 * @returns {Array<{ name: string, path: string }>}
 */
export function pendingMigrations(paths, applied) {
  const done = new Set(applied);
  const migrations = [...paths]
    .filter(isMigrationFile)
    .map((path) => ({ name: migrationName(path), path }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const seen = new Set();
  for (const { name, path } of migrations) {
    if (seen.has(name)) {
      throw new Error(
        `Duplicate migration basename "${name}" detected (including "${path}"). ` +
          "Migration basenames are the database keys and must be unique.",
      );
    }
    seen.add(name);
  }

  return migrations.filter(({ name }) => !done.has(name));
}

export const CUSTOMER_AUTH_MIGRATIONS = Object.freeze([
  "0001_auth.sql",
  "0058_customer_workspace.sql",
  "0059_customer_workspace_revision.sql",
  "0101_auth_rate_limit.sql",
]);

export const PROPERTY_CONSULTANT_RELATION_MIGRATIONS = Object.freeze([
  "0103_property_consultant_relation.sql",
]);

export const LEAD_CONSULTANT_RELATION_MIGRATIONS = Object.freeze([
  "0104_lead_consultant_relation.sql",
]);

export const ADMIN_RATE_LIMIT_MIGRATIONS = Object.freeze([
  "0106_admin_rate_limits.sql",
]);

/**
 * Fail closed when an auth-enabled deployment is missing a required root migration.
 * @param {Iterable<string>} paths
 * @param {readonly string[]} [required]
 */
export function assertRequiredMigrationFiles(paths, required = CUSTOMER_AUTH_MIGRATIONS) {
  const available = new Set([...paths].filter(isMigrationFile).map(migrationName));
  const missing = required.filter((name) => !available.has(name));
  if (missing.length) {
    throw new Error(`Required customer-auth migration file(s) missing from migrations/: ${missing.join(", ")}`);
  }
}

/**
 * Fail closed unless every required customer-auth migration is recorded as applied.
 * @param {Iterable<string>} applied
 * @param {readonly string[]} [required]
 */
export function assertRequiredMigrationLedger(applied, required = CUSTOMER_AUTH_MIGRATIONS) {
  const recorded = new Set(applied);
  const missing = required.filter((name) => !recorded.has(name));
  if (missing.length) {
    throw new Error(`Required customer-auth migration(s) absent from _migrations: ${missing.join(", ")}`);
  }
}
