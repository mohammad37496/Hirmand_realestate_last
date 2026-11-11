import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { hasAdminPermission } from "./admin-roles.ts";
import { listOpenHouseAdminData } from "./property-open-house-admin-list.ts";
import { createPropertyVisitRequest, reschedulePropertyVisitRequest } from "./property-visit-request.ts";
import { createPropertyOpenHouseEvent } from "./property-open-house-create.ts";
import { cancelPropertyOpenHouse, createPropertyOpenHouseRsvp } from "./property-open-house-rsvp.ts";
import type { Sql } from "./db.ts";

test("property managers can read open-house schedules without selecting RSVP personal data", async () => {
  const queries: string[] = [];
  const sql = {
    query: async <T = Record<string, unknown>>(text: string) => {
      queries.push(text);
      if (/select id from properties/i.test(text)) return [{ id: "property-1" }] as T[];
      if (/select oh\.id/i.test(text)) {
        return [{ id: "event-1", capacity: 8, booked_seats: 2 }] as T[];
      }
      if (/select r\.id,r\.open_house_id,r\.name,r\.phone/i.test(text)) {
        return [{ id: "rsvp-1", open_house_id: "event-1", name: "Guest", phone: "09130000001", party_size: 2, note: "Private note" }] as T[];
      }
      throw new Error(`Unexpected query: ${text}`);
    },
  };

  const propertyOnly = await listOpenHouseAdminData(sql, "property-1", false);
  assert.equal(propertyOnly?.events.length, 1);
  assert.deepEqual(propertyOnly?.rsvps, []);
  assert.equal(queries.some((query) => /select\s+r\.id,r\.open_house_id,r\.name,r\.phone/i.test(query)), false);

  const withLeadPermission = await listOpenHouseAdminData(sql, "property-1", true);
  assert.equal(withLeadPermission?.rsvps.length, 1);
  assert.equal(withLeadPermission?.rsvps[0]?.phone, "09130000001");

  assert.equal(hasAdminPermission("content", "property.manage"), true);
  assert.equal(hasAdminPermission("content", "lead.manage"), false);
  assert.equal(hasAdminPermission("sales", "property.manage"), true);
  assert.equal(hasAdminPermission("sales", "lead.manage"), true);

  const route = await readFile(
    new URL("../../server/routes/api/property-open-house.post.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /hasAdminPermission\(role, "property\.manage"\)/);
  assert.match(route, /const canViewRsvps = hasAdminPermission\(role, "lead\.manage"\)/);
  assert.match(route, /listOpenHouseAdminData\(sql, parsed\.data\.propertyId, canViewRsvps\)/);

  const adminUi = await readFile(
    new URL("../components/hirmand/admin-property-features.tsx", import.meta.url),
    "utf8",
  );
  assert.match(adminUi, /canViewRsvps\?\s*<div className="admin-open-house-rsvps"/);
  const adminShell = await readFile(
    new URL("../components/hirmand/_admin_impl.tsx", import.meta.url),
    "utf8",
  );
  assert.match(adminShell, /<AdminPropertyOpenHouse propertyId=\{form\.id\} canViewRsvps=\{canManageLeads\}/);
});

test("concurrent visit requests for one property and time cannot both reserve the slot", async () => {
  const visits: Array<{ id: string; propertyId: string; phone: string; visitAt: string; trackingToken: string }> = [];
  let lockTail = Promise.resolve();
  let propertyLockQuery = "";
  const property = {
    id: "property-1",
    title: "آپارتمان نمونه",
    property_type: "apartment",
    neighborhood: "چهارباغ",
    contact_name: "مشاور",
  };
  const transactionSql = {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> => {
      if (/from properties/i.test(text)) {
        propertyLockQuery = text;
        return [property] as T[];
      }
      if (/select id, public_tracking_token from leads where property_id/i.test(text)) {
        const duplicate = visits.find((visit) =>
          visit.propertyId === String(params[0]) && visit.phone === String(params[1]) && visit.visitAt === String(params[2]),
        );
        return (duplicate ? [{ id: duplicate.id, public_tracking_token: duplicate.trackingToken }] : []) as T[];
      }
      if (/select id from leads where property_id/i.test(text)) {
        const duplicate = visits.some((visit) =>
          visit.propertyId === String(params[0]) && visit.visitAt === String(params[1]),
        );
        return (duplicate ? [{ id: "existing-visit" }] : []) as T[];
      }
      if (/insert into leads/i.test(text)) {
        visits.push({ id: String(params[0]), phone: String(params[2]), propertyId: String(params[11]), visitAt: String(params[12]), trackingToken: String(params[13]) });
        return [{ id: String(params[0]) }] as T[];
      }
      throw new Error(`Unexpected visit query: ${text}`);
    },
  } as Sql;
  const sql = {
    query: async () => { throw new Error("visit queries must run inside a transaction"); },
    transaction: async <T>(callback: (tx: Sql) => Promise<T>): Promise<T> => {
      const previous = lockTail;
      let release!: () => void;
      lockTail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try {
        return await callback(transactionSql);
      } finally {
        release();
      }
    },
  } as unknown as Sql;
  const base = {
    propertyId: "property-1",
    visitAt: "2026-11-09T10:00:00.000Z",
    name: "مشتری",
    phone: "09123456789",
    peopleCount: null,
    job: "",
    floorPreference: "",
    consultant: "",
    note: "درخواست بازدید",
  };

  const results = await Promise.all([
    createPropertyVisitRequest(sql, { ...base, trackingToken: "HIR-26-AAAAAAAAAAAA" }),
    createPropertyVisitRequest(sql, { ...base, trackingToken: "HIR-26-BBBBBBBBBBBB" }),
  ]);

  assert.deepEqual(results.map((result) => result.kind).sort(), ["created", "duplicate"]);
  const successfulResults = results.filter((result): result is typeof result & { id: string; trackingToken: string } =>
    "id" in result && "trackingToken" in result,
  );
  assert.equal(successfulResults.length, 2);
  assert.equal(successfulResults[0]?.id, successfulResults[1]?.id);
  assert.equal(successfulResults[0]?.trackingToken, successfulResults[1]?.trackingToken);
  assert.equal(visits.length, 1);
  assert.equal((await createPropertyVisitRequest(sql, { ...base, phone: "09123456780", trackingToken: "HIR-26-CCCCCCCCCCCC" })).kind, "conflict");
  assert.match(propertyLockQuery, /for update/i);

  const route = await readFile(new URL("../../server/routes/api/leads.post.ts", import.meta.url), "utf8");
  assert.match(route, /duplicate: visitResult\.kind === "duplicate"/);
  const viewingUi = await readFile(new URL("../components/hirmand/property-viewing-request.tsx", import.meta.url), "utf8");
  assert.match(viewingUi, /if \(!payload\?\.duplicate\) trackAnalyticsEvent\("visit_request"/);
});

test("concurrent reschedules for one property and time cannot both reserve the slot", async () => {
  const leads = [
    { id: "lead-1", property_id: "property-1", visit_status: "requested", visitAt: "2026-11-09T09:00:00.000Z" },
    { id: "lead-2", property_id: "property-1", visit_status: "confirmed", visitAt: "2026-11-09T11:00:00.000Z" },
  ];
  let lockTail = Promise.resolve();
  const lockQueries: string[] = [];
  const transactionSql = {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> => {
      if (/select id, property_id, visit_status from leads/i.test(text)) {
        lockQueries.push(text);
        const lead = leads.find((item) => item.id === String(params[0]));
        return (lead ? [{ id: lead.id, property_id: lead.property_id, visit_status: lead.visit_status }] : []) as T[];
      }
      if (/from properties/i.test(text)) {
        lockQueries.push(text);
        return [{ id: "property-1" }] as T[];
      }
      if (/select id from leads where property_id/i.test(text)) {
        const duplicate = leads.some((item) =>
          item.property_id === String(params[0]) && item.id !== String(params[1]) &&
          item.visit_status !== "cancelled" && item.visitAt === String(params[2]),
        );
        return (duplicate ? [{ id: "existing-visit" }] : []) as T[];
      }
      if (/update leads set visit_preferred_at/i.test(text)) {
        const lead = leads.find((item) => item.id === String(params[0]));
        if (!lead) return [] as T[];
        lead.visitAt = String(params[1]);
        lead.visit_status = "requested";
        return [{ id: lead.id }] as T[];
      }
      throw new Error(`Unexpected reschedule query: ${text}`);
    },
  } as Sql;
  const sql = {
    query: async () => { throw new Error("reschedule queries must run inside a transaction"); },
    transaction: async <T>(callback: (tx: Sql) => Promise<T>): Promise<T> => {
      const previous = lockTail;
      let release!: () => void;
      lockTail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try {
        return await callback(transactionSql);
      } finally {
        release();
      }
    },
  } as unknown as Sql;

  const results = await Promise.all([
    reschedulePropertyVisitRequest(sql, { leadId: "lead-1", visitAt: "2026-11-09T10:00:00.000Z" }),
    reschedulePropertyVisitRequest(sql, { leadId: "lead-2", visitAt: "2026-11-09T10:00:00.000Z" }),
  ]);

  assert.deepEqual(results.map((result) => result.kind).sort(), ["conflict", "updated"]);
  assert.equal(leads.filter((lead) => lead.visitAt === "2026-11-09T10:00:00.000Z").length, 1);
  assert.equal(lockQueries.length, 4);
  assert.ok(lockQueries.every((query) => /for update/i.test(query)));
});

test("PGlite serializes concurrent visit creation and rescheduling on the property row", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table properties (
        id text primary key, title text, property_type text, neighborhood text,
        contact_name text, status text, availability_status text, deleted_at timestamptz,
        publish_at timestamptz, unpublish_at timestamptz
      );
      create table leads (
        id text primary key, name text, phone text, people_count integer, job text,
        deal text, property_type text, neighborhood text, consultant text, note text,
        source text, follow_up_at timestamptz, floor_preference text, property_id text,
        visit_preferred_at timestamptz, visit_requested_at timestamptz, visit_status text,
        public_tracking_token text, updated_at timestamptz default current_timestamp
      );
      insert into properties(id,title,property_type,neighborhood,contact_name,status,availability_status)
        values ('property-1','Sample','apartment','Center','Agent','published','available');
    `);

    const sql = {
      transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) =>
        pg.transaction(async (transaction) => callback({
          query: async <R = Record<string, unknown>>(query: string, params: unknown[] = []) =>
            (await transaction.query(query, params)).rows as R[],
        } as Sql)),
    } as Sql;
    const request = {
      propertyId: "property-1",
      visitAt: "2026-11-09T10:00:00.000Z",
      name: "Customer",
      phone: "09123456789",
      peopleCount: null,
      job: "",
      floorPreference: "",
      consultant: "",
      note: "Visit request",
    };

    const createResults = await Promise.all([
      createPropertyVisitRequest(sql, { ...request, trackingToken: "HIR-26-AAAAAAAAAAAA" }),
      createPropertyVisitRequest(sql, { ...request, trackingToken: "HIR-26-BBBBBBBBBBBB" }),
    ]);
    assert.deepEqual(createResults.map((result) => result.kind).sort(), ["created", "duplicate"]);
    const successfulCreates = createResults.filter((result): result is typeof result & { id: string; trackingToken: string } =>
      "id" in result && "trackingToken" in result,
    );
    assert.equal(successfulCreates.length, 2);
    assert.equal(successfulCreates[0]?.id, successfulCreates[1]?.id);
    assert.equal(successfulCreates[0]?.trackingToken, successfulCreates[1]?.trackingToken);
    const otherPhone = await createPropertyVisitRequest(sql, { ...request, phone: "09123456780", trackingToken: "HIR-26-CCCCCCCCCCCC" });
    assert.equal(otherPhone.kind, "conflict");

    await pg.exec(`
      insert into leads(id,property_id,visit_status,visit_preferred_at) values
        ('lead-1','property-1','requested','2026-11-09T09:00:00Z'),
        ('lead-2','property-1','confirmed','2026-11-09T11:00:00Z');
    `);
    const rescheduleResults = await Promise.all([
      reschedulePropertyVisitRequest(sql, { leadId: "lead-1", visitAt: "2026-11-09T12:00:00.000Z" }),
      reschedulePropertyVisitRequest(sql, { leadId: "lead-2", visitAt: "2026-11-09T12:00:00.000Z" }),
    ]);
    assert.deepEqual(rescheduleResults.map((result) => result.kind).sort(), ["conflict", "updated"]);

    const booked = await pg.query<{ count: number }>(
      "select count(*)::int as count from leads where property_id='property-1' and visit_preferred_at='2026-11-09T12:00:00Z'",
    );
    assert.equal(booked.rows[0]?.count, 1);
  } finally {
    await pg.close();
  }
});

test("PGlite serializes concurrent open-house RSVPs so capacity and active-phone uniqueness hold", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table properties (
        id text primary key, status text not null, deleted_at timestamptz,
        publish_at timestamptz, unpublish_at timestamptz
      );
      create table property_open_houses (
        id text primary key, property_id text not null, starts_at timestamptz not null,
        capacity integer not null, status text not null
      );
      create table property_open_house_rsvps (
        id text primary key, open_house_id text not null, name text not null,
        phone text not null, party_size integer not null, note text not null default '',
        status text not null default 'requested'
      );
      insert into properties(id,status) values ('property-1','published');
      insert into property_open_houses(id,property_id,starts_at,capacity,status)
        values ('event-1','property-1','2099-11-09T10:00:00Z',3,'scheduled');
    `);
    const migration = await readFile(
      new URL("../../migrations/0061_open_house_rsvp_atomicity.sql", import.meta.url),
      "utf8",
    );
    await pg.exec(migration);
    const sql = {
      transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) =>
        pg.transaction(async (transaction) => callback({
          query: async <R = Record<string, unknown>>(query: string, params: unknown[] = []) =>
            (await transaction.query(query, params)).rows as R[],
        } as Sql)),
    } as Sql;

    const capacityResults = await Promise.all([
      createPropertyOpenHouseRsvp(sql, { eventId: "event-1", name: "One", phone: "09130000001", partySize: 2, note: "" }),
      createPropertyOpenHouseRsvp(sql, { eventId: "event-1", name: "Two", phone: "09130000002", partySize: 2, note: "" }),
    ]);
    assert.deepEqual(capacityResults.map((result) => result.kind).sort(), ["capacity", "created"]);
    const seats = await pg.query<{ booked: number }>(
      "select coalesce(sum(party_size),0)::int as booked from property_open_house_rsvps where open_house_id='event-1' and status <> 'cancelled'",
    );
    assert.equal(seats.rows[0]?.booked, 2);

    const duplicateResults = await Promise.all([
      createPropertyOpenHouseRsvp(sql, { eventId: "event-1", name: "Three", phone: "09130000003", partySize: 1, note: "" }),
      createPropertyOpenHouseRsvp(sql, { eventId: "event-1", name: "Three again", phone: "09130000003", partySize: 1, note: "" }),
    ]);
    assert.deepEqual(duplicateResults.map((result) => result.kind).sort(), ["created", "duplicate"]);
  } finally {
    await pg.close();
  }
});

