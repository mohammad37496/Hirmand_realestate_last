import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { cancelPropertyVisitRequest, createPropertyVisitRequest } from "./property-visit-request.ts";
import type { Sql } from "./db.ts";

test("public visit cancellation only changes requested or confirmed visits", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table leads (id text primary key, visit_status text not null, updated_at timestamptz not null default current_timestamp);
      insert into leads(id,visit_status) values ('requested','requested'),('confirmed','confirmed'),('completed','completed'),('cancelled','cancelled');
    `);
    const sql = {
      query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
        (await pg.query(text, params)).rows as T[],
    } as Sql;

    assert.deepEqual(await cancelPropertyVisitRequest(sql, "requested"), { kind: "cancelled" });
    assert.deepEqual(await cancelPropertyVisitRequest(sql, "confirmed"), { kind: "cancelled" });
    assert.deepEqual(await cancelPropertyVisitRequest(sql, "completed"), { kind: "not_cancellable" });
    assert.deepEqual(await cancelPropertyVisitRequest(sql, "cancelled"), { kind: "not_cancellable" });
    assert.deepEqual(await cancelPropertyVisitRequest(sql, "missing"), { kind: "not_cancellable" });

    const rows = await sql.query<{ id: string; visit_status: string }>(
      "select id,visit_status from leads order by id",
    );
    assert.deepEqual(rows, [
      { id: "cancelled", visit_status: "cancelled" },
      { id: "completed", visit_status: "completed" },
      { id: "confirmed", visit_status: "cancelled" },
      { id: "requested", visit_status: "cancelled" },
    ]);
  } finally {
    await pg.close();
  }
});

for (const failure of ["activity", "task"] as const) {
  test(`public visit lead and property-lock transaction roll back when ${failure} persistence fails`, async () => {
    const pg = new PGlite();
    try {
      await pg.exec(`
        create table consultants (id text primary key, name text not null);
        create table properties (
          id text primary key, title text not null, property_type text not null, neighborhood text not null,
          contact_name text not null, consultant_id text, deleted_at timestamptz, status text not null, publish_at timestamptz,
          unpublish_at timestamptz, availability_status text not null
        );
        create table leads (
          id text primary key, name text not null, phone text not null, people_count integer, job text not null,
          deal text not null, property_type text not null, neighborhood text not null, consultant text not null, consultant_id text,
          note text not null, source text not null, follow_up_at timestamptz, floor_preference text not null,
          property_id text not null references properties(id), visit_preferred_at timestamptz not null,
          visit_requested_at timestamptz not null, visit_status text not null, public_tracking_token text not null,
          created_at timestamptz not null default current_timestamp
        );
        create table lead_activities (id bigserial primary key, lead_id text not null references leads(id), activity_type text not null, title text not null, note text not null, metadata jsonb not null);
        create table admin_tasks (id text primary key, title text not null, description text not null, status text not null, priority text not null, due_at timestamptz not null, assignee text not null, entity_type text not null, entity_id text not null references leads(id));
        insert into properties(id,title,property_type,neighborhood,contact_name,status,availability_status)
          values ('property-1','آپارتمان نمونه','apartment','مرکز شهر','مشاور نمونه','published','available');
        create function reject_visit_intake() returns trigger language plpgsql as $$ begin raise exception '${failure} storage unavailable'; end $$;
        create trigger reject_visit_${failure} before insert on ${failure === "activity" ? "lead_activities" : "admin_tasks"}
          for each row execute function reject_visit_intake();
      `);
      const sql = {
        query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
          (await pg.query(text, params)).rows as T[],
        transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) =>
          pg.transaction(async (tx) => callback({
            query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) =>
              (await tx.query(text, params)).rows as R[],
          } as Sql)),
      } as Sql;

      await assert.rejects(createPropertyVisitRequest(sql, {
        propertyId: "property-1", visitAt: "2026-11-12T10:00:00.000Z", trackingToken: "HIR-26-TESTTOKEN123",
        name: "مشتری نمونه", phone: "09123456789", peopleCount: 2, job: "", floorPreference: "",
        consultant: "مشاور نمونه", note: "درخواست بازدید",
        intake: {
          activity: (property) => ({ activityType: "visit", title: "درخواست بازدید ثبت شد", note: "فایل: " + property.title, metadata: { propertyId: property.id } }),
          followUp: { title: "پیگیری بازدید", description: "تماس", priority: "urgent", dueMinutes: 60 },
        },
      }), new RegExp(`${failure} storage unavailable`));

      assert.deepEqual(await sql.query("select id from leads"), []);
      assert.deepEqual(await sql.query("select id from lead_activities"), []);
      assert.deepEqual(await sql.query("select id from admin_tasks"), []);
      assert.equal((await sql.query("select id from properties where status='published'")).length, 1);
    } finally {
      await pg.close();
    }
  });
}

test("public visit intake still rejects hidden properties before creating a lead", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table consultants (id text primary key, name text not null);
      create table properties (id text primary key, title text not null, property_type text not null, neighborhood text not null, contact_name text not null, consultant_id text, deleted_at timestamptz, status text not null, publish_at timestamptz, unpublish_at timestamptz, availability_status text not null);
      create table leads (id text primary key, property_id text not null, visit_status text not null, visit_preferred_at timestamptz not null);
      insert into properties(id,title,property_type,neighborhood,contact_name,status,availability_status) values ('hidden','Hidden','apartment','center','Agent','draft','available');
    `);
    const sql = {
      query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
        (await pg.query(text, params)).rows as T[],
      transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) =>
        pg.transaction(async (tx) => callback({
          query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) =>
            (await tx.query(text, params)).rows as R[],
        } as Sql)),
    } as Sql;
    assert.deepEqual(await createPropertyVisitRequest(sql, {
      propertyId: "hidden", visitAt: "2026-11-12T10:00:00.000Z", trackingToken: "HIR-26-HIDDEN",
      name: "مشتری", phone: "09123456789", peopleCount: null, job: "", floorPreference: "", consultant: "", note: "",
    }), { kind: "not_found" });
    assert.deepEqual(await sql.query("select id from leads"), []);
  } finally {
    await pg.close();
  }
});

