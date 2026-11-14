import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db.ts";
import { mergeAdminLeadDuplicate } from "./admin-lead-dedupe.ts";

async function createFixture() {
  const pg = new PGlite();
  await pg.exec(`
    create table consultants (id text primary key, name text not null);
    create table leads (
      id text primary key, status text not null, name text not null, phone text not null,
      people_count integer, job text, deal text, property_type text, neighborhood text,
      consultant text, consultant_id text, consultant_link_state text not null default 'legacy_unresolved',
      note text, source text, acquisition_source text, acquisition_medium text,
      acquisition_campaign text, acquisition_referrer text, acquisition_landing_path text,
      follow_up_at timestamptz, last_contacted_at timestamptz, property_id text,
      visit_preferred_at timestamptz, visit_requested_at timestamptz, visit_status text,
      lease_deadline timestamptz, floor_preference text not null default '',
      callback_preferred_at timestamptz, offer_amount numeric(20,0), offer_conditions text not null default '',
      budget_deposit numeric, budget_rent numeric, budget_purchase numeric, budget_sale numeric,
      budget_deposit_min numeric, budget_deposit_max numeric, budget_rent_min numeric,
      budget_rent_max numeric, budget_purchase_min numeric, budget_purchase_max numeric,
      budget_sale_min numeric, budget_sale_max numeric, budget_equivalent numeric,
      budget_bedrooms integer, budget_rate numeric, requested_bedrooms integer,
      requested_amenities jsonb, matched_properties jsonb, match_count integer,
      public_tracking_token text unique, merged_into_lead_id text,
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp
    );
    create table lead_activities (
      id bigserial primary key, lead_id text not null references leads(id) on delete cascade,
      activity_type text not null, title text not null default '', note text not null default '',
      metadata jsonb not null default '{}'::jsonb
    );
    create table admin_tasks (
      id text primary key, entity_type text not null, entity_id text,
      updated_at timestamptz not null default current_timestamp
    );
    create table customer_property_submissions (id text primary key, lead_id text, status text not null);
    create table customer_messages (
      id text primary key, lead_id text not null references leads(id) on delete cascade,
      tracking_token text not null, sender_type text not null, sender_name text not null,
      message text not null, created_at timestamptz not null default current_timestamp
    );
    create table finance_transactions (id text primary key, lead_id text, amount numeric not null);
    create table admin_deals (
      id text primary key, lead_id text, updated_at timestamptz not null default current_timestamp
    );
    create table lead_visit_feedback (
      id bigserial primary key, lead_id text not null, tracking_token text not null unique,
      rating smallint not null, interest text not null, note text not null default ''
    );
    insert into leads(id,status,name,phone,source,requested_amenities,matched_properties,match_count,public_tracking_token)
      values
        ('A','new','Canonical','09123456789','website','[]'::jsonb,'[]'::jsonb,0,'HIR-26-AAAAAAAAAAAA'),
        ('B','new','','09123456789','divar','[]'::jsonb,'[]'::jsonb,0,'HIR-26-BBBBBBBBBBBB'),
        ('D','closed','Earlier alias','09123456789','website','[]'::jsonb,'[]'::jsonb,0,'HIR-26-DDDDDDDDDDDD');
    update leads set merged_into_lead_id='B' where id='D';
    insert into lead_activities(lead_id,activity_type,title,note)
      values ('B','note','B activity','Activity must move');
    insert into admin_tasks(id,entity_type,entity_id) values
      ('task-B','lead','B'),('property-task-B','property','B');
    insert into customer_property_submissions(id,lead_id,status) values ('submission-B','B','pending');
    insert into customer_messages(id,lead_id,tracking_token,sender_type,sender_name,message)
      values ('message-B','B','HIR-26-BBBBBBBBBBBB','customer','مشتری','پیام قدیمی');
    insert into finance_transactions(id,lead_id,amount) values ('finance-B','B',1200000000);
    insert into admin_deals(id,lead_id) values ('deal-B','B');
    insert into lead_visit_feedback(lead_id,tracking_token,rating,interest,note) values
      ('A','HIR-26-AAAAAAAAAAAA',4,'interested','بازخورد لید اصلی'),
      ('B','HIR-26-BBBBBBBBBBBB',5,'interested','بازخورد لید تکراری');
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

test("lead merge moves every related record, retains feedback per token, and repoints older aliases", async () => {
  const { pg, sql } = await createFixture();
  try {
    await sql.query("update leads set floor_preference='طبقه سوم', offer_amount=9000000000, offer_conditions='پرداخت مرحله‌ای', acquisition_landing_path='/properties/sale' where id='B'");
    const result = await mergeAdminLeadDuplicate(sql, "A", "B");
    assert.deepEqual(result, {
      kind: "merged",
      movedActivities: 1,
      movedTasks: 1,
      movedSubmissions: 1,
      movedFeedback: 1,
      movedMessages: 1,
      movedFinanceTransactions: 1,
      movedDeals: 1,
      repointedAliases: 1,
    });

    const canonical = await sql.query<{
      floor_preference: string;
      offer_amount: string;
      offer_conditions: string;
      acquisition_landing_path: string;
    }>("select floor_preference,offer_amount::text as offer_amount,offer_conditions,acquisition_landing_path from leads where id='A'");
    assert.deepEqual(canonical[0], {
      floor_preference: "طبقه سوم",
      offer_amount: "9000000000",
      offer_conditions: "پرداخت مرحله‌ای",
      acquisition_landing_path: "/properties/sale",
    });

    for (const table of ["lead_activities", "customer_property_submissions", "customer_messages", "finance_transactions", "admin_deals", "lead_visit_feedback"]) {
      const rows = await sql.query<{ lead_id: string }>(`select lead_id from ${table} where lead_id='B'`);
      assert.equal(rows.length, 0, `${table} must not retain rows on the duplicate lead`);
      const moved = await sql.query<{ lead_id: string }>(`select lead_id from ${table} where lead_id='A'`);
      assert.ok(moved.length > 0, `${table} rows must be attached to the canonical lead`);
    }
    const tasks = await sql.query<{ id: string; entity_id: string }>("select id,entity_id from admin_tasks order by id");
    assert.deepEqual(tasks, [
      { id: "property-task-B", entity_id: "B" },
      { id: "task-B", entity_id: "A" },
    ]);
    const feedback = await sql.query<{ lead_id: string; tracking_token: string }>("select lead_id,tracking_token from lead_visit_feedback order by tracking_token");
    assert.deepEqual(feedback, [
      { lead_id: "A", tracking_token: "HIR-26-AAAAAAAAAAAA" },
      { lead_id: "A", tracking_token: "HIR-26-BBBBBBBBBBBB" },
    ]);
    const aliases = await sql.query<{ id: string; status: string; merged_into_lead_id: string | null; public_tracking_token: string }>(
      "select id,status,merged_into_lead_id,public_tracking_token from leads where id in ('B','D') order by id",
    );
    assert.deepEqual(aliases, [
      { id: "B", status: "closed", merged_into_lead_id: "A", public_tracking_token: "HIR-26-BBBBBBBBBBBB" },
      { id: "D", status: "closed", merged_into_lead_id: "A", public_tracking_token: "HIR-26-DDDDDDDDDDDD" },
    ]);
  } finally {
    await pg.close();
  }
});

test("a related-record transfer failure rolls back the entire lead merge", async () => {
  const { pg, sql } = await createFixture();
  try {
    await pg.exec(`
      create function reject_finance_transfer() returns trigger language plpgsql as $$
      begin raise exception 'finance transfer unavailable'; end $$;
      create trigger reject_finance_transfer before update of lead_id on finance_transactions
        for each row when (old.lead_id = 'B') execute function reject_finance_transfer();
    `);
    await assert.rejects(mergeAdminLeadDuplicate(sql, "A", "B"), /finance transfer unavailable/);
    const leads = await sql.query<{ id: string; status: string; merged_into_lead_id: string | null }>(
      "select id,status,merged_into_lead_id from leads where id in ('A','B') order by id",
    );
    assert.deepEqual(leads, [
      { id: "A", status: "new", merged_into_lead_id: null },
      { id: "B", status: "new", merged_into_lead_id: null },
    ]);
    for (const table of ["lead_activities", "customer_property_submissions", "customer_messages", "finance_transactions", "admin_deals", "lead_visit_feedback"]) {
      const rows = await sql.query<{ lead_id: string }>(`select lead_id from ${table} where lead_id='B'`);
      assert.ok(rows.length > 0, `${table} records must remain attached to the duplicate after rollback`);
    }
    assert.deepEqual(await sql.query("select id from lead_activities where title='ادغام لید تکراری'"), []);
  } finally {
    await pg.close();
  }
});
