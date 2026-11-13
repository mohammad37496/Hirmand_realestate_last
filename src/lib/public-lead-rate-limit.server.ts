import { createError } from "h3";
import type { Sql } from "@/lib/db";

const MAX_ATTEMPTS = 8;
const WINDOW_SECONDS = 10 * 60;
const BLOCK_SECONDS = 15 * 60;
let cleanupCounter = 0;

export type PublicLeadRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

/**
 * Public lead creation already requires PostgreSQL. Keep its abuse protection
 * in that same shared database so an unrelated Upstash configuration cannot
 * make every property inquiry unavailable in Production.
 */
export async function consumePublicLeadAttempt(
  sql: Sql,
  key: string,
): Promise<PublicLeadRateLimitResult> {
  let rows: Array<{ allowed: boolean; retry_after_seconds: number | string }>;
  try {
    rows = await sql.query<{ allowed: boolean; retry_after_seconds: number | string }>(
      "select allowed,retry_after_seconds from consume_public_lead_rate_limit($1,$2,$3,$4)",
      [key, MAX_ATTEMPTS, WINDOW_SECONDS, BLOCK_SECONDS],
    );
  } catch {
    throw createError({ statusCode: 503, statusMessage: "ثبت درخواست در حال حاضر در دسترس نیست." });
  }

  const row = rows[0];
  if (!row) {
    throw createError({ statusCode: 503, statusMessage: "بررسی محدودیت ثبت درخواست ناموفق بود." });
  }
  const retryAfterSeconds = Number(row.retry_after_seconds);
  if (++cleanupCounter % 100 === 0) {
    await sql.query(
      "delete from public_lead_rate_limits where (blocked_until is null or blocked_until < clock_timestamp()) and (cardinality(attempts)=0 or attempts[cardinality(attempts)] < clock_timestamp() - interval '2 hours')",
    ).catch((error) => console.warn("[public-lead-rate-limit] cleanup failed", error));
  }
  return { allowed: row.allowed, retryAfterSeconds };
}
