import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  cancelOpenHouseSchedule,
  createOpenHouseSchedule,
  registerOpenHouseRsvp,
} from "./property-open-house-scheduling.server.ts";

function sqlFor(tx: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }) {
  return {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await tx.query(text, params)).rows as T[],
  };
}

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create table properties (id text primary key, status text not null);
    create table property_open_houses (
      id text primary key, property_id text not null references properties(id),
      starts_at timestamptz not null, ends_at timestamptz not null,
      capacity integer not null, note text not null default '',
      status text not null default 'scheduled', created_at timestamptz not null default current_timestamp
    );
    create table property_open_house_rsvps (
      id text primary key, open_house_id text not null references property_open_houses(id),
      name text not null, phone text not null, party_size integer not null,
      note text not null default '', status text not null default 'requested',
      created_at timestamptz not null default current_timestamp
    );
    insert into properties(id,status) values ('property-1','published');
  `);
  const migration = await readFile(new URL("../../migrations/0108_open_house_rsvp_concurrency.sql", import.meta.url), "utf8");
  await db.exec(migration);
  return db;
}

function transaction<T>(db: PGlite, callback: (sql: ReturnType<typeof sqlFor>) => Promise<T>) {
  return db.transaction(async (tx) => callback(sqlFor(tx)));
}

const futureStart = "2030-06-01T10:00:00.000Z";
const futureEnd = "2030-06-01T12:00:00.000Z";

test("migration keeps the oldest active RSVP and enforces one active phone per event", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table property_open_house_rsvps (
        id text primary key, open_house_id text not null, name text not null, phone text not null,
        party_size integer not null, note text not null default '',
        status text not null default 'requested', created_at timestamptz not null default current_timestamp
      );
      insert into property_open_house_rsvps(id,open_house_id,name,phone,party_size,created_at)
      values ('older','event-1','Older','09130000001',1,'2030-01-01T00:00:00Z'),
             ('newer','event-1','Newer','09130000001',1,'2030-01-02T00:00:00Z');
    `);
    const migration = await readFile(new URL("../../migrations/0108_open_house_rsvp_concurrency.sql", import.meta.url), "utf8");
    await db.exec(migration);
    const rows = await db.query<{ id: string; status: string }>(
      "select id,status from property_open_house_rsvps order by id",
    );
    assert.deepEqual(rows.rows, [
      { id: "newer", status: "cancelled" },
      { id: "older", status: "requested" },
    ]);
    await assert.rejects(
      db.query("insert into property_open_house_rsvps(id,open_house_id,name,phone,party_size) values('third','event-1','Third','09130000001',1)"),
      /unique/i,
    );
  } finally {
    await db.close();
  }
});

test("concurrent overlapping open-house creation for one property admits only one event", async () => {
  const db = await fixture();
  try {
    const results = await Promise.all([
      transaction(db, (tx) => createOpenHouseSchedule(tx, {
        id: "event-a", propertyId: "property-1", startsAt: futureStart, endsAt: futureEnd, capacity: 8, note: "",
      })),
      transaction(db, (tx) => createOpenHouseSchedule(tx, {
        id: "event-b", propertyId: "property-1", startsAt: "2030-06-01T11:00:00.000Z", endsAt: "2030-06-01T13:00:00.000Z", capacity: 8, note: "",
      })),
    ]);
    assert.equal(results.filter((result) => result.kind === "created").length, 1);
    assert.equal(results.filter((result) => result.kind === "overlap").length, 1);
    const events = await db.query("select id from property_open_houses");
    assert.equal(events.rows.length, 1);
  } finally {
    await db.close();
  }
});

test("concurrent RSVPs cannot exceed open-house capacity", async () => {
  const db = await fixture();
  try {
    await db.query(
      "insert into property_open_houses(id,property_id,starts_at,ends_at,capacity) values($1,$2,$3,$4,1)",
      ["event-1", "property-1", futureStart, futureEnd],
    );
    const results = await Promise.all([
      transaction(db, (tx) => registerOpenHouseRsvp(tx, {
        id: "rsvp-a", eventId: "event-1", name: "A", phone: "09130000001", partySize: 1, note: "",
      }, new Date("2030-01-01T00:00:00.000Z"))),
      transaction(db, (tx) => registerOpenHouseRsvp(tx, {
        id: "rsvp-b", eventId: "event-1", name: "B", phone: "09130000002", partySize: 1, note: "",
      }, new Date("2030-01-01T00:00:00.000Z"))),
    ]);
    assert.equal(results.filter((result) => result.kind === "created").length, 1);
    assert.equal(results.filter((result) => result.kind === "full").length, 1);
    const seats = await db.query<{ seats: number }>("select coalesce(sum(party_size),0)::int as seats from property_open_house_rsvps where open_house_id='event-1' and status <> 'cancelled'");
    assert.equal(seats.rows[0]?.seats, 1);
  } finally {
    await db.close();
  }
});

test("concurrent RSVPs for one phone cannot create duplicate active registrations", async () => {
  const db = await fixture();
  try {
    await db.query(
      "insert into property_open_houses(id,property_id,starts_at,ends_at,capacity) values($1,$2,$3,$4,8)",
      ["event-1", "property-1", futureStart, futureEnd],
    );
    const submit = (id: string) => transaction(db, (tx) => registerOpenHouseRsvp(tx, {
      id, eventId: "event-1", name: "Guest", phone: "09130000001", partySize: 1, note: "",
    }, new Date("2030-01-01T00:00:00.000Z")));
    const results = await Promise.all([submit("rsvp-a"), submit("rsvp-b")]);
    assert.equal(results.filter((result) => result.kind === "created").length, 1);
    assert.equal(results.filter((result) => result.kind === "duplicate").length, 1);
    const rows = await db.query("select id from property_open_house_rsvps where open_house_id='event-1' and phone='09130000001' and status <> 'cancelled'");
    assert.equal(rows.rows.length, 1);
  } finally {
    await db.close();
  }
});

test("cancelling an open house serializes with a concurrent RSVP and cancels active registrations", async () => {
  const db = await fixture();
  try {
    await db.query(
      "insert into property_open_houses(id,property_id,starts_at,ends_at,capacity) values($1,$2,$3,$4,8)",
      ["event-1", "property-1", futureStart, futureEnd],
    );
    await db.query(
      "insert into property_open_house_rsvps(id,open_house_id,name,phone,party_size) values('rsvp-1','event-1','Guest','09130000001',1)",
    );
    const [rsvpResult, cancelled] = await Promise.all([
      transaction(db, (tx) => registerOpenHouseRsvp(tx, {
        id: "rsvp-2", eventId: "event-1", name: "Guest 2", phone: "09130000002", partySize: 1, note: "",
      }, new Date("2030-01-01T00:00:00.000Z"))),
      transaction(db, (tx) => cancelOpenHouseSchedule(tx, "event-1")),
    ]);
    assert.equal(cancelled, true);
    assert.ok(rsvpResult.kind === "created" || rsvpResult.kind === "inactive");
    const rows = await db.query<{ status: string }>("select status from property_open_houses where id='event-1'");
    const rsvps = await db.query<{ status: string }>("select status from property_open_house_rsvps where open_house_id='event-1' and status <> 'cancelled'");
    assert.equal(rows.rows[0]?.status, "cancelled");
    assert.equal(rsvps.rows.length, 0);
  } finally {
    await db.close();
  }
});
