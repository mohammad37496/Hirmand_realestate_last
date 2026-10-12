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

import { createError, getHeader, getRequestIP, type H3Event } from "h3";

type Bucket = { hits: number[]; blockedUntil: number };

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const BLOCK_MS = 15 * 60 * 1000;

/** Key TTL: long enough to cover the block, short enough to self-clean. */
const KEY_TTL_SECONDS = Math.ceil((WINDOW_MS + BLOCK_MS) / 1000);

interface ThrottleStore {
  get(key: string): Promise<Bucket | undefined>;
  set(key: string, bucket: Bucket): Promise<void>;
  delete(key: string): Promise<void>;
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
    async get(key) {
      return buckets.get(key);
    },
    async set(key, bucket) {
      buckets.set(key, bucket);
    },
    async delete(key) {
      buckets.delete(key);
    },
  };
}

function pruneMemory(store: Map<string, Bucket>, now: number) {
  for (const [key, bucket] of store) {
    const expired = bucket.blockedUntil < now && bucket.hits.every((hit) => now - hit > WINDOW_MS);
    if (expired) store.delete(key);
  }
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

function redisStore(): ThrottleStore {
  return {
    async get(key) {
      const raw = await redisCommand<string | null>("GET", `hirmand:throttle:${key}`);
      if (!raw) return undefined;
      const parsed = JSON.parse(raw) as Bucket;
      return Array.isArray(parsed.hits) ? parsed : undefined;
    },
    async set(key, bucket) {
      // SET with EX so an abandoned key cannot outlive its own window.
      await redisCommand("SET", `hirmand:throttle:${key}`, JSON.stringify(bucket), "EX", KEY_TTL_SECONDS);
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
  const guarded: ThrottleStore = {
    get: (key) => shared.get(key).catch(() => fallback.get(key)),
    set: (key, bucket) => shared.set(key, bucket).catch(() => fallback.set(key, bucket)),
    delete: (key) => shared.delete(key).catch(() => fallback.delete(key)),
  };
  return guarded;
}

function warnOnce(error: unknown) {
  if (globalRef.__adminThrottleStoreBroken) return;
  globalRef.__adminThrottleStoreBroken = true;
  console.error(
    "[admin-rate-limit] Redis store unavailable, falling back to the in-process counter:",
    error instanceof Error ? error.message : error,
  );
}

export function clientFingerprint(event: H3Event): string {
  const forwarded = getHeader(event, "x-forwarded-for")?.split(",")[0]?.trim();
  const ip =
    forwarded ||
    getRequestIP(event, { xForwardedFor: true }) ||
    getHeader(event, "x-real-ip")?.trim() ||
    "unknown";
  const agent = getHeader(event, "user-agent")?.slice(0, 80) ?? "";
  return `${ip}|${agent}`;
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/** Records an attempt and reports whether the caller may continue. */
export async function consumeAdminAttempt(key: string): Promise<RateLimitResult> {
  const now = Date.now();
  const target = store();

  if (globalRef.__adminRateLimits__) pruneMemory(globalRef.__adminRateLimits__, now);

  const bucket = (await target.get(key).catch((error) => {
    warnOnce(error);
    return undefined;
  })) ?? { hits: [], blockedUntil: 0 };

  if (bucket.blockedUntil > now) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000),
    };
  }

  bucket.hits = bucket.hits.filter((hit) => now - hit <= WINDOW_MS);
  bucket.hits.push(now);

  if (bucket.hits.length > MAX_ATTEMPTS) {
    bucket.blockedUntil = now + BLOCK_MS;
    bucket.hits = [];
    await target.set(key, bucket);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(BLOCK_MS / 1000),
    };
  }

  await target.set(key, bucket);
  return {
    allowed: true,
    remaining: Math.max(0, MAX_ATTEMPTS - bucket.hits.length),
    retryAfterSeconds: 0,
  };
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
