import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { loadAdminSalesControlCenterQueries } from "./admin-sales-control-center.ts";
import type { Sql } from "./db.ts";

test("sales control center returns consultant and pipeline data when both queries succeed", async () => {
  let calls = 0;
  const queries: string[] = [];
  const sql = {
    query: async <T = Record<string, unknown>>(text: string, _params: unknown[] = []) => {
      queries.push(text);
      return [{ id: String(++calls) }] as T[];
    },
  } as Sql;
  const [consultants, pipeline] = await loadAdminSalesControlCenterQueries(sql, 30);
  assert.equal(calls, 2);
  assert.deepEqual(consultants, [{ id: "1" }]);
  assert.deepEqual(pipeline, [{ id: "2" }]);
  assert.match(queries[0], /select c\.id as key/);
  assert.match(queries[0], /join consultants c on c\.id = p\.consultant_id/);
  assert.match(queries[0], /join consultants c on c\.id = l\.consultant_id/);
  assert.match(queries[0], /left join file_stats fs on fs\.key = c\.id/);
  assert.match(queries[0], /left join lead_stats ls on ls\.key = c\.id/);
  assert.doesNotMatch(queries[0], /lower\(trim\(consultant\)\)/);
  assert.doesNotMatch(queries[0], /contact_name/);
});

test("sales control center attributes same-name leads only by stable consultant ID", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table consultants (id text primary key, name text not null, phone text not null, is_active boolean not null);
      create table properties (id text primary key, consultant_id text references consultants(id), status text not null, slug text not null);
      create table leads (
        id text primary key,
        consultant text not null,
        consultant_id text references consultants(id),
        status text not null,
        created_at timestamptz not null,
        follow_up_at timestamptz,
        visit_status text
      );
      create table lead_activities (lead_id text not null, activity_type text not null);
      create table site_events (property_slug text not null, event_name text not null, day date not null);
      insert into consultants(id,name,phone,is_active) values
        ('consultant-a','مشاور مشترک','09120000001',true),
        ('consultant-b','مشاور مشترک','09120000002',true);
      insert into leads(id,consultant,consultant_id,status,created_at) values
        ('lead-a','مشاور مشترک','consultant-a','new',current_timestamp),
        ('lead-b','مشاور مشترک','consultant-b','contacted',current_timestamp),
        ('legacy-unlinked','مشاور مشترک',null,'new',current_timestamp);
    `);
    const sql = {
      query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
        (await pg.query<T>(text, params)).rows,
    } as unknown as Sql;
    const [consultants] = await loadAdminSalesControlCenterQueries(sql, 30);
    assert.deepEqual(
      consultants.map((row) => ({ id: row.id, leads: row.leads })),
      [
        { id: "consultant-a", leads: 1 },
        { id: "consultant-b", leads: 1 },
      ],
    );
  } finally {
    await pg.close();
  }
});

for (const fragment of ["with file_stats", "from leads\n       where created_at"]) {
  test(`sales control center propagates ${fragment} database failures`, async () => {
    const sql = {
      query: async <T = Record<string, unknown>>(text: string, _params: unknown[] = []) => {
        if (text.includes(fragment)) return Promise.reject(new Error("sales report database unavailable")) as Promise<T[]>;
        return [] as T[];
      },
    } as Sql;
    await assert.rejects(loadAdminSalesControlCenterQueries(sql, 30), /sales report database unavailable/);
  });
}
