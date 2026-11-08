/** Normalize a configured Better Auth URL to the exact browser Origin. */
/** @param {string} value @returns {string} */
export function normalizeBetterAuthOrigin(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("BETTER_AUTH_URL must be an HTTPS origin without a path");
  }
  return parsed.origin;
}
