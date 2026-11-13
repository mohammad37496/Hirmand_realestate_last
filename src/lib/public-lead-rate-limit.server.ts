import { createError } from "h3";
import type { Sql } from "@/lib/db";

const MAX_ATTEMPTS = 8;
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
  let rows: Array<{ attempts: string[]; blocked_until: string | Date | null; checked_at: string | Date }>;
  try {
    rows = await sql.query<{ attempts: string[]; blocked_until: string | Date | null; checked_at: string | Date }>(
      `insert into public_lead_rate_limits (key,attempts,blocked_until)
       values ($1,array[clock_timestamp()],null)
       on conflict (key) do update set
         attempts=case
           when public_lead_rate_limits.blocked_until > excluded.attempts[1] then public_lead_rate_limits.attempts
           else array_append(
             array(select hit from unnest(public_lead_rate_limits.attempts) as recent(hit)
               where hit > excluded.attempts[1] - interval '10 minutes'),
             excluded.attempts[1]
           )
         end,
         blocked_until=case
           when public_lead_rate_limits.blocked_until > excluded.attempts[1] then public_lead_rate_limits.blocked_until
           when cardinality(array(select hit from unnest(public_lead_rate_limits.attempts) as recent(hit)
             where hit > excluded.attempts[1] - interval '10 minutes')) + 1 > $2
             then excluded.attempts[1] + interval '15 minutes'
           else null
         end
       returning attempts,blocked_until,clock_timestamp() as checked_at`,
      [key, MAX_ATTEMPTS],
    );
  } catch {
    throw createError({ statusCode: 503, statusMessage: "ثبت درخواست در حال حاضر در دسترس نیست." });
  }

  const row = rows[0];
  if (!row) {
    throw createError({ statusCode: 503, statusMessage: "بررسی محدودیت ثبت درخواست ناموفق بود." });
  }
  const checkedAtMs = new Date(row.checked_at).getTime();
  const blockedUntilMs = row.blocked_until ? new Date(row.blocked_until).getTime() : 0;
  if (blockedUntilMs > checkedAtMs) {
    if (++cleanupCounter % 100 === 0) {
      await sql.query(
        "delete from public_lead_rate_limits where (blocked_until is null or blocked_until < current_timestamp) and (cardinality(attempts)=0 or attempts[cardinality(attempts)] < current_timestamp - interval '2 hours')",
      ).catch((error) => console.warn("[public-lead-rate-limit] cleanup failed", error));
    }
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((blockedUntilMs - checkedAtMs) / 1000)),
    };
  }
  if (++cleanupCounter % 100 === 0) {
    await sql.query(
      "delete from public_lead_rate_limits where (blocked_until is null or blocked_until < current_timestamp) and (cardinality(attempts)=0 or attempts[cardinality(attempts)] < current_timestamp - interval '2 hours')",
    ).catch((error) => console.warn("[public-lead-rate-limit] cleanup failed", error));
  }
  return { allowed: true, retryAfterSeconds: 0 };
}
