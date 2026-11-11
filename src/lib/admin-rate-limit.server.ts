/**
 * Server-only throttling for the admin surface.
 *
 * The admin panel is protected by a single shared key, so every unauthenticated
 * request to the login endpoint is a brute-force opportunity.
 *
 * The counter lives in Redis when `UPSTASH_REDIS_REST_URL` /
 * `UPSTASH_REDIS_REST_TOKEN` are set, and in a process-local Map otherwise.
 * That split is not a nicety: the production build runs on Vercel, where each
 * request can land on a different instance. A Map there resets on every cold
 * start, so an attacker rotating instances would never trip the limit. The
 * in-memory path is still the right default for `npm run dev` and for anyone
 * self-hosting a single Node process, and it keeps this module dependency-free.
 */

import { createHash } from "node:crypto";
import { createError, getHeader, getRequestIP, type H3Event } from "h3";

type Bucket = { hits: number[]; blockedUntil: number };

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const BLOCK_MS = 15 * 60 * 1000;

/** Key TTL: long enough to cover the block, short enough to self-clean. */
const KEY_TTL_SECONDS = Math.ceil((WINDOW_MS + BLOCK_MS) / 1000);

type ThrottleInput = {
  now: number;
  windowMs: number;
  maxAttempts: number;
  blockMs: number;
  ttlSeconds: number;
};

interface ThrottleStore {
  consume(key: string, input: ThrottleInput): Promise<RateLimitResult>;
  delete(key: string): Promise<void>;
}

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
/* In-memory store — single process, dev / self-hosted                */
/* ------------------------------------------------------------------ */

const globalRef = globalThis as typeof globalThis & {
  __adminRateLimits__?: Map<string, Bucket>;
  __adminThrottleStoreBroken?: boolean;
};

function memoryStore(): ThrottleStore {
  const buckets = (globalRef.__adminRateLimits__ ??= new Map());
  return {
    consume(key, input) {
      // The read/modify/write happens synchronously before yielding to another request.
      pruneMemory(buckets, input.now);
      const next = nextBucket(buckets.get(key), input);
      buckets.set(key, next.bucket);
      return Promise.resolve(next.result);
    },
    async delete(key) {
      buckets.delete(key);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Upstash Redis store — shared across every serverless instance      */
/* ------------------------------------------------------------------ */

const REST_URL = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function redisCommand<T>(...command: (string | number)[]): Promise<T> {
  return fetch(`${REST_URL}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${REST_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
  }).then(async (response) => {
    if (!response.ok) throw new Error(`Redis responded ${response.status}`);
    return (await response.json()) as { result: T };
  }).then((payload) => payload.result);
}

const REDIS_CONSUME_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
local bucket = { hits = {}, blockedUntil = 0 }
if raw then
  local ok, parsed = pcall(cjson.decode, raw)
  if ok and type(parsed) == 'table' then bucket = parsed end
end
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local maxAttempts = tonumber(ARGV[3])
local blockMs = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])
local blockedUntil = tonumber(bucket.blockedUntil or 0)
if blockedUntil > now then
  return { 0, 0, math.ceil((blockedUntil - now) / 1000) }
end
local hits = {}
for _, hit in ipairs(bucket.hits or {}) do
  local timestamp = tonumber(hit)
  if timestamp and now - timestamp <= window then table.insert(hits, timestamp) end
end
table.insert(hits, now)
if #hits > maxAttempts then
  redis.call('SET', KEYS[1], cjson.encode({ hits = {}, blockedUntil = now + blockMs }), 'EX', ttl)
  return { 0, 0, math.ceil(blockMs / 1000) }
end
redis.call('SET', KEYS[1], cjson.encode({ hits = hits, blockedUntil = 0 }), 'EX', ttl)
return { 1, math.max(0, maxAttempts - #hits), 0 }
`;

function redisStore(): ThrottleStore {
  return {
    async consume(key, input) {
      const result = await redisCommand<Array<number | string>>(
        "EVAL",
        REDIS_CONSUME_SCRIPT,
        1,
        `hirmand:throttle:${key}`,
        input.now,
        input.windowMs,
        input.maxAttempts,
        input.blockMs,
        input.ttlSeconds,
      );
      return {
        allowed: Number(result[0]) === 1,
        remaining: Number(result[1]) || 0,
        retryAfterSeconds: Number(result[2]) || 0,
      };
    },
    async delete(key) {
      await redisCommand("DEL", `hirmand:throttle:${key}`);
    },
  };
}

/**
 * Picks the store and swallows Redis outages.
 *
 * A throttling layer that throws takes the login page down with it, which is a
 * worse failure than the one it prevents — so a Redis error degrades to the
 * local Map and says so once, rather than blocking every admin request.
 */
function store(): ThrottleStore {
  if (!REST_URL || !REST_TOKEN) return memoryStore();
  const shared = redisStore();
  const fallback = memoryStore();
  return {
    consume: (key, input) => shared.consume(key, input).catch((error) => {
      warnOnce(error);
      return fallback.consume(key, input);
    }),
    delete: (key) => shared.delete(key).catch((error) => {
      warnOnce(error);
      return fallback.delete(key);
    }),
  };
}

function warnOnce(error: unknown) {
  if (globalRef.__adminThrottleStoreBroken) return;
  globalRef.__adminThrottleStoreBroken = true;
  console.error(
    "[admin-rate-limit] Redis store unavailable, falling back to the in-process counter:",
    error instanceof Error ? error.message : error,
  );
}

/** Stable rate-limit identity. User-Agent is caller-controlled and must not split a caller's bucket. */
export function clientFingerprint(event: H3Event): string {
  const ip = resolveClientIp(getHeader(event, "x-forwarded-for"), getHeader(event, "x-real-ip")?.trim() || getRequestIP(event));
  return createHash("sha256").update(ip).digest("hex");
}

export function resolveClientIp(forwardedHeader: string | undefined, remoteIp: string | undefined) {
  const forwarded = forwardedHeader?.split(",").map((value) => value.trim()).filter(Boolean);
  // The nearest trusted reverse proxy appends the client address to X-Forwarded-For.
  // Use the rightmost value so a caller-supplied leftmost value cannot choose its bucket.
  return forwarded?.at(-1) || remoteIp || "unknown";
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
  const now = Date.now();
  return store().consume(key, {
    now,
    windowMs: WINDOW_MS,
    maxAttempts,
    blockMs: BLOCK_MS,
    ttlSeconds: KEY_TTL_SECONDS,
  });
}

/** Clears the counter after a successful login so the admin is not punished. */
export async function clearAdminAttempts(key: string) {
  await store().delete(key);
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
