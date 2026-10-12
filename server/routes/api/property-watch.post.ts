import { createError, defineEventHandler, getCookie, readBody, setCookie } from "h3";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";

const COOKIE_NAME = "hirmand_visitor_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const inputSchema = z.object({
  action: z.enum(["subscribe", "unsubscribe", "sync", "seen"]),
  slug: z.string().trim().min(1).max(220).optional(),
  alertIds: z.array(z.coerce.number().int().positive()).max(100).optional().default([]),
});

function validVisitorId(value: string | undefined) {
  return Boolean(value && /^[a-f0-9-]{20,80}$/i.test(value));
}

function normalizeMoney(value: unknown) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function alertType(previous: Record<string, unknown>, current: Record<string, unknown>) {
  if (String(previous.availability ?? "") !== String(current.availability ?? "")) {
    return "availability_change" as const;
  }

  const previousPrice = normalizeMoney(previous.price);
  const currentPrice = normalizeMoney(current.price);
  const previousDeposit = normalizeMoney(previous.deposit);
  const currentDeposit = normalizeMoney(current.deposit);
  const previousRent = normalizeMoney(previous.rent);
  const currentRent = normalizeMoney(current.rent);

  if (
    previousPrice !== currentPrice ||
    previousDeposit !== currentDeposit ||
    previousRent !== currentRent
  ) {
    const previousComparable = previousPrice ?? previousDeposit ?? previousRent;
    const currentComparable = currentPrice ?? currentDeposit ?? currentRent;
    return currentComparable != null && previousComparable != null && currentComparable < previousComparable
      ? "price_drop" as const
      : "price_change" as const;
  }

  return null;
}

function formatAmount(value: number | null) {
  return value == null ? null : value.toLocaleString("fa-IR");
}

