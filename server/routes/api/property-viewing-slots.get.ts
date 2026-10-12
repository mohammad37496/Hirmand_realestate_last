import { createError, defineEventHandler, getQuery, setResponseHeader } from "h3";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";

const querySchema = z.object({
  propertyId: z.string().trim().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const SLOT_MINUTES = Array.from({ length: 23 }, (_, index) => 9 * 60 + index * 30).filter((value) => value <= 20 * 60);
const SLOT_BLOCK_MINUTES = 45;

function toTime(minutes: number) {
  return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  const parsed = querySchema.safeParse(getQuery(event));
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: "تاریخ یا فایل بازدید نامعتبر است." });
  if (dbSource === "unconfigured") return { success: true, occupiedTimes: [], checkedAt: new Date().toISOString() };

  const sql = await getSql();
  const rows = await sql.query<{ visit_preferred_at: string }>(
    "select visit_preferred_at from leads where property_id::text=$1 and visit_status in ('requested','confirmed') and visit_preferred_at >= (($2::date)::timestamp at time zone 'Asia/Tehran') - interval '45 minutes' and visit_preferred_at < (($2::date + 1)::timestamp at time zone 'Asia/Tehran') + interval '45 minutes'",
    [parsed.data.propertyId, parsed.data.date],
  );

  const bookings = rows.map((row) => new Date(row.visit_preferred_at).getTime()).filter(Number.isFinite);
  const occupiedTimes = SLOT_MINUTES.filter((slot) => {
    const slotIso = new Date(parsed.data.date + "T" + toTime(slot) + ":00+03:30").getTime();
    return bookings.some((bookedAt) => Math.abs(bookedAt - slotIso) < SLOT_BLOCK_MINUTES * 60_000);
  }).map(toTime);

  return { success: true, occupiedTimes, checkedAt: new Date().toISOString() };
});