test("PGlite cancellation racing an RSVP leaves no active RSVP on a cancelled event", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table properties (
        id text primary key, status text not null, deleted_at timestamptz,
        publish_at timestamptz, unpublish_at timestamptz
      );
      create table property_open_houses (
        id text primary key, property_id text not null, starts_at timestamptz not null,
        capacity integer not null, status text not null
      );
      create table property_open_house_rsvps (
        id text primary key, open_house_id text not null, name text not null,
        phone text not null, party_size integer not null, note text not null default '',
        status text not null default 'requested'
      );
      insert into properties(id,status) values ('property-1','published');
      insert into property_open_houses(id,property_id,starts_at,capacity,status)
        values ('event-1','property-1','2099-11-09T10:00:00Z',8,'scheduled');
    `);
    const sql = {
      transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) =>
        pg.transaction(async (transaction) => callback({
          query: async <R = Record<string, unknown>>(query: string, params: unknown[] = []) =>
            (await transaction.query(query, params)).rows as R[],
        } as Sql)),
    } as Sql;

    const [rsvpResult] = await Promise.all([
      createPropertyOpenHouseRsvp(sql, { eventId: "event-1", name: "Guest", phone: "09130000004", partySize: 2, note: "" }),
      cancelPropertyOpenHouse(sql, "event-1"),
    ]);
    assert.ok(["created", "not_found"].includes(rsvpResult.kind));

    const finalState = await pg.query<{ event_status: string; active_rsvps: number }>(`
      select oh.status as event_status,
        (select count(*)::int from property_open_house_rsvps r where r.open_house_id=oh.id and r.status <> 'cancelled') as active_rsvps
      from property_open_houses oh where oh.id='event-1'
    `);
    assert.equal(finalState.rows[0]?.event_status, "cancelled");
    assert.equal(finalState.rows[0]?.active_rsvps, 0);
    assert.equal(await cancelPropertyOpenHouse(sql, "missing-event"), "not_found");

    await pg.exec(`
      insert into property_open_houses(id,property_id,starts_at,capacity,status)
        values ('event-2','property-1','2099-11-09T10:00:00Z',8,'scheduled');
    `);
    const [cancelFirstResult, cancelFirstRsvpResult] = await Promise.all([
      cancelPropertyOpenHouse(sql, "event-2"),
      createPropertyOpenHouseRsvp(sql, { eventId: "event-2", name: "Late Guest", phone: "09130000005", partySize: 1, note: "" }),
    ]);
    assert.equal(cancelFirstResult, "cancelled");
    assert.equal(cancelFirstRsvpResult.kind, "not_found");
    const rejectedSignup = await createPropertyOpenHouseRsvp(sql, {
      eventId: "event-2", name: "Late Guest", phone: "09130000005", partySize: 1, note: "",
    });
    assert.equal(rejectedSignup.kind, "not_found");
    const cancelledFirstState = await pg.query<{ event_status: string; active_rsvps: number }>(`
      select oh.status as event_status,
        (select count(*)::int from property_open_house_rsvps r where r.open_house_id=oh.id and r.status <> 'cancelled') as active_rsvps
      from property_open_houses oh where oh.id='event-2'
    `);
    assert.equal(cancelledFirstState.rows[0]?.event_status, "cancelled");
    assert.equal(cancelledFirstState.rows[0]?.active_rsvps, 0);
  } finally {
    await pg.close();
  }
});

test("open-house RSVP uniqueness migration refuses pre-existing active duplicates without changing them", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table property_open_house_rsvps (
        id text primary key, open_house_id text not null, phone text not null,
        status text not null
      );
      insert into property_open_house_rsvps values
        ('rsvp-1','event-1','09130000006','requested'),
        ('rsvp-2','event-1','09130000006','confirmed');
    `);
    const migration = await readFile(
      new URL("../../migrations/0061_open_house_rsvp_atomicity.sql", import.meta.url),
      "utf8",
    );
    await assert.rejects(pg.exec(migration), /duplicate active event\/phone pairs already exist/);
    const rows = await pg.query<{ id: string; status: string }>(
      "select id,status from property_open_house_rsvps order by id",
    );
    assert.deepEqual(rows.rows, [
      { id: "rsvp-1", status: "requested" },
      { id: "rsvp-2", status: "confirmed" },
    ]);
  } finally {
    await pg.close();
  }
});

