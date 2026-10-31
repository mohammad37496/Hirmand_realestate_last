/**
 * Acquire a session-scoped PostgreSQL advisory lock without waiting forever.
 * The caller must release the lock on the same client after acquisition.
 */
export async function acquireMigrationAdvisoryLock(client, key, options = {}) {
  const requestedTimeout = Number(options.timeoutMs ?? 30_000);
  const requestedInterval = Number(options.pollIntervalMs ?? 100);
  const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0
    ? Math.floor(requestedTimeout)
    : 30_000;
  const pollIntervalMs = Number.isFinite(requestedInterval) && requestedInterval > 0
    ? Math.max(1, Math.floor(requestedInterval))
    : 100;
  const startedAt = Date.now();

  while (true) {
    const result = await client.query(
      "SELECT pg_try_advisory_lock($1::bigint) AS acquired",
      [String(key)],
    );
    if (result.rows?.[0]?.acquired === true) return;

    const remainingMs = timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      throw new Error("Timed out waiting for database migration advisory lock after " + timeoutMs + "ms");
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, remainingMs)));
  }
}
