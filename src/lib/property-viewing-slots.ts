import type { Sql } from "./db";
import { publicPropertyVisibilitySql } from "./public-property-visibility.ts";

const SLOT_MINUTES = Array.from({ length: 23 }, (_, index) => 9 * 60 + index * 30)
  .filter((value) => value <= 20 * 60);
const SLOT_BLOCK_MINUTES = 45;

function toTime(minutes: number) {
  return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");
}

type ViewingSlotsResult =
  | { kind: "not_found" }
  | { kind: "found"; occupiedTimes: string[] };

/** Read occupied visit slots only when the requested property is publicly visible. */
export async function getPublicPropertyViewingSlots(
  sql: Pick<Sql, "query">,
  propertyId: string,
  date: string,
): Promise<ViewingSlotsResult> {
  const rows = await sql.query<{
    propertyId: string;
    visitPreferredAt: Date | string | null;
  }>(
    `select property.id as "propertyId", lead.visit_preferred_at as "visitPreferredAt"
     from properties property
     left join leads lead
       on lead.property_id = property.id
       and lead.visit_status in ('requested','confirmed')
       and lead.visit_preferred_at >= (($2::date)::timestamp at time zone 'Asia/Tehran') - interval '45 minutes'
       and lead.visit_preferred_at < (($2::date + 1)::timestamp at time zone 'Asia/Tehran') + interval '45 minutes'
     where property.id = $1
       and ${publicPropertyVisibilitySql("property")}`,
    [propertyId, date],
  );

  if (!rows.length) return { kind: "not_found" };

  const bookings = rows
    .map((row) => {
      if (!row.visitPreferredAt) return Number.NaN;
      return row.visitPreferredAt instanceof Date
        ? row.visitPreferredAt.getTime()
        : new Date(row.visitPreferredAt).getTime();
    })
    .filter(Number.isFinite);

  const occupiedTimes = SLOT_MINUTES.filter((slot) => {
    const slotIso = new Date(date + "T" + toTime(slot) + ":00+03:30").getTime();
    return bookings.some((bookedAt) => Math.abs(bookedAt - slotIso) < SLOT_BLOCK_MINUTES * 60_000);
  }).map(toTime);

  return { kind: "found", occupiedTimes };
}
