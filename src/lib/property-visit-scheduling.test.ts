import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  checkPropertyVisitSlot,
  cancelPropertyVisit,
  planLeadVisitMerge,
  reschedulePropertyVisit,
} from "./property-visit-scheduling.server.ts";

function sqlFor(tx: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }) {
  return {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await tx.query(text, params)).rows as T[],
  };
}

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create table properties (
      id text primary key, title text not null default '', property_type text not null default '',
      neighborhood text not null default '', contact_name text not null default '',
      status text not null default 'published', availability_status text not null default 'available'
    );
    create table leads (
      id text primary key, property_id text, visit_preferred_at timestamptz,
      visit_status text not null default 'none', public_tracking_token text,
      updated_at timestamptz not null default current_timestamp
    );
    insert into properties(id) values ('property-1');
  `);
  return db;
}

function transaction<T>(db: PGlite, callback: (sql: ReturnType<typeof sqlFor>) => Promise<T>) {
  return db.transaction(async (tx) => callback(sqlFor(tx)));
}

test("concurrent public visit requests for one property and time admit one lead", async () => {
  const db = await fixture();
  try {
    const reserve = (id: string) => transaction(db, async (tx) => {
      const slot = await checkPropertyVisitSlot(tx, {
        propertyId: "property-1",
        visitAt: "2030-06-01T10:00:00.000Z",
      });
      if (slot.kind !== "available") return slot.kind;
      await tx.query(
        "insert into leads(id,property_id,visit_preferred_at,visit_status) values($1,$2,$3,'requested')",
        [id, "property-1", "2030-06-01T10:00:00.000Z"],
      );
      return "created";
    });
    const results = await Promise.all([reserve("lead-a"), reserve("lead-b")]);
    assert.equal(results.filter((result) => result === "created").length, 1);
    assert.equal(results.filter((result) => result === "conflict").length, 1);
    const active = await db.query<{ count: number }>(
      "select count(*)::int as count from leads where property_id='property-1' and visit_status in ('requested','confirmed')",
    );
    assert.equal(active.rows[0]?.count, 1);
  } finally {
    await db.close();
  }
});

test("visit conflict keeps the existing strict 45-minute boundary and ignores the lead being rescheduled", async () => {
  const db = await fixture();
  try {
    await db.query(
      "insert into leads(id,property_id,visit_preferred_at,visit_status) values('existing','property-1','2030-06-01T10:00:00Z','confirmed')",
    );
    const at44m = await transaction(db, (tx) => checkPropertyVisitSlot(tx, {
      propertyId: "property-1", visitAt: "2030-06-01T10:44:59Z",
    }));
    const at45m = await transaction(db, (tx) => checkPropertyVisitSlot(tx, {
      propertyId: "property-1", visitAt: "2030-06-01T10:45:00Z",
    }));
    const excludingSelf = await transaction(db, (tx) => checkPropertyVisitSlot(tx, {
      propertyId: "property-1", visitAt: "2030-06-01T10:00:00Z", excludeLeadIds: ["existing"],
    }));
    assert.equal(at44m.kind, "conflict");
    assert.equal(at45m.kind, "available");
    assert.equal(excludingSelf.kind, "available");
  } finally {
    await db.close();
  }
});

test("public reschedule cannot resurrect a visit cancelled after its tracking read", async () => {
  const db = await fixture();
  try {
    await db.query(
      "insert into leads(id,property_id,visit_preferred_at,visit_status,public_tracking_token) values('lead-1','property-1','2030-06-01T10:00:00Z','cancelled','HIR-30-ABCDEF123456')",
    );
    const result = await transaction(db, (tx) => reschedulePropertyVisit(tx, {
      leadId: "lead-1",
      trackingToken: "HIR-30-ABCDEF123456",
      propertyId: "property-1",
      expectedVisitAt: "2030-06-01T10:00:00Z",
      visitAt: "2030-06-01T12:00:00Z",
    }));
    assert.equal(result, "stale");
    const lead = await db.query<{ visit_status: string }>("select visit_status from leads where id='lead-1'");
    assert.equal(lead.rows[0]?.visit_status, "cancelled");
  } finally {
    await db.close();
  }
});

test("public cancellation cannot cancel a newer visit time from a stale tracking page", async () => {
  const db = await fixture();
  try {
    await db.query(
      "insert into leads(id,property_id,visit_preferred_at,visit_status,public_tracking_token) values('lead-1','property-1','2030-06-01T12:00:00Z','confirmed','HIR-30-ABCDEF123456')",
    );
    const result = await transaction(db, (tx) => cancelPropertyVisit(tx, {
      leadId: "lead-1",
      trackingToken: "HIR-30-ABCDEF123456",
      propertyId: "property-1",
      expectedVisitAt: "2030-06-01T10:00:00Z",
    }));
    assert.equal(result, "stale");
    const lead = await db.query<{ visit_status: string; visit_preferred_at: string }>(
      "select visit_status,visit_preferred_at::text as visit_preferred_at from leads where id='lead-1'",
    );
    assert.equal(lead.rows[0]?.visit_status, "confirmed");
    assert.equal(Date.parse(String(lead.rows[0]?.visit_preferred_at)), Date.parse("2030-06-01T12:00:00Z"));
  } finally {
    await db.close();
  }
});

test("concurrent reschedules cannot overwrite a newer visit time", async () => {
  const db = await fixture();
  try {
    await db.query(
      "insert into leads(id,property_id,visit_preferred_at,visit_status,public_tracking_token) values('lead-1','property-1','2030-06-01T10:00:00Z','confirmed','HIR-30-ABCDEF123456')",
    );
    const reschedule = (visitAt: string) => transaction(db, (tx) => reschedulePropertyVisit(tx, {
      leadId: "lead-1",
      trackingToken: "HIR-30-ABCDEF123456",
      propertyId: "property-1",
      expectedVisitAt: "2030-06-01T10:00:00Z",
      visitAt,
    }));
    const results = await Promise.all([
      reschedule("2030-06-01T12:00:00Z"),
      reschedule("2030-06-01T14:00:00Z"),
    ]);
    assert.equal(results.filter((result) => result === "rescheduled").length, 1);
    assert.equal(results.filter((result) => result === "stale").length, 1);
    const lead = await db.query<{ visit_preferred_at: string }>("select visit_preferred_at::text as visit_preferred_at from leads where id='lead-1'");
    const finalVisitTime = Date.parse(String(lead.rows[0]?.visit_preferred_at ?? ""));
    assert.ok([
      Date.parse("2030-06-01T12:00:00Z"),
      Date.parse("2030-06-01T14:00:00Z"),
    ].includes(finalVisitTime));
  } finally {
    await db.close();
  }
});

test("visit merge keeps one shared booking, moves a single active booking, and rejects distinct active bookings", () => {
  const canonical = {
    property_id: "property-1", visit_preferred_at: "2030-06-01T10:00:00Z", visit_status: "confirmed",
  };
  const sameSlot = {
    property_id: "property-1", visit_preferred_at: "2030-06-01T10:30:00Z", visit_status: "requested",
  };
  assert.deepEqual(planLeadVisitMerge(canonical, sameSlot), {
    kind: "keep_canonical", propertyId: "property-1", visitAt: "2030-06-01T10:00:00Z",
  });
  assert.deepEqual(planLeadVisitMerge(
    { property_id: "property-1", visit_preferred_at: null, visit_status: "none" },
    { property_id: "property-1", visit_preferred_at: "2030-06-01T10:00:00Z", visit_status: "requested" },
  ), { kind: "move_duplicate", propertyId: "property-1", visitAt: "2030-06-01T10:00:00Z" });
  assert.equal(planLeadVisitMerge(canonical, {
    property_id: "property-2", visit_preferred_at: "2030-06-01T10:00:00Z", visit_status: "requested",
  }).kind, "conflicting_visits");
  assert.equal(planLeadVisitMerge(canonical, {
    property_id: "property-1", visit_preferred_at: "2030-06-01T10:45:00Z", visit_status: "requested",
  }).kind, "conflicting_visits");
  for (const status of ["cancelled", "completed"]) {
    assert.equal(planLeadVisitMerge(
      { property_id: "property-1", visit_preferred_at: "2030-06-01T08:00:00Z", visit_status: status },
      { property_id: "property-1", visit_preferred_at: "2030-06-01T10:00:00Z", visit_status: "requested" },
    ).kind, "conflicting_visits");
  }
});
