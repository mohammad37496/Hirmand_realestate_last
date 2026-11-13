import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db.ts";
import { fetchPropertyViewingSlots } from "./property-viewing-availability.ts";
import { getPublicPropertyViewingSlots } from "./property-viewing-slots.ts";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("viewing availability accepts a successful empty result as verified capacity", async () => {
  const occupiedTimes = await fetchPropertyViewingSlots("property/1", "2026-11-12", async (input, init) => {
    assert.equal(String(input), "/api/property-viewing-slots?propertyId=property%2F1&date=2026-11-12");
    assert.equal(init?.method, "GET");
    assert.equal(init?.credentials, "same-origin");
    return jsonResponse({ success: true, occupiedTimes: [], checkedAt: "2026-11-11T10:00:00.000Z" });
  });

  assert.deepEqual(occupiedTimes, []);
});

test("viewing availability keeps only string occupied slots from a successful response", async () => {
  const occupiedTimes = await fetchPropertyViewingSlots("property-1", "2026-11-12", async () =>
    jsonResponse({ success: true, occupiedTimes: ["10:00", 10, null, "11:30"] }),
  );

  assert.deepEqual(occupiedTimes, ["10:00", "11:30"]);
});

test("viewing availability rejects an HTTP error even when its body resembles a success", async () => {
  await assert.rejects(
    fetchPropertyViewingSlots("property-1", "2026-11-12", async () =>
      jsonResponse({ success: true, occupiedTimes: [] }, 500),
    ),
    /could not be verified/i,
  );
});

test("an unconfigured database response cannot verify an empty day as free capacity", async () => {
  await assert.rejects(
    fetchPropertyViewingSlots("property-1", "2026-11-12", async () =>
      jsonResponse({ success: false, message: "availability unavailable" }, 503),
    ),
    /could not be verified/i,
  );
});

test("viewing availability rejects an unsuccessful or malformed payload", async () => {
  await assert.rejects(
    fetchPropertyViewingSlots("property-1", "2026-11-12", async () =>
      jsonResponse({ success: false, message: "database unavailable" }),
    ),
    /could not be verified/i,
  );
  await assert.rejects(
    fetchPropertyViewingSlots("property-1", "2026-11-12", async () =>
      new Response("not json", { status: 200 }),
    ),
    /could not be verified/i,
  );
  await assert.rejects(
    fetchPropertyViewingSlots("property-1", "2026-11-12", async () =>
      jsonResponse({ success: true, occupiedTimes: "10:00" }),
    ),
    /could not be verified/i,
  );
});

test("viewing availability propagates network failures instead of treating them as an empty day", async () => {
  await assert.rejects(
    fetchPropertyViewingSlots("property-1", "2026-11-12", async () => {
      throw new TypeError("Failed to fetch");
    }),
    /Failed to fetch/,
  );
});

test("public viewing slots hide non-public property schedules and retain the 45-minute overlap window", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table properties (
        id text primary key,
        deleted_at timestamptz,
        status text not null,
        publish_at timestamptz,
        unpublish_at timestamptz
      );
      create table leads (
        id text primary key,
        property_id text not null references properties(id),
        visit_status text not null,
        visit_preferred_at timestamptz
      );
      insert into properties(id,status,publish_at,unpublish_at,deleted_at) values
        ('public','published',null,null,null),
        ('due-draft','draft','2026-11-11T00:00:00Z',null,null),
        ('future-draft','draft','2027-11-13T00:00:00Z',null,null),
        ('expired','published',null,'2026-11-11T00:00:00Z',null),
        ('deleted','published',null,null,'2026-11-11T00:00:00Z');
      insert into leads(id,property_id,visit_status,visit_preferred_at) values
        ('requested','public','requested','2026-11-12T10:00:00+03:30'),
        ('confirmed','public','confirmed','2026-11-12T11:00:00+03:30'),
        ('cancelled','public','cancelled','2026-11-12T12:00:00+03:30'),
        ('completed','public','completed','2026-11-12T13:00:00+03:30'),
        ('hidden-request','future-draft','requested','2026-11-12T10:00:00+03:30'),
        ('expired-request','expired','confirmed','2026-11-12T11:00:00+03:30'),
        ('deleted-request','deleted','confirmed','2026-11-12T12:00:00+03:30');
    `);

    const sql = {
      query: async <T = Record<string, unknown>>(statement: string, params: unknown[] = []) =>
        (await pg.query<T>(statement, params)).rows,
    } as Pick<Sql, "query">;

    assert.deepEqual(
      await getPublicPropertyViewingSlots(sql, "public", "2026-11-12"),
      { kind: "found", occupiedTimes: ["09:30", "10:00", "10:30", "11:00", "11:30"] },
    );
    assert.deepEqual(
      await getPublicPropertyViewingSlots(sql, "due-draft", "2026-11-12"),
      { kind: "found", occupiedTimes: [] },
    );

    for (const propertyId of ["future-draft", "expired", "deleted", "missing"]) {
      assert.deepEqual(await getPublicPropertyViewingSlots(sql, propertyId, "2026-11-12"), { kind: "not_found" });
    }
  } finally {
    await pg.close();
  }
});
