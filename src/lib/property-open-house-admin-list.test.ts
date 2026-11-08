import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { hasAdminPermission } from "./admin-roles.ts";
import { listOpenHouseAdminData } from "./property-open-house-admin-list.ts";
import { createPropertyVisitRequest } from "./property-visit-request.ts";
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
