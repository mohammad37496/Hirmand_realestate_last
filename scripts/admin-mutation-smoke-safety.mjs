const LOOPBACK_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Refuse accidental writes to remote databases unless an isolated remote test DB is explicitly opted into. */
export function assertSafeAdminSmokeDatabase(databaseUrl, allowRemote = false) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid URL for the admin mutation smoke.");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the PostgreSQL protocol for the admin mutation smoke.");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!LOOPBACK_DATABASE_HOSTS.has(hostname) && !allowRemote) {
    throw new Error(
      "Refusing to run the admin mutation smoke against a remote database. Use an isolated test database, or explicitly set ADMIN_SMOKE_ALLOW_REMOTE_DATABASE=1 only for a verified non-production database.",
    );
  }
  return hostname;
}
