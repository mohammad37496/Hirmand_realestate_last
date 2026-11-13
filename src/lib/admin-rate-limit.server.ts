/**
 * Server-only throttling for the admin surface.
 *
 * The admin panel is protected by a single shared key, so every unauthenticated
 * request to the login endpoint is a brute-force opportunity.
 *
 * Production counters live in PostgreSQL so every server instance shares the
 * same atomic budget. A process-local Map is permitted only for development
 * when no database is configured; production never falls back to local state.
 */

import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { createError, getHeader, getRequestIP, type H3Event } from "h3";
import { dbSource, getSql, type Sql } from "./db.ts";

type Bucket = { hits: number[]; blockedUntil: number };

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const BLOCK_MS = 15 * 60 * 1000;

type ThrottleInput = {
  now: number;
  windowMs: number;
  maxAttempts: number;
  blockMs: number;
};

function nextBucket(bucket: Bucket | undefined, input: ThrottleInput) {
  if (bucket && bucket.blockedUntil > input.now) {
    return {
      bucket,
      result: {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.ceil((bucket.blockedUntil - input.now) / 1000),
      } satisfies RateLimitResult,
    };
  }

  const hits = (bucket?.hits ?? []).filter((hit) => input.now - hit <= input.windowMs);
  hits.push(input.now);
  if (hits.length > input.maxAttempts) {
    return {
      bucket: { hits: [], blockedUntil: input.now + input.blockMs },
      result: {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.ceil(input.blockMs / 1000),
      } satisfies RateLimitResult,
    };
  }

  return {
    bucket: { hits, blockedUntil: 0 },
    result: { allowed: true, remaining: Math.max(0, input.maxAttempts - hits.length), retryAfterSeconds: 0 } satisfies RateLimitResult,
  };
}

function pruneMemory(store: Map<string, Bucket>, now: number) {
  for (const [key, bucket] of store) {
    const expired = bucket.blockedUntil < now && bucket.hits.every((hit) => now - hit > WINDOW_MS);
    if (expired) store.delete(key);
  }
}

/* ------------------------------------------------------------------ */
/* In-memory store — development only when no database is configured  */
/* ------------------------------------------------------------------ */

const globalRef = globalThis as typeof globalThis & {
  __adminRateLimits__?: Map<string, Bucket>;
};

function memoryStore() {
  const buckets = (globalRef.__adminRateLimits__ ??= new Map());
  return {
    get: (key: string) => buckets.get(key),
    set: (key: string, bucket: Bucket) => buckets.set(key, bucket),
    delete: (key: string) => buckets.delete(key),
    prune: (now: number) => pruneMemory(buckets, now),
  };
}

/* ------------------------------------------------------------------ */
/* PostgreSQL store — shared and atomic across every server instance  */
/* ------------------------------------------------------------------ */

let cleanupCounter = 0;

/** Testable PostgreSQL operation; the SQL function serializes each key with a row lock. */
export async function consumeAdminAttemptWithSql(
  sql: Sql,
  key: string,
  maxAttempts = MAX_ATTEMPTS,
): Promise<RateLimitResult> {
  const rows = await sql.query<{
    allowed: boolean;
    remaining: number | string;
    retry_after_seconds: number | string;
  }>("select allowed,remaining,retry_after_seconds from consume_admin_rate_limit($1,$2,$3,$4)", [
    key,
    maxAttempts,
    WINDOW_MS / 1000,
    BLOCK_MS / 1000,
  ]);
  const row = rows[0];
  if (!row) throw new Error("PostgreSQL admin rate limiter returned no result");

  if (++cleanupCounter % 100 === 0) {
    await sql.query(
      "delete from admin_rate_limits where (blocked_until is null or blocked_until < clock_timestamp()) and (cardinality(attempts)=0 or attempts[cardinality(attempts)] < clock_timestamp() - interval '2 hours')",
    ).catch((error) => console.warn("[admin-rate-limit] cleanup failed", error));
  }
  return {
    allowed: row.allowed,
    remaining: Number(row.remaining),
    retryAfterSeconds: Number(row.retry_after_seconds),
  };
}

export async function clearAdminAttemptsWithSql(sql: Sql, key: string) {
  await sql.query("delete from admin_rate_limits where key = $1", [key]);
}