test("PGlite serializes open-house creation overlap checks on the property row", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table properties (
        id text primary key, status text not null, deleted_at timestamptz,
        publish_at timestamptz, unpublish_at timestamptz
      );
      create table property_open_houses (
        id text primary key, property_id text not null, starts_at timestamptz not null,
        ends_at timestamptz not null, capacity integer not null, note text not null default '',
        status text not null default 'scheduled'
      );
      insert into properties(id,status) values ('property-1','published'),('property-2','published');
    `);
    const sql = {
      transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) =>
        pg.transaction(async (transaction) => callback({
          query: async <R = Record<string, unknown>>(query: string, params: unknown[] = []) =>
            (await transaction.query(query, params)).rows as R[],
        } as Sql)),
    } as Sql;
    const base = {
      propertyId: "property-1",
      startsAt: "2099-11-09T10:00:00.000Z",
      endsAt: "2099-11-09T11:00:00.000Z",
      capacity: 8,
      note: "",
    };

    const overlapping = await Promise.all([
      createPropertyOpenHouseEvent(sql, base),
      createPropertyOpenHouseEvent(sql, base),
    ]);
    assert.deepEqual(overlapping.map((result) => result.kind).sort(), ["conflict", "created"]);

    const nonOverlapping = await Promise.all([
      createPropertyOpenHouseEvent(sql, { ...base, startsAt: "2099-11-09T12:00:00.000Z", endsAt: "2099-11-09T13:00:00.000Z" }),
      createPropertyOpenHouseEvent(sql, { ...base, startsAt: "2099-11-09T14:00:00.000Z", endsAt: "2099-11-09T15:00:00.000Z" }),
    ]);
    assert.deepEqual(nonOverlapping.map((result) => result.kind), ["created", "created"]);

    const independentProperty = await createPropertyOpenHouseEvent(sql, {
      ...base,
      propertyId: "property-2",
    });
    assert.equal(independentProperty.kind, "created");

    await pg.exec("update properties set unpublish_at=current_timestamp - interval '1 day' where id='property-2'");
    const hiddenProperty = await createPropertyOpenHouseEvent(sql, {
      ...base,
      propertyId: "property-2",
      startsAt: "2099-11-09T16:00:00.000Z",
      endsAt: "2099-11-09T17:00:00.000Z",
    });
    assert.equal(hiddenProperty.kind, "not_found");
  } finally {
    await pg.close();
  }
});

test("public visit requests reject soft-deleted, unpublished and future-scheduled properties", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table properties (
        id text primary key, title text not null, property_type text not null,
        neighborhood text not null, contact_name text not null, status text not null,
        availability_status text not null, deleted_at timestamptz,
        publish_at timestamptz, unpublish_at timestamptz
      );
      create table leads (id text primary key);
      insert into properties(id,title,property_type,neighborhood,contact_name,status,availability_status,deleted_at)
        values ('deleted','Deleted','apartment','Center','Agent','published','available',current_timestamp);
      insert into properties(id,title,property_type,neighborhood,contact_name,status,availability_status,unpublish_at)
        values ('unpublished','Unpublished','apartment','Center','Agent','published','available',current_timestamp - interval '1 second');
      insert into properties(id,title,property_type,neighborhood,contact_name,status,availability_status,publish_at)
        values ('future-draft','Future draft','apartment','Center','Agent','draft','available',current_timestamp + interval '1 day');
    `);
    const sql = {
      transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) =>
        pg.transaction(async (transaction) => callback({
          query: async <R = Record<string, unknown>>(query: string, params: unknown[] = []) =>
            (await transaction.query(query, params)).rows as R[],
        } as Sql)),
    } as Sql;
    const base = {
      visitAt: "2099-11-09T10:00:00.000Z",
      trackingToken: "HIR-26-AAAAAAAAAAAA",
      name: "Guest",
      phone: "09130000001",
      peopleCount: 1,
      job: "",
      floorPreference: "",
      consultant: "Agent",
      note: "Visit request",
    };

    for (const propertyId of ["deleted", "unpublished", "future-draft"]) {
      const result = await createPropertyVisitRequest(sql, { ...base, propertyId });
      assert.equal(result.kind, "not_found", `${propertyId} must not accept a public visit request`);
    }
    const leads = await pg.query<{ count: number }>("select count(*)::int as count from leads");
    assert.equal(leads.rows[0]?.count, 0);
  } finally {
    await pg.close();
  }
});
