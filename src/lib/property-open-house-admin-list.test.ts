import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { hasAdminPermission } from "./admin-roles.ts";
import { listOpenHouseAdminData } from "./property-open-house-admin-list.ts";
import { createPropertyVisitRequest, reschedulePropertyVisitRequest } from "./property-visit-request.ts";
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
  const visits: Array<{ propertyId: string; visitAt: string }> = [];
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
      if (/select id from leads/i.test(text)) {
        const duplicate = visits.some((visit) =>
          visit.propertyId === String(params[0]) && visit.visitAt === String(params[1]),
        );
        return (duplicate ? [{ id: "existing-visit" }] : []) as T[];
      }
      if (/insert into leads/i.test(text)) {
        visits.push({ propertyId: String(params[11]), visitAt: String(params[12]) });
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

  assert.deepEqual(results.map((result) => result.kind).sort(), ["conflict", "created"]);
  assert.equal(visits.length, 1);
  assert.match(propertyLockQuery, /for update/i);
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
        contact_name text, status text, availability_status text
      );
      create table leads (
        id text primary key, name text, phone text, people_count integer, job text,
        deal text, property_type text, neighborhood text, consultant text, note text,
        source text, follow_up_at timestamptz, floor_preference text, property_id text,
        visit_preferred_at timestamptz, visit_requested_at timestamptz, visit_status text,
        public_tracking_token text, updated_at timestamptz default current_timestamp
      );
      insert into properties values ('property-1','Sample','apartment','Center','Agent','published','available');
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
    assert.deepEqual(createResults.map((result) => result.kind).sort(), ["conflict", "created"]);

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
