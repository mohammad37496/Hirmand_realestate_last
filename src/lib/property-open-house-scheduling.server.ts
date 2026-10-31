type SchedulingSql = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

export type OpenHouseScheduleResult =
  | { kind: "property_missing" }
  | { kind: "overlap" }
  | { kind: "created"; id: string };

export async function createOpenHouseSchedule(
  tx: SchedulingSql,
  input: {
    id: string;
    propertyId: string;
    startsAt: string;
    endsAt: string;
    capacity: number;
    note: string;
  },
): Promise<OpenHouseScheduleResult> {
  // Serialize event creation for one property before checking its schedule.
  const property = await tx.query<{ id: string }>(
    "select id from properties where id=$1 and status='published' for update",
    [input.propertyId],
  );
  if (!property[0]) return { kind: "property_missing" };

  const overlaps = await tx.query<{ id: string }>(
    "select id from property_open_houses where property_id=$1 and status='scheduled' and starts_at < $3 and ends_at > $2 limit 1",
    [input.propertyId, input.startsAt, input.endsAt],
  );
  if (overlaps[0]) return { kind: "overlap" };

  await tx.query(
    "insert into property_open_houses(id,property_id,starts_at,ends_at,capacity,note) values($1,$2,$3,$4,$5,$6)",
    [input.id, input.propertyId, input.startsAt, input.endsAt, input.capacity, input.note],
  );
  return { kind: "created", id: input.id };
}

export type OpenHouseRsvpResult =
  | { kind: "not_found" }
  | { kind: "inactive" }
  | { kind: "closed" }
  | { kind: "property_unavailable" }
  | { kind: "duplicate" }
  | { kind: "full" }
  | { kind: "created"; remainingSeats: number };

export async function registerOpenHouseRsvp(
  tx: SchedulingSql,
  input: {
    id: string;
    eventId: string;
    name: string;
    phone: string;
    partySize: number;
    note: string;
  },
  now = new Date(),
): Promise<OpenHouseRsvpResult> {
  // All capacity and duplicate checks happen while this event row is locked.
  const eventRows = await tx.query<{
    id: string;
    property_id: string;
    capacity: number;
    starts_at: string;
    status: string;
  }>(
    "select id,property_id,capacity,starts_at,status from property_open_houses where id=$1 for update",
    [input.eventId],
  );
  const openHouse = eventRows[0];
  if (!openHouse) return { kind: "not_found" };
  if (openHouse.status !== "scheduled") return { kind: "inactive" };
  if (new Date(String(openHouse.starts_at)).getTime() <= now.getTime()) return { kind: "closed" };

  const property = await tx.query<{ id: string }>(
    "select id from properties where id=$1 and status='published' limit 1",
    [openHouse.property_id],
  );
  if (!property[0]) return { kind: "property_unavailable" };

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
  if (bookedSeats + input.partySize > capacity) return { kind: "full" };

  await tx.query(
    "insert into property_open_house_rsvps(id,open_house_id,name,phone,party_size,note) values($1,$2,$3,$4,$5,$6)",
    [input.id, openHouse.id, input.name, input.phone, input.partySize, input.note],
  );
  return { kind: "created", remainingSeats: Math.max(0, capacity - bookedSeats - input.partySize) };
}

export async function cancelOpenHouseSchedule(tx: SchedulingSql, eventId: string): Promise<boolean> {
  const event = await tx.query<{ id: string }>(
    "select id from property_open_houses where id=$1 for update",
    [eventId],
  );
  if (!event[0]) return false;
  await tx.query("update property_open_houses set status='cancelled' where id=$1", [eventId]);
  await tx.query(
    "update property_open_house_rsvps set status='cancelled' where open_house_id=$1 and status <> 'cancelled'",
    [eventId],
  );
  return true;
}
