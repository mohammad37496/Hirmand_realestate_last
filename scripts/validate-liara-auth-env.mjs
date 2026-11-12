#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { isMainModule } from "./with-app-env.mjs";
import { normalizeBetterAuthOrigin } from "./auth-origin.mjs";

const DATABASE_KEYS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "NEON_DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
];

/** Read the JSON rows emitted by `liara env list --output=json`. */
export function liaraEnvironmentMap(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : [payload?.envs, payload?.project?.envs, payload?.data, payload?.variables].find(Array.isArray);
  if (!Array.isArray(rows)) throw new Error("Liara environment response did not contain a variable list");

  return new Map(rows.flatMap((row) => {
    const key = typeof row?.key === "string" ? row.key : typeof row?.name === "string" ? row.name : null;
    if (!key) return [];
    const value = row.value == null ? "" : String(row.value).trim();
    return [[key, value]];
  }));
}

/** Summarize production auth settings without returning or printing any values. */
export function summarizeLiaraCustomerAuthEnvironment(payload) {
  const env = liaraEnvironmentMap(payload);
  const databaseKey = DATABASE_KEYS.find((key) => env.get(key));
  let databaseStatus = "missing";
  if (databaseKey) {
    try {
      const databaseUrl = new URL(env.get(databaseKey));
      databaseStatus = ["postgres:", "postgresql:"].includes(databaseUrl.protocol) && databaseUrl.hostname
        ? `valid (${databaseKey})`
        : `invalid (${databaseKey})`;
    } catch {
      databaseStatus = `invalid (${databaseKey})`;
    }
  }

  const redisUrl = env.get("UPSTASH_REDIS_REST_URL") ?? "";
  let redisUrlStatus = redisUrl ? "invalid" : "missing";
  if (redisUrl) {
    try {
      const parsedRedisUrl = new URL(redisUrl);
      redisUrlStatus = parsedRedisUrl.protocol === "https:" && parsedRedisUrl.hostname ? "valid (HTTPS URL)" : "invalid (must be HTTPS URL)";
    } catch {
      redisUrlStatus = "invalid (must be HTTPS URL)";
    }
  }
  const redisTokenStatus = env.get("UPSTASH_REDIS_REST_TOKEN") ? "present" : "missing";
  const authFlag = env.get("VITE_AUTH_ENABLED");
  const authUrl = env.get("BETTER_AUTH_URL");
  let authUrlStatus = authUrl ? "valid" : "missing";
  if (authUrl) {
    try {
      normalizeBetterAuthOrigin(authUrl);
    } catch {
      authUrlStatus = "invalid";
    }
  }
  const secretLength = env.get("BETTER_AUTH_SECRET")?.length ?? 0;
  const oauthFlag = env.get("VITE_GROK_OAUTH_ENABLED");
  const resendApiKey = env.get("RESEND_API_KEY") ?? "";
  const resendApiKeyValid = resendApiKey.startsWith("re_") && resendApiKey.length > 3;
  const resendSender = env.get("RESEND_FROM_EMAIL") ?? "";
  const senderEmail = resendSender.match(/<([^<>]+)>/)?.[1] ?? resendSender;
  const resendSenderValid = /^[^\s@]+@hirmandrealestate\.ir$/i.test(senderEmail);

  return {
    UPSTASH_REDIS_REST_URL: redisUrlStatus,
    UPSTASH_REDIS_REST_TOKEN: redisTokenStatus,
    VITE_AUTH_ENABLED: authFlag === "true" ? "enabled" : authFlag === "false" ? "disabled" : "missing (application default: enabled)",
    DATABASE_URL: databaseStatus,
    BETTER_AUTH_URL: authUrlStatus,
    BETTER_AUTH_SECRET: secretLength >= 32 ? "valid (at least 32 characters)" : secretLength ? "too short" : "missing",
    VITE_GROK_OAUTH_ENABLED: oauthFlag === "true" ? "enabled" : oauthFlag === "false" ? "disabled" : "missing",
    GROK_AUTH_CLIENT_ID: env.get("GROK_AUTH_CLIENT_ID") ? "present" : "missing",
    GROK_AUTH_CLIENT_SECRET: env.get("GROK_AUTH_CLIENT_SECRET") ? "present" : "missing",
    RESEND_API_KEY: resendApiKeyValid ? "valid format (re_ prefix)" : resendApiKey ? "invalid format (must start with re_)" : "missing",
    RESEND_FROM_EMAIL: resendSenderValid ? "valid (hirmandrealestate.ir)" : resendSender ? "invalid (must use hirmandrealestate.ir)" : "missing",
  };
}

