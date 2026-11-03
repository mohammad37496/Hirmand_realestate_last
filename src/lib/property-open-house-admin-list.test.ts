import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { hasAdminPermission } from "./admin-roles.ts";
import { listOpenHouseAdminData } from "./property-open-house-admin-list.ts";

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
