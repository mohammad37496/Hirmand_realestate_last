import { createHash } from "node:crypto";
import { createError, getHeader, getRequestIP, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";

export type RateLimitConfig = {
  windowMs: number;
  maxHits: number;
  blockMs: number;
};

export async function consumePhoneBridgeAttempt(
  scope: string,
  subject: string,
) {
  // Simplified version for command polling - uses a shorter window
  if (dbSource === "unconfigured") return { allowed: true, retryAfterSeconds: 0 };
  
  const config: RateLimitConfig = {
    windowMs: 10 * 60 * 1000, // 10 minutes
    maxHits: 240,
    blockMs: 5 * 60 * 1000, // 5 minutes
  };
  
  const nowMs = Date.now();
  const windowStartMs = Math.floor(nowMs / config.windowMs) * config.windowMs;
  const windowStart = new Date(windowStartMs);
  const now = new Date(nowMs);
  const blockUntil = new Date(nowMs + config.blockMs);
  const key = createHash("sha256").update(`command-poll|${subject}`).digest("hex");

  try {
    const sql = await getSql();
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
    );

    const row = rows[0];
    const blockedUntilMs = row?.blocked_until ? new Date(String(row.blocked_until)).getTime() : 0;
    if (blockedUntilMs > nowMs) {
      const retryAfter = Math.max(1, Math.ceil((blockedUntilMs - nowMs) / 1000));
      return { allowed: false, retryAfterSeconds: retryAfter };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  } catch {
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

function requestFingerprint(event: H3Event, scope: string, subject: string) {
  const forwarded = getHeader(event, "x-forwarded-for")?.split(",")[0]?.trim();
  const ip =
    forwarded ||
    getRequestIP(event, { xForwardedFor: true }) ||
    getHeader(event, "x-real-ip")?.trim() ||
    "unknown";
  const agent = getHeader(event, "user-agent")?.slice(0, 120) ?? "";
  return createHash("sha256")
    .update(scope + "|" + subject + "|" + ip + "|" + agent, "utf8")
    .digest("hex");
}

export async function enforcePhoneBridgeRateLimit(
  event: H3Event,
  scope: string,
  subject: string,
  config: RateLimitConfig,
) {
  if (dbSource === "unconfigured") return;

  const nowMs = Date.now();
  const windowStartMs = Math.floor(nowMs / config.windowMs) * config.windowMs;
  const windowStart = new Date(windowStartMs);
  const now = new Date(nowMs);
  const blockUntil = new Date(nowMs + config.blockMs);
  const key = requestFingerprint(event, scope, subject);

  const sql = await getSql();
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
  );

  const row = rows[0];
  const blockedUntilMs = row?.blocked_until ? new Date(String(row.blocked_until)).getTime() : 0;
  if (blockedUntilMs > nowMs) {
    const retryAfter = Math.max(1, Math.ceil((blockedUntilMs - nowMs) / 1000));
    setResponseHeader(event, "retry-after", String(retryAfter));
    throw createError({
      statusCode: 429,
      statusMessage: "تعداد درخواست‌های Phone Bridge بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.",
    });
  }

  // Opportunistic cleanup keeps abandoned limiter keys bounded.
  await sql.query(
    `delete from phone_bridge_rate_limits
     where window_start < current_timestamp - interval '2 hours'
       and (blocked_until is null or blocked_until < current_timestamp)`,
  );
}
