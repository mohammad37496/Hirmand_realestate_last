import { createError, defineEventHandler, getCookie, readBody, setCookie } from "h3";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";

const COOKIE_NAME = "hirmand_visitor_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const inputSchema = z.object({
  action: z.enum(["set", "clear"]),
  slug: z.string().trim().min(1).max(220),
  target: z.enum(["price", "deposit", "rent"]),
  amount: z.number().int().positive().max(999999999999999).nullable().optional(),
});

function visitorIdValid(value: string | undefined) {
  return Boolean(value && /^[a-f0-9-]{20,80}$/i.test(value));
}
function money(value: unknown) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export default defineEventHandler(async (event) => {
  const parsed = inputSchema.safeParse(await readBody(event));
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: "هدف قیمت نامعتبر است." });
  if (dbSource === "unconfigured") return { ok: true, enabled: false, target: null };

  let visitorId = getCookie(event, COOKIE_NAME);
  if (!visitorIdValid(visitorId)) {
    visitorId = crypto.randomUUID();
    setCookie(event, COOKIE_NAME, visitorId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" || process.env.VERCEL === "1",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
  }

  const sql = await getSql();
  const propertyRows = await sql.query<Record<string, unknown>>(
    "select id, slug, price, deposit, rent, availability_status from properties where status='published' and slug=$1 limit 1",
    [parsed.data.slug],
  );
  const property = propertyRows[0];
  if (!property) throw createError({ statusCode: 404, statusMessage: "فایل موردنظر پیدا نشد." });

  const currentPrice = money(property.price);
  const currentDeposit = money(property.deposit);
  const currentRent = money(property.rent);
  const existing = await sql.query<{ id: string }>(
    "select id from property_watch_subscriptions where visitor_id=$1 and property_id=$2 limit 1",
    [visitorId, String(property.id)],
  );

  const targetPrice = parsed.data.action === "clear" || parsed.data.target !== "price" ? null : parsed.data.amount ?? null;
  const targetDeposit = parsed.data.action === "clear" || parsed.data.target !== "deposit" ? null : parsed.data.amount ?? null;
  const targetRent = parsed.data.action === "clear" || parsed.data.target !== "rent" ? null : parsed.data.amount ?? null;

  if (existing[0]) {
    await sql.query(
      "update property_watch_subscriptions set target_price=$3,target_deposit=$4,target_rent=$5,price=$6,deposit=$7,rent=$8,availability_status=$9,enabled=true,updated_at=current_timestamp where visitor_id=$1 and property_id=$2",
      [visitorId, String(property.id), targetPrice, targetDeposit, targetRent, currentPrice, currentDeposit, currentRent, String(property.availability_status ?? "available")],
    );
  } else {
    await sql.query(
      "insert into property_watch_subscriptions(visitor_id,property_id,property_slug,price,deposit,rent,availability_status,target_price,target_deposit,target_rent,enabled,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,current_timestamp)",
      [visitorId, String(property.id), String(property.slug), currentPrice, currentDeposit, currentRent, String(property.availability_status ?? "available"), targetPrice, targetDeposit, targetRent],
    );
  }

  return {
    ok: true,
    enabled: true,
    target: parsed.data.action === "clear" ? null : { type: parsed.data.target, amount: parsed.data.amount ?? null },
  };
});