function databaseUnavailable(error: unknown): never {
  console.error("[admin-rate-limit] PostgreSQL limiter unavailable", error instanceof Error ? error.message : error);
  throw createError({ statusCode: 503, statusMessage: "سرویس محدودسازی درخواست‌ها در دسترس نیست." });
}

/** Stable rate-limit identity. User-Agent is caller-controlled and must not split a caller's bucket. */
export function clientFingerprint(event: H3Event): string {
  const ip = resolveClientIp(getRequestIP(event), getHeader(event, "x-forwarded-for"));
  return createHash("sha256").update(ip).digest("hex");
}

/**
 * Liara Node PaaS routes requests through one reverse proxy and documents
 * trusted-proxy count 1. Its rightmost X-Forwarded-For entry is the client IP;
 * earlier entries may be caller supplied, so never select the leftmost value.
 */
export function resolveClientIp(remoteIp: string | undefined, forwardedFor?: string | null) {
  const forwardedEntries = forwardedFor?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? [];
  const trustedClientIp = forwardedEntries.at(-1);
  return trustedClientIp && isIP(trustedClientIp) ? trustedClientIp : remoteIp || "unknown";
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/** Records an attempt and reports whether the caller may continue. */
export async function consumeAdminAttempt(
  key: string,
  maxAttempts = MAX_ATTEMPTS,
): Promise<RateLimitResult> {
  if (process.env.NODE_ENV === "production" && dbSource !== "postgres") {
    return databaseUnavailable(new Error("A shared PostgreSQL DATABASE_URL is required for production rate limiting"));
  }
  if (dbSource === "unconfigured" && process.env.NODE_ENV !== "production") {
    const now = Date.now();
    const memory = memoryStore();
    memory.prune(now);
    const next = nextBucket(memory.get(key), {
      now, windowMs: WINDOW_MS, maxAttempts, blockMs: BLOCK_MS,
    });
    memory.set(key, next.bucket);
    return next.result;
  }
  try {
    return await consumeAdminAttemptWithSql(await getSql(), key, maxAttempts);
  } catch (error) {
    return databaseUnavailable(error);
  }
}

/** Clears the counter after a successful login so the admin is not punished. */
export async function clearAdminAttempts(key: string) {
  if (process.env.NODE_ENV === "production" && dbSource !== "postgres") {
    return databaseUnavailable(new Error("A shared PostgreSQL DATABASE_URL is required for production rate limiting"));
  }
  if (dbSource === "unconfigured" && process.env.NODE_ENV !== "production") {
    memoryStore().delete(key);
    return;
  }
  try {
    await clearAdminAttemptsWithSql(await getSql(), key);
  } catch (error) {
    return databaseUnavailable(error);
  }
}

export function tooManyAttemptsError(retryAfterSeconds: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return createError({
    statusCode: 429,
    statusMessage: `تلاش‌های ناموفق بیش از حد مجاز است. لطفاً ${minutes.toLocaleString("fa-IR")} دقیقه دیگر تلاش کنید.`,
  });
}

/**
 * Rejects state-changing admin requests that did not come from this origin.
 * The session cookie is `SameSite=Lax`, so a cross-site form POST already
 * loses it; this closes the remaining gap (a same-site subdomain, or a browser
 * that attaches the cookie anyway) without needing a CSRF token round-trip.
 */
export function assertSameOrigin(event: H3Event) {
  assertOriginMatchesHost({
    method: event.method,
    origin: getHeader(event, "origin"),
    host: getHeader(event, "x-forwarded-host") ?? getHeader(event, "host"),
  });
}

/** Same check for TanStack server functions, which expose headers directly. */
export function assertServerFnSameOrigin(readHeader: (name: string) => string | null) {
  assertOriginMatchesHost({
    method: "POST",
    origin: readHeader("origin"),
    host: readHeader("x-forwarded-host") ?? readHeader("host"),
  });
}

function assertOriginMatchesHost(input: {
  method: string | undefined;
  origin: string | null | undefined;
  host: string | null | undefined;
}) {
  const method = (input.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;

  const origin = input.origin;
  if (!origin) return;

  const host = input.host;
  if (!host) return;

  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    throw createError({ statusCode: 403, statusMessage: "مبدأ درخواست معتبر نیست." });
  }

  if (originHost.toLowerCase() !== host.split(",")[0]!.trim().toLowerCase()) {
    throw createError({
      statusCode: 403,
      statusMessage: "این درخواست از مبدأ دیگری ارسال شده و انجام نشد.",
    });
  }
}
