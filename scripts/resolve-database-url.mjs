/**
 * Resolve PostgreSQL URLs from standard provider-neutral environment names.
 * Runtime prefers pooled endpoints; migrations prefer direct/unpooled.
 */

const POOLED_KEYS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "NEON_DATABASE_URL",
];

/**
 * Remove libpq startup options that may be rejected by managed PostgreSQL providers.
 * In particular, some generated connection strings contain options=statement_timeout=...,
 * which Neon may reject as an unsupported startup parameter. Query-level timeouts
 * are configured by node-postgres.
 *
 * @param {string} raw
 */
export function sanitizePostgresConnectionString(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      return raw;
    }
    url.searchParams.delete("options");
    url.searchParams.delete("statement_timeout");
    return url.toString();
  } catch {
    return raw;
  }
}

/**
 * @param {string[]} keys
 * @param {Record<string, string | undefined>} env
 * @returns {{ key: string | null, url: string | undefined }}
 */
function firstEnv(keys, env) {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return { key, url: value };
  }
  return { key: null, url: undefined };
}

/** Best URL for app queries (connection pooling). */
export function resolveDatabaseUrl(env = process.env) {
  const pooled = firstEnv(POOLED_KEYS, env);
  if (pooled.url) return pooled;
  return firstEnv(
    ["DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING"],
    env,
  );
}

/** Best URL for DDL / migrations (direct connection). */
export function resolveMigrationDatabaseUrl(env = process.env) {
  const unpooled = firstEnv(
    ["DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING"],
    env,
  );
  if (unpooled.url) return unpooled;
  return resolveDatabaseUrl(env);
}

export function listDbRelatedEnvKeys(env = process.env) {
  return Object.keys(env)
    .filter((k) => /DATABASE|POSTGRES|NEON|PG/i.test(k))
    .sort();
}