test("repeated property visit requests reuse the newest matching lead and tracking token", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table properties (
        id text primary key, title text not null, property_type text not null, neighborhood text not null,
        contact_name text not null, consultant_id text, deleted_at timestamptz, status text not null, publish_at timestamptz,
        unpublish_at timestamptz, availability_status text not null
      );
      create table leads (
        id text primary key, property_id text not null, phone text not null, visit_status text not null,
        visit_preferred_at timestamptz not null, public_tracking_token text, created_at timestamptz not null
      );
      insert into properties(id,title,property_type,neighborhood,contact_name,status,availability_status)
        values ('property-1','آپارتمان نمونه','apartment','مرکز شهر','مشاور نمونه','published','available');
      insert into leads(id,property_id,phone,visit_status,visit_preferred_at,public_tracking_token,created_at) values
        ('older','property-1','09123456789','requested','2026-11-12T10:00:00Z','TRACK-OLDER','2026-11-10T10:00:00Z'),
        ('newer','property-1','09123456789','confirmed','2026-11-12T10:00:00Z','TRACK-NEWER','2026-11-11T10:00:00Z');
    `);
    const sql = {
      query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
        (await pg.query(text, params)).rows as T[],
      transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) =>
        pg.transaction(async (tx) => callback({
          query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) =>
            (await tx.query(text, params)).rows as R[],
        } as Sql)),
    } as Sql;

    const result = await createPropertyVisitRequest(sql, {
      propertyId: "property-1", visitAt: "2026-11-12T10:00:00.000Z", trackingToken: "TRACK-NEW",
      name: "مشتری نمونه", phone: "09123456789", peopleCount: 2, job: "", floorPreference: "",
      consultant: "مشاور نمونه", note: "درخواست بازدید",
    });
    assert.equal(result.kind, "duplicate");
    if (result.kind !== "duplicate") return;
    assert.equal(result.id, "newer");
    assert.equal(result.trackingToken, "TRACK-NEWER");
    assert.deepEqual(await sql.query("select id,public_tracking_token from leads order by id"), [
      { id: "newer", public_tracking_token: "TRACK-NEWER" },
      { id: "older", public_tracking_token: "TRACK-OLDER" },
    ]);
  } finally {
    await pg.close();
  }
});
