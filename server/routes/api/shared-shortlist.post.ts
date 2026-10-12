import { createError, defineEventHandler, readBody, setResponseHeader } from "h3";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { assertSameOrigin, clientFingerprint, consumeAdminAttempt, tooManyAttemptsError } from "@/lib/admin-rate-limit.server";

const schema = z.object({
  slugs: z.array(z.string().trim().min(1).max(220)).min(1).max(6),
  title: z.string().trim().max(120).optional().default("سبد منتخب هیرمند"),
  expiresDays: z.number().int().min(1).max(30).optional().default(14),
});

function cleanToken() {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  assertSameOrigin(event);
  const attempt = await consumeAdminAttempt("shared-shortlist:" + clientFingerprint(event));
  if (!attempt.allowed) throw tooManyAttemptsError(attempt.retryAfterSeconds);

  const parsed = schema.safeParse(await readBody(event));
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: "فهرست فایل‌های اشتراکی نامعتبر است." });
  if (dbSource === "unconfigured") throw createError({ statusCode: 503, statusMessage: "اشتراک آنلاین در حال حاضر فعال نیست." });

  const uniqueSlugs = Array.from(new Set(parsed.data.slugs)).slice(0, 6);
  const sql = await getSql();
  const rows = await sql.query<{ slug: string }>(
    "select slug from properties where status='published' and slug=any($1::text[])",
    [uniqueSlugs],
  );
  const published = rows.map((row) => String(row.slug));
  if (!published.length) throw createError({ statusCode: 404, statusMessage: "هیچ‌یک از فایل‌های انتخابی دیگر منتشر نیستند." });

  const token = cleanToken();
  const expiresAt = new Date(Date.now() + parsed.data.expiresDays * 24 * 60 * 60 * 1000);
  await sql.query(
    "insert into shared_shortlists(token,title,property_slugs,expires_at) values($1,$2,$3::jsonb,$4)",
    [token, parsed.data.title || "سبد منتخب هیرمند", JSON.stringify(published), expiresAt.toISOString()],
  );

  return {
    ok: true,
    token,
    shareUrl: "/favorites?shared=" + token,
    expiresAt: expiresAt.toISOString(),
    slugs: published,
  };
});
