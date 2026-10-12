import {
  createError,
  defineEventHandler,
  getCookie,
  readBody,
  setCookie,
} from "h3";
import { dbSource, getSql } from "@/lib/db";

const COOKIE_NAME = "hirmand_visitor_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const EVENT_NAMES = new Set([
  "call_click",
  "whatsapp_click",
  "inquiry_submit",
  "inquiry_click",
  "property_share",
  "property_favorite",
  "property_view",
  "property_compare",
  "budget_match_submit",
  "budget_match_contact",
  "search_share",
  "property_search",
  "property_price_watch",
  "property_price_target",
  "property_expert_request",
  "property_verification_request",
  "viewing_cta_jump",
  "visit_request_click",
  "visit_request",
  "property_report",
  "heartbeat",
]);

function validVisitorId(value: string | undefined) {
  return Boolean(value && /^[a-f0-9-]{20,80}$/i.test(value));
}

function normalizeAcquisition(
  referrer: unknown,
  utmSource: unknown,
  utmMedium: unknown,
  utmCampaign: unknown,
) {
  let referrerHost: string | null = null;
  if (typeof referrer === "string" && referrer.trim()) {
    try {
      const parsed = new URL(referrer.trim().slice(0, 500));
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        referrerHost = parsed.hostname.toLowerCase().slice(0, 160);
      }
    } catch {
      // Ignore malformed referrers.
    }
  }

  const clean = (value: unknown, max: number) =>
    typeof value === "string" ? value.trim().slice(0, max) || null : null;

  return {
    referrerHost,
    utmSource: clean(utmSource, 120),
    utmMedium: clean(utmMedium, 120),
    utmCampaign: clean(utmCampaign, 160),
  };
}

export default defineEventHandler(async (event) => {
  if (dbSource === "unconfigured") return { ok: true, tracked: false };

  const body = (await readBody(event)) as {
    path?: unknown;
    event?: unknown;
    propertySlug?: unknown;
    referrer?: unknown;
    utmSource?: unknown;
    utmMedium?: unknown;
    utmCampaign?: unknown;
  };

  const path = typeof body.path === "string" ? body.path.trim() : "";
  const eventName = typeof body.event === "string" ? body.event.trim() : "";
  const propertySlug =
    typeof body.propertySlug === "string" ? body.propertySlug.trim().slice(0, 220) : null;
  const acquisition = normalizeAcquisition(
    body.referrer,
    body.utmSource,
    body.utmMedium,
    body.utmCampaign,
  );

  const isPageview =
    path.startsWith("/") && !path.startsWith("/api/") && !path.startsWith("/admin");
  const isEvent = !eventName || EVENT_NAMES.has(eventName);

  if (!isPageview || !isEvent) {
    throw createError({ statusCode: 400, statusMessage: "رویداد یا مسیر بازدید نامعتبر است." });
  }

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
  const dayExpr = "(current_timestamp at time zone 'Asia/Tehran')::date";
  const safePath = path.slice(0, 500);

  if (eventName === "heartbeat") {
    await sql.query(
      "insert into site_visitor_days " +
        "(day, visitor_id, pageviews, first_path, last_path, first_seen_at, last_seen_at, referrer_host, utm_source, utm_medium, utm_campaign, landing_path) " +
        "values (" +
        dayExpr +
        ", $1, 0, $2, $2, current_timestamp, current_timestamp, $3, $4, $5, $6, $2) " +
        "on conflict (day, visitor_id) do update set " +
        "last_path = excluded.last_path, last_seen_at = current_timestamp, " +
        "referrer_host = coalesce(site_visitor_days.referrer_host, excluded.referrer_host), " +
        "utm_source = coalesce(site_visitor_days.utm_source, excluded.utm_source), " +
        "utm_medium = coalesce(site_visitor_days.utm_medium, excluded.utm_medium), " +
        "utm_campaign = coalesce(site_visitor_days.utm_campaign, excluded.utm_campaign), " +
        "landing_path = coalesce(site_visitor_days.landing_path, excluded.landing_path)",
      [
        visitorId,
        safePath,
        acquisition.referrerHost,
        acquisition.utmSource,
        acquisition.utmMedium,
        acquisition.utmCampaign,
      ],
    );
  } else if (eventName) {
    await sql.query(
      "insert into site_events (id, day, visitor_id, event_name, path, property_slug) " +
        "select $1, " +
        dayExpr +
        ", $2, $3, $4, $5 " +
        "where not exists (" +
        "select 1 from site_events " +
        "where visitor_id = $2 and event_name = $3 and path = $4 " +
        "and coalesce(property_slug, '') = coalesce($5, '') " +
        "and created_at >= current_timestamp - interval '8 seconds'" +
        ")",
      [crypto.randomUUID(), visitorId, eventName, safePath, propertySlug],
    );
  } else {
    await Promise.all([
      sql.query(
        "insert into site_visitor_days " +
          "(day, visitor_id, pageviews, first_path, last_path, first_seen_at, last_seen_at, referrer_host, utm_source, utm_medium, utm_campaign, landing_path) " +
          "values (" +
          dayExpr +
          ", $1, 1, $2, $2, current_timestamp, current_timestamp, $3, $4, $5, $6, $2) " +
          "on conflict (day, visitor_id) do update set " +
          "pageviews = site_visitor_days.pageviews + case " +
          "when site_visitor_days.pageviews = 0 then 1 " +
          "when site_visitor_days.last_path = excluded.last_path " +
          "and site_visitor_days.last_seen_at >= current_timestamp - interval '10 seconds' then 0 else 1 end, " +
          "last_path = excluded.last_path, last_seen_at = current_timestamp, " +
          "referrer_host = coalesce(site_visitor_days.referrer_host, excluded.referrer_host), " +
          "utm_source = coalesce(site_visitor_days.utm_source, excluded.utm_source), " +
          "utm_medium = coalesce(site_visitor_days.utm_medium, excluded.utm_medium), " +
          "utm_campaign = coalesce(site_visitor_days.utm_campaign, excluded.utm_campaign), " +
          "landing_path = coalesce(site_visitor_days.landing_path, excluded.landing_path)",
        [
          visitorId,
          safePath,
          acquisition.referrerHost,
          acquisition.utmSource,
          acquisition.utmMedium,
          acquisition.utmCampaign,
        ],
      ),
      sql.query(
        "insert into site_page_days (day, visitor_id, path, pageviews, last_seen_at) " +
          "values (" +
          dayExpr +
          ", $1, $2, 1, current_timestamp) " +
          "on conflict (day, visitor_id, path) do update set " +
          "pageviews = site_page_days.pageviews + case " +
          "when site_page_days.last_seen_at >= current_timestamp - interval '10 seconds' then 0 else 1 end, " +
          "last_seen_at = current_timestamp",
        [visitorId, safePath],
      ),
    ]);
  }

  return { ok: true, tracked: true };
});
