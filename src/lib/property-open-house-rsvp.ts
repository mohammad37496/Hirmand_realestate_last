import type { Sql } from "./db.ts";
import { publicPropertyVisibilitySql } from "./public-property-visibility.ts";

export type OpenHouseRsvpInput = {
  eventId: string;
  name: string;
  phone: string;
  partySize: number;
  note: string;
};

export type OpenHouseRsvpResult =
  | { kind: "created"; remainingSeats: number }
  | { kind: "not_found" }
  | { kind: "closed" }
  | { kind: "hidden_property" }
  | { kind: "duplicate" }
  | { kind: "capacity" };

function requireTransaction(sql: Sql): NonNullable<Sql["transaction"]> {
  if (!sql.transaction) throw new Error("Open-house RSVP mutations require database transactions");
  return sql.transaction;
}

export async function createPropertyOpenHouseRsvp(
  sql: Sql,
  input: OpenHouseRsvpInput,
): Promise<OpenHouseRsvpResult> {
  const transaction = requireTransaction(sql);
  try {
    return await transaction(async (tx) => {
      // Every RSVP and cancellation locks this parent row first. This serializes
      // capacity checks and makes cancellation mutually exclusive with signup.
      const events = await tx.query<{
        id: string;
        property_id: string;
        capacity: number;
        starts_at: string;
        status: string;
      }>(
        "select id,property_id,capacity,starts_at,status from property_open_houses where id=$1 for update",
        [input.eventId],
      );
      const openHouse = events[0];
      if (!openHouse || openHouse.status !== "scheduled") return { kind: "not_found" };
      if (new Date(String(openHouse.starts_at)).getTime() <= Date.now()) return { kind: "closed" };

      const properties = await tx.query<{ id: string }>(
        `select id from properties where id=$1 and ${publicPropertyVisibilitySql()} limit 1`,
        [openHouse.property_id],
      );
      if (!properties[0]) return { kind: "hidden_property" };

      const duplicate = await tx.query<{ id: string }>(
        "select id from property_open_house_rsvps where open_house_id=$1 and phone=$2 and status <> 'cancelled' limit 1",
        [openHouse.id, input.phone],
      );
      if (duplicate[0]) return { kind: "duplicate" };

      const booked = await tx.query<{ seats: number }>(
        "select coalesce(sum(party_size),0)::int as seats from property_open_house_rsvps where open_house_id=$1 and status <> 'cancelled'",
        [openHouse.id],
      );
      const bookedSeats = Number(booked[0]?.seats) || 0;
      const capacity = Number(openHouse.capacity) || 0;
      if (bookedSeats + input.partySize > capacity) return { kind: "capacity" };

      await tx.query(
        "insert into property_open_house_rsvps(id,open_house_id,name,phone,party_size,note) values($1,$2,$3,$4,$5,$6)",
        [crypto.randomUUID(), openHouse.id, input.name, input.phone, input.partySize, input.note],
      );
      return { kind: "created", remainingSeats: Math.max(0, capacity - bookedSeats - input.partySize) };
    });
  } catch (error) {
    if (
      typeof error === "object" && error !== null &&
      "code" in error && error.code === "23505" &&
      "constraint" in error && error.constraint === "property_open_house_rsvps_active_phone_uidx"
    ) {
      return { kind: "duplicate" };
    }
    throw error;
  }
}

export async function cancelPropertyOpenHouse(sql: Sql, eventId: string): Promise<"cancelled" | "not_found"> {
  const transaction = requireTransaction(sql);
  return transaction(async (tx) => {
    const events = await tx.query<{ id: string }>(
      "select id from property_open_houses where id=$1 for update",
      [eventId],
    );
    if (!events[0]) return "not_found";

    await tx.query("update property_open_houses set status='cancelled' where id=$1", [eventId]);
    await tx.query(
      "update property_open_house_rsvps set status='cancelled' where open_house_id=$1 and status <> 'cancelled'",
      [eventId],
    );
    return "cancelled";
  });
}
