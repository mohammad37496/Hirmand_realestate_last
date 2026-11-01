import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { MERGE_LEADS_WITH_ACTIVITY_SQL } from "./admin-lead-dedupe-sql.ts";
import { lockLeadDedupeSnapshot } from "./admin-lead-dedupe.server.ts";
import { planLeadVisitMerge } from "./property-visit-scheduling.server.ts";

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create table leads (
      id text primary key, status text not null default 'new', merged_into_lead_id text, name text, phone text,
      people_count integer, job text, deal text, property_type text, neighborhood text, consultant text,
      note text, source text, acquisition_source text, acquisition_medium text, acquisition_campaign text,
      acquisition_referrer text, follow_up_at timestamptz, last_contacted_at timestamptz,
      callback_preferred_at timestamptz, offer_amount numeric, offer_conditions text,
      property_id text, visit_preferred_at timestamptz, visit_requested_at timestamptz,
      visit_status text not null default 'none', lease_deadline timestamptz,
      budget_deposit numeric, budget_rent numeric, budget_purchase numeric, budget_sale numeric,
      budget_deposit_min numeric, budget_deposit_max numeric, budget_rent_min numeric, budget_rent_max numeric,
      budget_purchase_min numeric, budget_purchase_max numeric, budget_sale_min numeric, budget_sale_max numeric,
      budget_equivalent numeric, budget_bedrooms integer, budget_rate numeric, requested_bedrooms integer,
      requested_amenities jsonb not null default '[]'::jsonb, matched_properties jsonb not null default '[]'::jsonb,
      match_count integer not null default 0, updated_at timestamptz not null default current_timestamp
    );
    create table lead_activities (
      id text primary key default gen_random_uuid()::text, lead_id text not null, activity_type text not null,
      title text not null, note text not null default '', metadata jsonb not null default '{}'::jsonb
    );
  `);
  return db;
}

async function insertLead(db: PGlite, input: {
  id: string;
  propertyId?: string | null;
  visitAt?: string | null;
  visitStatus?: string;
  status?: string;
}) {
  await db.query(
    "insert into leads(id,status,name,phone,property_id,visit_preferred_at,visit_requested_at,visit_status) values($1,$2,$3,$4,$5,$6,$6,$7)",
    [input.id, input.status ?? "new", input.id, "09130000001", input.propertyId ?? null, input.visitAt ?? null, input.visitStatus ?? "none"],
  );
}

async function merge(db: PGlite, canonicalId: string, duplicateId: string) {
  return db.query<{ canonical_id: string; duplicate_id: string; moved_activities: number }>(
    MERGE_LEADS_WITH_ACTIVITY_SQL,
    [canonicalId, duplicateId, [canonicalId, duplicateId]],
  );
}

test("dedupe SQL moves the duplicate's only active visit onto a canonical lead", async () => {
  const db = await fixture();
  try {
    await insertLead(db, {
      id: "canonical", propertyId: "property-1", visitAt: "2030-05-30T08:00:00Z", visitStatus: "none",
    });
    await insertLead(db, {
      id: "duplicate", propertyId: "property-1", visitAt: "2030-06-01T10:00:00Z", visitStatus: "requested",
    });
    await db.query(
      "insert into lead_activities(id,lead_id,activity_type,title) values('activity-1','duplicate','visit','Requested')",
    );

    const result = await merge(db, "canonical", "duplicate");
    assert.equal(result.rows[0]?.canonical_id, "canonical");
    assert.equal(result.rows[0]?.duplicate_id, "duplicate");
    const leads = await db.query<{ id: string; status: string; visit_status: string; visit_preferred_at: string | null }>(
      "select id,status,visit_status,visit_preferred_at::text as visit_preferred_at from leads order by id",
    );
    assert.equal(leads.rows[0]?.visit_status, "requested");
    assert.equal(Date.parse(String(leads.rows[0]?.visit_preferred_at)), Date.parse("2030-06-01T10:00:00Z"));
    assert.equal(leads.rows[1]?.status, "closed");
    assert.equal(leads.rows[1]?.visit_status, "cancelled");
    const active = await db.query<{ count: number }>(
      "select count(*)::int as count from leads where visit_status in ('requested','confirmed')",
    );
    assert.equal(active.rows[0]?.count, 1);
    const activities = await db.query<{ lead_id: string }>("select lead_id from lead_activities where id='activity-1'");
    assert.equal(activities.rows[0]?.lead_id, "canonical");
    const history = await db.query<{ title: string; metadata: { mergedLeadId: string } }>(
      "select title,metadata from lead_activities where title='ادغام لید تکراری'",
    );
    assert.equal(history.rows.length, 1);
    assert.equal(history.rows[0]?.metadata.mergedLeadId, "duplicate");
    const marker = await db.query<{ merged_into_lead_id: string }>("select merged_into_lead_id from leads where id='duplicate'");
    assert.equal(marker.rows[0]?.merged_into_lead_id, "canonical");
  } finally {
    await db.close();
  }
});

test("dedupe SQL keeps the canonical active visit and cancels the duplicate slot", async () => {
  const db = await fixture();
  try {
    await insertLead(db, {
      id: "canonical", propertyId: "property-1", visitAt: "2030-06-01T10:00:00Z", visitStatus: "confirmed",
    });
    await insertLead(db, {
      id: "duplicate", propertyId: "property-1", visitAt: "2030-06-01T10:30:00Z", visitStatus: "requested",
    });
    await merge(db, "canonical", "duplicate");
    const rows = await db.query<{ id: string; visit_status: string; visit_preferred_at: string }>(
      "select id,visit_status,visit_preferred_at::text as visit_preferred_at from leads order by id",
    );
    assert.equal(rows.rows[0]?.visit_status, "confirmed");
    assert.equal(Date.parse(String(rows.rows[0]?.visit_preferred_at)), Date.parse("2030-06-01T10:00:00Z"));
    assert.equal(rows.rows[1]?.visit_status, "cancelled");
  } finally {
    await db.close();
  }
});

test("dedupe planner rejects moving an active visit onto cancelled or completed canonical history", () => {
  for (const status of ["cancelled", "completed"]) {
    assert.equal(planLeadVisitMerge(
      { property_id: "property-1", visit_preferred_at: "2030-06-01T08:00:00Z", visit_status: status },
      { property_id: "property-1", visit_preferred_at: "2030-06-01T10:00:00Z", visit_status: "requested" },
    ).kind, "conflicting_visits");
  }
});

test("dedupe SQL itself refuses to consume an active duplicate visit when canonical visit history is terminal", async () => {
  const db = await fixture();
  try {
    for (const status of ["cancelled", "completed"]) {
      await insertLead(db, { id: "canonical-" + status, propertyId: "property-1", visitAt: "2030-06-01T08:00:00Z", visitStatus: status });
      await insertLead(db, { id: "duplicate-" + status, propertyId: "property-1", visitAt: "2030-06-01T10:00:00Z", visitStatus: "requested" });
      const before = await db.query<{ id: string; visit_status: string }>("select id,visit_status from leads where id=any($1::text[]) order by id", [["canonical-" + status, "duplicate-" + status]]);
      assert.deepEqual(before.rows.map((row) => row.visit_status), [status, "requested"]);
      const result = await merge(db, "canonical-" + status, "duplicate-" + status);
      assert.equal(result.rows[0]?.canonical_id, null);
      const duplicate = await db.query<{ status: string; visit_status: string; merged_into_lead_id: string | null }>(
        "select status,visit_status,merged_into_lead_id from leads where id=$1",
        ["duplicate-" + status],
      );
      assert.equal(duplicate.rows[0]?.status, "new");
      assert.equal(duplicate.rows[0]?.visit_status, "requested");
      assert.equal(duplicate.rows[0]?.merged_into_lead_id, null);
    }
  } finally {
    await db.close();
  }
});

test("dedupe lead-row lock rejects a visit cancellation that changed after the route snapshot", async () => {
  const db = await fixture();
  try {
    await insertLead(db, { id: "canonical", propertyId: "property-1", visitAt: null, visitStatus: "none" });
    await insertLead(db, { id: "duplicate", propertyId: "property-1", visitAt: "2030-06-01T10:00:00Z", visitStatus: "requested" });
    const snapshot = await db.query<{
      id: string;
      status: string;
      merged_into_lead_id: string | null;
      property_id: string | null;
      visit_preferred_at: string | null;
      visit_status: string | null;
    }>("select id,status,merged_into_lead_id,property_id,visit_preferred_at,visit_status from leads where id=any($1::text[]) order by id", [["canonical", "duplicate"]]);
    await db.query("update leads set visit_status='cancelled' where id='duplicate'");
    const tx = {
      query: async <T = Record<string, unknown>>(text: string, params?: unknown[]) =>
        (await db.query<T>(text, params)).rows,
    };
    const result = await lockLeadDedupeSnapshot(tx, "canonical", "duplicate", snapshot.rows);
    assert.equal(result.kind, "stale");
    const duplicate = await db.query<{ visit_status: string; merged_into_lead_id: string | null }>(
      "select visit_status,merged_into_lead_id from leads where id='duplicate'",
    );
    assert.deepEqual(duplicate.rows[0], { visit_status: "cancelled", merged_into_lead_id: null });
  } finally {
    await db.close();
  }
});
