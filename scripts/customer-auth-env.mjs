/** Validate the production-only settings required for persistent customer accounts. */
export function customerAuthEnvironmentErrors(env, hasDatabaseUrl) {
  if (env.NODE_ENV !== "production" || env.VITE_AUTH_ENABLED === "false") return [];

  const errors = [];
  if (!hasDatabaseUrl) errors.push("DATABASE_URL (persistent PostgreSQL connection)");

  const baseUrl = env.BETTER_AUTH_URL?.trim();
  if (!baseUrl) {
    errors.push("BETTER_AUTH_URL (for example https://hirmandrealestate.ir)");
  } else {
    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol !== "https:" || parsed.origin !== baseUrl.replace(/\/$/, "")) {
        errors.push("BETTER_AUTH_URL must be an HTTPS origin without a path");
      }
    } catch {
      errors.push("BETTER_AUTH_URL must be a valid HTTPS origin");
    }
  }

  if ((env.BETTER_AUTH_SECRET?.trim().length ?? 0) < 32) {
    errors.push("BETTER_AUTH_SECRET (at least 32 characters)");
  }
  if (env.VITE_GROK_OAUTH_ENABLED === "true") {
    if (!env.GROK_AUTH_CLIENT_ID?.trim()) errors.push("GROK_AUTH_CLIENT_ID");
    if (!env.GROK_AUTH_CLIENT_SECRET?.trim()) errors.push("GROK_AUTH_CLIENT_SECRET");
  }
  return errors;
}

/** A production instance must not serve account APIs against an unmigrated schema. */
export function shouldAbortOnCustomerAuthMigrationError(env) {
  return env.NODE_ENV === "production" && env.VITE_AUTH_ENABLED !== "false";
}
