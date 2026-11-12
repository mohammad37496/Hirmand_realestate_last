import { createError, getRequestIP, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import {
  createPhoneBridgeDeviceRateLimitKey,
  createPhoneBridgeIpRateLimitKey,
  createPhoneBridgePreAuthRateLimitConfig,
} from "@/lib/phone-bridge-rate-limit-identity";

export { phoneBridgeRateLimitSubject } from "@/lib/phone-bridge-rate-limit-identity";

export type RateLimitConfig = {
  windowMs: number;
  maxHits: number;
  blockMs: number;
};

export function getPhoneBridgePeerIp(event: H3Event) {
  return getRequestIP(event) ?? "unknown";
}

async function consumeBucket(event: H3Event, key: string, config: RateLimitConfig, cleanup = false) {
  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "محدودکنندهٔ درخواست Phone Bridge پیکربندی نشده است." });
  }

  const sql = await getSql().catch(() => {
    throw createError({ statusCode: 503, statusMessage: "محدودکنندهٔ درخواست Phone Bridge در دسترس نیست." });
  });
  const nowMs = Date.now();
  const windowStartMs = Math.floor(nowMs / config.windowMs) * config.windowMs;
  const windowStart = new Date(windowStartMs);
  const now = new Date(nowMs);
  const blockUntil = new Date(nowMs + config.blockMs);
  const rows = await sql.query<{ hits: number; blocked_until: string | null }>(
    `insert into phone_bridge_rate_limits (key,window_start,hits,blocked_until)
     values ($1,$2,1,null)
     on conflict (key) do update set
       window_start=case
         when phone_bridge_rate_limits.blocked_until > $3::timestamptz then phone_bridge_rate_limits.window_start
         when phone_bridge_rate_limits.window_start <> $2::timestamptz then $2
         else phone_bridge_rate_limits.window_start
       end,
       hits=case
         when phone_bridge_rate_limits.blocked_until > $3::timestamptz then phone_bridge_rate_limits.hits
         when phone_bridge_rate_limits.window_start <> $2::timestamptz then 1
         when phone_bridge_rate_limits.hits + 1 > $4 then 0
         else phone_bridge_rate_limits.hits + 1
       end,
       blocked_until=case
         when phone_bridge_rate_limits.blocked_until > $3::timestamptz then phone_bridge_rate_limits.blocked_until
         when phone_bridge_rate_limits.window_start <> $2::timestamptz then null
         when phone_bridge_rate_limits.hits + 1 > $4 then $5::timestamptz
         else phone_bridge_rate_limits.blocked_until
       end
     returning hits,blocked_until`,
    [key, windowStart.toISOString(), now.toISOString(), config.maxHits, blockUntil.toISOString()],
  ).catch(() => {
    throw createError({ statusCode: 503, statusMessage: "بررسی محدودیت درخواست Phone Bridge ناموفق بود." });
  });

  const row = rows[0];
  if (!row) throw createError({ statusCode: 503, statusMessage: "نتیجهٔ محدودیت درخواست Phone Bridge معتبر نیست." });
  const blockedUntilMs = row?.blocked_until ? new Date(String(row.blocked_until)).getTime() : 0;
  if (blockedUntilMs > nowMs) {
    const retryAfter = Math.max(1, Math.ceil((blockedUntilMs - nowMs) / 1000));
    setResponseHeader(event, "retry-after", String(retryAfter));
    throw createError({
      statusCode: 429,
      statusMessage: "تعداد درخواست‌های Phone Bridge بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.",
    });
  }

  if (cleanup) {
    // Cleanup is maintenance only; the current request's bucket was already
    // enforced successfully, so cleanup failure must not bypass or block it.
    await sql.query(
      `delete from phone_bridge_rate_limits
       where window_start < current_timestamp - interval '2 hours'
         and (blocked_until is null or blocked_until < current_timestamp)`,
    ).catch((error) => console.warn("[phone-bridge-rate-limit] cleanup failed", error));
  }
}

/** Coarse pre-auth bucket. The default request IP accessor ignores forwarded headers. */
export async function enforcePhoneBridgeIpRateLimit(event: H3Event, scope: string, config: RateLimitConfig) {
  await consumeBucket(event, createPhoneBridgeIpRateLimitKey(scope, getPhoneBridgePeerIp(event)), createPhoneBridgePreAuthRateLimitConfig(config), true);
}

/** Strict bucket. Call only after authenticateDevice/requireBootstrap and pass its verified identity. */
export async function enforcePhoneBridgeRateLimit(
  event: H3Event,
  scope: string,
  authenticatedSubject: string,
  config: RateLimitConfig,
) {
  await consumeBucket(event, createPhoneBridgeDeviceRateLimitKey(scope, authenticatedSubject), config);
}