export default defineEventHandler(async (event) => {
  const parsed = inputSchema.safeParse(await readBody(event));
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: "درخواست پیگیری فایل نامعتبر است." });
  if (dbSource === "unconfigured") return { ok: true, enabled: false, alerts: [], subscriptions: [] };

  let visitorId = getCookie(event, COOKIE_NAME);
  if (!validVisitorId(visitorId)) {
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

  if (parsed.data.action === "subscribe" || parsed.data.action === "unsubscribe") {
    if (!parsed.data.slug) throw createError({ statusCode: 400, statusMessage: "فایل مشخص نشده است." });

    const propertyRows = await sql.query<Record<string, unknown>>(
      "select id, slug, price, deposit, rent, availability_status from properties where deleted_at is null and status='published' and (unpublish_at is null or unpublish_at > current_timestamp) and slug=$1 limit 1",
      [parsed.data.slug],
    );
    const property = propertyRows[0];
    if (!property) throw createError({ statusCode: 404, statusMessage: "فایل موردنظر پیدا نشد." });

    if (parsed.data.action === "subscribe") {
      await sql.query(
        `insert into property_watch_subscriptions
          (visitor_id, property_id, property_slug, price, deposit, rent, availability_status, enabled, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,true,current_timestamp)
         on conflict (visitor_id, property_id)
         do update set
           property_slug=excluded.property_slug,
           price=excluded.price,
           deposit=excluded.deposit,
           rent=excluded.rent,
           availability_status=excluded.availability_status,
           enabled=true,
           updated_at=current_timestamp`,
        [
          visitorId,
          String(property.id),
          String(property.slug),
          normalizeMoney(property.price),
          normalizeMoney(property.deposit),
          normalizeMoney(property.rent),
          String(property.availability_status ?? "available"),
        ],
      );
    } else {
      await sql.query(
        "update property_watch_subscriptions set enabled=false, updated_at=current_timestamp where visitor_id=$1 and property_id=$2",
        [visitorId, String(property.id)],
      );
    }
  }

  if (parsed.data.action === "seen" && parsed.data.alertIds.length > 0) {
    await sql.query(
      "update property_watch_alerts set seen_at=current_timestamp where visitor_id=$1 and id=any($2::bigint[])",
      [visitorId, parsed.data.alertIds],
    );
  }

  const subscriptions = await sql.query<Record<string, unknown>>(
    `select
       s.property_id,
       s.property_slug,
       s.price as watched_price,
       s.deposit as watched_deposit,
       s.rent as watched_rent,
       s.availability_status as watched_availability,
       s.target_price,
       s.target_deposit,
       s.target_rent,
       p.title,
       p.price,
       p.deposit,
       p.rent,
       p.availability_status,
       p.updated_at
     from property_watch_subscriptions s
     join properties p on p.id=s.property_id
     where s.visitor_id=$1 and s.enabled=true and p.status='published'
     order by s.updated_at desc
     limit 40`,
    [visitorId],
  );

  for (const row of subscriptions) {
    const previous = {
      price: row.watched_price,
      deposit: row.watched_deposit,
      rent: row.watched_rent,
      availability: row.watched_availability,
    };
    const current = {
      price: row.price,
      deposit: row.deposit,
      rent: row.rent,
      availability: row.availability_status,
    };
    const previousAmount = normalizeMoney(row.watched_price ?? row.watched_deposit ?? row.watched_rent);
    const currentAmount = normalizeMoney(row.price ?? row.deposit ?? row.rent);
    const targetPrice = normalizeMoney(row.target_price);
    const targetDeposit = normalizeMoney(row.target_deposit);
    const targetRent = normalizeMoney(row.target_rent);
    const targetHit =
      (targetPrice != null && current.price != null && normalizeMoney(current.price) != null && normalizeMoney(current.price)! <= targetPrice && (previous.price == null || normalizeMoney(previous.price)! > targetPrice)) ||
      (targetDeposit != null && current.deposit != null && normalizeMoney(current.deposit) != null && normalizeMoney(current.deposit)! <= targetDeposit && (previous.deposit == null || normalizeMoney(previous.deposit)! > targetDeposit)) ||
      (targetRent != null && current.rent != null && normalizeMoney(current.rent) != null && normalizeMoney(current.rent)! <= targetRent && (previous.rent == null || normalizeMoney(previous.rent)! > targetRent));
    const kind = targetHit ? "target_reached" as const : alertType(previous, current);
    if (!kind) continue;

    const existing = await sql.query<{ id: string }>(
      `select id::text as id
       from property_watch_alerts
       where visitor_id=$1
         and property_id=$2
         and alert_type=$3
         and created_at >= current_timestamp - interval '3 days'
         and seen_at is null
       limit 1`,
      [visitorId, String(row.property_id), kind],
    );
    if (!existing[0]) {
      const direction = currentAmount != null && previousAmount != null && currentAmount < previousAmount ? "کاهش" : "تغییر";
      const targetMessage = targetPrice != null && normalizeMoney(row.price) != null && normalizeMoney(row.price)! <= targetPrice
        ? "قیمت"
        : targetDeposit != null && normalizeMoney(row.deposit) != null && normalizeMoney(row.deposit)! <= targetDeposit
          ? "رهن"
          : "اجاره";
      const message = kind === "availability_change"
        ? row.title + " · وضعیت فایل از " + String(row.watched_availability ?? "نامشخص") + " به " + String(row.availability_status ?? "نامشخص") + " تغییر کرد."
        : kind === "target_reached"
          ? row.title + " · " + targetMessage + " به هدف تعیین‌شده شما رسید یا از آن پایین‌تر شد."
          : row.title + " · " + direction + " قیمت/شرایط فایل";
      await sql.query(
        `insert into property_watch_alerts
          (visitor_id, property_id, property_slug, alert_type,
           previous_price, current_price, previous_deposit, current_deposit,
           previous_rent, current_rent, previous_availability, current_availability, message)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          visitorId,
          String(row.property_id),
          String(row.property_slug),
          kind,
          normalizeMoney(row.watched_price),
          normalizeMoney(row.price),
          normalizeMoney(row.watched_deposit),
          normalizeMoney(row.deposit),
          normalizeMoney(row.watched_rent),
          normalizeMoney(row.rent),
          String(row.watched_availability ?? "available"),
          String(row.availability_status ?? "available"),
          message,
        ],
      );
    }

    await sql.query(
      `update property_watch_subscriptions
       set price=$2, deposit=$3, rent=$4, availability_status=$5, last_notified_at=current_timestamp, updated_at=current_timestamp
       where visitor_id=$1 and property_id=$6`,
      [
        visitorId,
        normalizeMoney(row.price),
        normalizeMoney(row.deposit),
        normalizeMoney(row.rent),
        String(row.availability_status ?? "available"),
        String(row.property_id),
      ],
    );
  }

  const alerts = await sql.query<Record<string, unknown>>(
    `select id::text, property_slug, alert_type, message,
            previous_price, current_price,
            previous_deposit, current_deposit,
            previous_rent, current_rent,
            previous_availability, current_availability,
            created_at
     from property_watch_alerts
     where visitor_id=$1 and seen_at is null
     order by created_at desc
     limit 20`,
    [visitorId],
  );

  return {
    ok: true,
    enabled: true,
    subscriptions: subscriptions.map((row) => ({
      slug: String(row.property_slug),
      title: String(row.title),
      availabilityStatus: String(row.availability_status ?? "available"),
      updatedAt: row.updated_at == null ? null : new Date(String(row.updated_at)).toISOString(),
      watchedPrice: normalizeMoney(row.watched_price),
      currentPrice: normalizeMoney(row.price),
      target: {
        price: normalizeMoney(row.target_price),
        deposit: normalizeMoney(row.target_deposit),
        rent: normalizeMoney(row.target_rent),
      },
      currentPriceLabel: formatAmount(normalizeMoney(row.price)),
    })),
    alerts: alerts.map((row) => ({
      id: String(row.id),
      slug: String(row.property_slug),
      type: String(row.alert_type),
      message: String(row.message),
      previousPrice: normalizeMoney(row.previous_price),
      currentPrice: normalizeMoney(row.current_price),
      previousDeposit: normalizeMoney(row.previous_deposit),
      currentDeposit: normalizeMoney(row.current_deposit),
      previousRent: normalizeMoney(row.previous_rent),
      currentRent: normalizeMoney(row.current_rent),
      previousAvailability: row.previous_availability == null ? null : String(row.previous_availability),
      currentAvailability: row.current_availability == null ? null : String(row.current_availability),
      createdAt: new Date(String(row.created_at)).toISOString(),
    })),
  };
});