/** Return missing configuration names only; never expose any environment values. */
export function validateLiaraCustomerAuthEnvironment(payload) {
  const env = liaraEnvironmentMap(payload);
  if (env.get("VITE_AUTH_ENABLED") === "false") {
    return ["VITE_AUTH_ENABLED must be true to enable customer accounts"];
  }

  const errors = [];
  const redisUrl = env.get("UPSTASH_REDIS_REST_URL");
  if (!redisUrl) {
    errors.push("UPSTASH_REDIS_REST_URL");
  } else {
    try {
      const parsedRedisUrl = new URL(redisUrl);
      if (parsedRedisUrl.protocol !== "https:" || !parsedRedisUrl.hostname) errors.push("UPSTASH_REDIS_REST_URL must be a valid HTTPS URL");
    } catch {
      errors.push("UPSTASH_REDIS_REST_URL must be a valid HTTPS URL");
    }
  }
  if (!env.get("UPSTASH_REDIS_REST_TOKEN")) errors.push("UPSTASH_REDIS_REST_TOKEN");
  const databaseKey = DATABASE_KEYS.find((key) => env.get(key));
  if (!databaseKey) {
    errors.push(`one persistent PostgreSQL URL (${DATABASE_KEYS.join(", ")})`);
  } else {
    try {
      const databaseUrl = new URL(env.get(databaseKey));
      if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol) || !databaseUrl.hostname) {
        errors.push(`${databaseKey} must be a valid PostgreSQL connection URL`);
      }
    } catch {
      errors.push(`${databaseKey} must be a valid PostgreSQL connection URL`);
    }
  }
  const baseUrl = env.get("BETTER_AUTH_URL");
  if (!baseUrl) {
    errors.push("BETTER_AUTH_URL");
  } else {
    try {
      normalizeBetterAuthOrigin(baseUrl);
    } catch {
      errors.push("BETTER_AUTH_URL must be an HTTPS origin without a path");
    }
  }
  if ((env.get("BETTER_AUTH_SECRET")?.length ?? 0) < 32) errors.push("BETTER_AUTH_SECRET (at least 32 characters)");
  if (env.get("VITE_GROK_OAUTH_ENABLED") === "true") {
    if (!env.get("GROK_AUTH_CLIENT_ID")) errors.push("GROK_AUTH_CLIENT_ID");
    if (!env.get("GROK_AUTH_CLIENT_SECRET")) errors.push("GROK_AUTH_CLIENT_SECRET");
  }
  return errors;
}

/** Password recovery is unavailable until Resend is configured, but its absence must not block unrelated app releases. */
export function customerPasswordRecoveryEnvironmentWarnings(payload) {
  const env = liaraEnvironmentMap(payload);
  const warnings = [];
  const resendApiKey = env.get("RESEND_API_KEY") ?? "";
  if (!resendApiKey) {
    warnings.push("RESEND_API_KEY is missing; customer password-recovery emails cannot be sent.");
  } else if (!resendApiKey.startsWith("re_") || resendApiKey.length <= 3) {
    warnings.push("RESEND_API_KEY has an invalid format; a Resend API key must start with re_.");
  }
  const sender = env.get("RESEND_FROM_EMAIL") ?? "";
  const senderEmail = sender.match(/<([^<>]+)>/)?.[1] ?? sender;
  if (!/^[^\s@]+@hirmandrealestate\.ir$/i.test(senderEmail)) {
    warnings.push("RESEND_FROM_EMAIL is missing or must use the verified hirmandrealestate.ir domain.");
  }
  return warnings;
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: node scripts/validate-liara-auth-env.mjs <liara-env-json>");
    process.exit(2);
  }

  let payload;
  try {
    payload = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    console.error("[liara-auth-env] Could not parse the Liara environment listing as JSON; values were not printed.");
    process.exit(2);
  }

  let errors;
  let warnings;
  let summary;
  try {
    summary = summarizeLiaraCustomerAuthEnvironment(payload);
    errors = validateLiaraCustomerAuthEnvironment(payload);
    warnings = customerPasswordRecoveryEnvironmentWarnings(payload);
  } catch {
    console.error("[liara-auth-env] Liara returned an unexpected environment listing; values were not printed.");
    process.exit(2);
  }
  console.log("[liara-auth-env] Runtime configuration summary (values redacted):");
  for (const [key, status] of Object.entries(summary)) console.log(`- ${key}: ${status}`);
  if (warnings.length) {
    console.warn("[liara-auth-env] WARNING: password recovery is not ready:");
    for (const warning of warnings) console.warn(`- ${warning}`);
  }
  if (errors.length) {
    console.error("[liara-auth-env] Deployment blocked; missing required customer account settings:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log("[liara-auth-env] Required customer account settings are present (values redacted).");
}

if (isMainModule(import.meta.url)) {
  main();
}
