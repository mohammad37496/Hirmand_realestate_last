/** Normalize a configured Better Auth URL to the exact browser Origin. */
/** @param {string} value @param {{ allowHttpLoopback?: boolean }} [options] @returns {string} */
export function normalizeBetterAuthOrigin(value, options = {}) {
  const parsed = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  const secure = parsed.protocol === "https:" || (options.allowHttpLoopback === true && loopback && parsed.protocol === "http:");
  if (!secure || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("BETTER_AUTH_URL must be an HTTPS origin without a path");
  }
  return parsed.origin;
}
