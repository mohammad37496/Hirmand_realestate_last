import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { mergeAdminLeadDuplicate } from "./admin-lead-dedupe.ts";
import type { Sql } from "./db.ts";

async function createFixture() {
  const pg = new PGlite();
  await pg.exec(`
    create table leads (
      id text primary key, name text not null, phone text not null,
      people_count integer, job text, deal text, property_type text, neighborhood text,
      consultant text, note text, status text not null, source text,
      acquisition_source text, acquisition_medium text, acquisition_campaign text,
      acquisition_referrer text, follow_up_at timestamptz, last_contacted_at timestamptz,
      property_id text, visit_preferred_at timestamptz, visit_requested_at timestamptz,
      visit_status text, lease_deadline timestamptz, budget_deposit numeric,
      budget_rent numeric, budget_purchase numeric, budget_sale numeric,
      budget_deposit_min numeric, budget_deposit_max numeric, budget_rent_min numeric,
      budget_rent_max numeric, budget_purchase_min numeric, budget_purchase_max numeric,
      budget_sale_min numeric, budget_sale_max numeric, budget_equivalent numeric,
      budget_bedrooms integer, budget_rate numeric, requested_bedrooms integer,
      requested_amenities jsonb, matched_properties jsonb, match_count integer,
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp
    );
    create table lead_activities (
      id bigserial primary key, lead_id text not null, activity_type text not null,
      title text not null default '', note text not null default '', metadata jsonb not null default '{}'::jsonb
    );
    insert into leads(id,name,phone,status,note,source,requested_amenities,matched_properties,match_count)
      values
        ('A','Canonical A','09123456789','new','','website','[]'::jsonb,'[]'::jsonb,0),
        ('B','Duplicate B','09123456789','new','B-only context','divar','[]'::jsonb,'[]'::jsonb,0),
        ('C','Canonical C','09123456789','new','','website','[]'::jsonb,'[]'::jsonb,0);
    insert into lead_activities(lead_id,activity_type,title,note)
      values ('B','note','B activity','Activity must move exactly once');
  `);
  const sql = {
    transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) =>
      pg.transaction(async (tx) => callback({
        query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) =>
          (await tx.query(text, params)).rows as R[],
      } as Sql)),
    query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query(text, params)).rows as R[],
  } as Sql;
  return { pg, sql };
}

test("a closed duplicate is excluded from active suggestions and rejected by stale merge IDs", async () => {
  const { pg, sql } = await createFixture();
  try {
    assert.deepEqual(await mergeAdminLeadDuplicate(sql, "A", "B"), {
      kind: "merged",
      movedActivities: 1,
    });

    const activeCandidates = await sql.query<{ id: string }>(
      "select id from leads where status not in ('closed','spam') and regexp_replace(phone,'[^0-9]','','g')=$1 order by id",
      ["09123456789"],
    );
    assert.deepEqual(activeCandidates.map((row) => row.id), ["A", "C"]);

    assert.deepEqual(await mergeAdminLeadDuplicate(sql, "C", "B"), {
      kind: "duplicate_inactive",
    });
    const leads = await sql.query<{ id: string; name: string; note: string; status: string; source: string }>(
      "select id,name,note,status,source from leads order by id",
    );
    assert.deepEqual(leads[0], { id: "A", name: "Canonical A", note: "B-only context", status: "new", source: "website" });
    assert.equal(leads[1]?.id, "B");
    assert.equal(leads[1]?.name, "Duplicate B");
    assert.equal(leads[1]?.status, "closed");
    assert.match(leads[1]?.note ?? "", /^B-only context\nاین لید در .+ با لید A ادغام شد\.$/);
    assert.deepEqual(leads[2], { id: "C", name: "Canonical C", note: "", status: "new", source: "website" });
    const activities = await sql.query<{ lead_id: string; title: string }>(
      "select lead_id,title from lead_activities order by id",
    );
    assert.deepEqual(activities.map((row) => row.lead_id), ["A", "A"]);
    assert.ok(activities.some((row) => row.title === "ادغام لید تکراری"));
  } finally {
    await pg.close();
  }
});

test("two concurrent merge requests cannot consume the same duplicate lead", async () => {
  const { pg, sql } = await createFixture();
  try {
    const results = await Promise.all([
      mergeAdminLeadDuplicate(sql, "A", "B"),
      mergeAdminLeadDuplicate(sql, "C", "B"),
    ]);
    assert.equal(results.filter((result) => result.kind === "merged").length, 1);
    assert.equal(results.filter((result) => result.kind === "duplicate_inactive").length, 1);
    const activities = await sql.query<{ lead_id: string; title: string }>(
      "select lead_id,title from lead_activities order by id",
    );
    assert.equal(activities.filter((row) => row.title === "B activity").length, 1);
    assert.notEqual(activities.find((row) => row.title === "B activity")?.lead_id, "B");
    const duplicate = await sql.query<{ status: string }>("select status from leads where id='B'");
    assert.equal(duplicate[0]?.status, "closed");
  } finally {
    await pg.close();
  }
});

test("lead dedupe suggestions and preview exclude closed and spam leads", async () => {
  const route = await readFile(
    new URL("../../server/routes/api/admin-lead-dedupe.post.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /from leads\s+where status not in \('closed','spam'\)/i);
  assert.match(route, /from leads where id = any\(\$1::text\[\]\) and status not in \('closed','spam'\)/i);
  assert.match(route, /mergeAdminLeadDuplicate\(sql, canonicalId, duplicateId\)/);
  assert.match(route, /statusCode: 409[\s\S]*?قبلاً بسته یا ادغام شده است/);
});
