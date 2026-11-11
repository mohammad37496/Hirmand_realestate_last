import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db.ts";
import { createPublicLeadIntake, resolveActivePublicLeadConsultant, resolvePropertyLeadConsultant } from "./public-lead-intake.ts";

const branches = [
  "callback",
  "property_service",
  "offer",
  "visit",
  "financing",
  "document",
  "ordinary",
] as const;

async function createFixture(failure: "activity" | "task") {
  const pg = new PGlite();
  await pg.exec(`
    create table leads (id text primary key, branch text not null, branch_payload text not null);
    create table lead_branch_records (lead_id text primary key references leads(id), branch text not null, payload text not null);
    create table lead_activities (
      id bigserial primary key, lead_id text not null references leads(id), activity_type text not null,
      title text not null, note text not null, metadata jsonb not null
    );
    create table admin_tasks (
      id text primary key, title text not null, description text not null, status text not null,
      priority text not null, due_at timestamptz not null, assignee text not null, entity_type text not null, entity_id text not null references leads(id)
    );
    create function reject_intake_write() returns trigger language plpgsql as $$
      begin raise exception '${failure} storage unavailable'; end $$;
    create trigger reject_intake_${failure} before insert on ${failure === "activity" ? "lead_activities" : "admin_tasks"}
      for each row execute function reject_intake_write();
  `);
  const sql = {
    query: async <T = Record<string, unknown>>(
      text: string,
      params: unknown[] = [],
    ) => (await pg.query(text, params)).rows as T[],
    transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) =>
      pg.transaction(async (tx) =>
        callback({
          query: async <R = Record<string, unknown>>(
            text: string,
            params: unknown[] = [],
          ) => (await tx.query(text, params)).rows as R[],
        } as Sql),
      ),
  } as Sql;
  return { pg, sql };
}

for (const branch of branches) {
  for (const failure of ["activity", "task"] as const) {
    test(`public ${branch} intake rolls back its lead and branch row when ${failure} write fails`, async () => {
      const { pg, sql } = await createFixture(failure);
      try {
        await assert.rejects(
          createPublicLeadIntake(
            sql,
            async (transactionSql) => {
              const id = `lead-${branch}`;
              await transactionSql.query(
                "insert into leads(id,branch,branch_payload) values($1,$2,$3)",
                [id, branch, `branch-data:${branch}`],
              );
              await transactionSql.query(
                "insert into lead_branch_records(lead_id,branch,payload) values($1,$2,$3)",
                [id, branch, `branch-data:${branch}`],
              );
              return id;
            },
            {
              activityType: "note",
              title: `${branch} intake`,
              note: "required timeline",
              metadata: { branch },
            },
            {
              title: `${branch} follow-up`,
              description: "required task",
              priority: "high",
              dueMinutes: 60,
            },
          ),
          new RegExp(`${failure} storage unavailable`),
        );

        assert.deepEqual(await sql.query("select id from leads"), []);
        assert.deepEqual(
          await sql.query("select lead_id from lead_branch_records"),
          [],
        );
        assert.deepEqual(await sql.query("select id from lead_activities"), []);
        assert.deepEqual(await sql.query("select id from admin_tasks"), []);
      } finally {
        await pg.close();
      }
    });
  }
}

test("public lead intake commits the lead, timeline and task together", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table leads (id text primary key, branch text not null, branch_payload text not null);
      create table lead_branch_records (lead_id text primary key references leads(id), branch text not null, payload text not null);
      create table lead_activities (id bigserial primary key, lead_id text not null references leads(id), activity_type text not null, title text not null, note text not null, metadata jsonb not null);
      create table admin_tasks (id text primary key, title text not null, description text not null, status text not null, priority text not null, due_at timestamptz not null, assignee text not null, entity_type text not null, entity_id text not null references leads(id));
    `);
    const sql = {
      query: async <T = Record<string, unknown>>(
        text: string,
        params: unknown[] = [],
      ) => (await pg.query(text, params)).rows as T[],
      transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) =>
        pg.transaction(async (tx) =>
          callback({
            query: async <R = Record<string, unknown>>(
              text: string,
              params: unknown[] = [],
            ) => (await tx.query(text, params)).rows as R[],
          } as Sql),
        ),
    } as Sql;
    const id = await createPublicLeadIntake(
      sql,
      async (tx) => {
        await tx.query(
          "insert into leads(id,branch,branch_payload) values('lead-ok','ordinary','payload')",
        );
        await tx.query(
          "insert into lead_branch_records(lead_id,branch,payload) values('lead-ok','ordinary','payload')",
        );
        return "lead-ok";
      },
      {
        activityType: "follow_up",
        title: "Created",
        note: "Timeline",
        metadata: { source: "website" },
      },
      {
        title: "Call customer",
        description: "Initial call",
        priority: "normal",
        dueMinutes: 1440,
      },
    );
    assert.equal(id, "lead-ok");
    assert.equal((await sql.query("select id from leads")).length, 1);
    assert.equal(
      (await sql.query("select lead_id from lead_branch_records")).length,
      1,
    );
    assert.equal((await sql.query("select id from lead_activities")).length, 1);
    assert.equal((await sql.query("select id from admin_tasks")).length, 1);
  } finally {
    await pg.close();
  }
});

test("the public lead route wires all required branches through the transaction helper", async () => {
  const route = await readFile(
    new URL("../../server/routes/api/leads.post.ts", import.meta.url),
    "utf8",
  );
  assert.equal((route.match(/createPublicLeadIntake\(\s*sql,/g) ?? []).length, 7);
  assert.match(
    route,
    /createPropertyVisitRequest\(sql,\s*\{[\s\S]*?intake:\s*\{/,
  );
  assert.doesNotMatch(route, /createAutomaticFollowUp/);
  assert.doesNotMatch(
    route,
    /insert into lead_activities[\s\S]{0,260}?\.catch\(\(\)\s*=>\s*\{\}\)/i,
  );
  assert.ok(
    route.indexOf("await autoMatchLead(databaseSql, leadIdToAutoMatch") >
      route.indexOf("const result = await withPublicLeadPhoneDedupeLock"),
  );
  assert.ok(
    route.indexOf("site_visitor_days") <
      route.indexOf("const result = await withPublicLeadPhoneDedupeLock"),
  );
  assert.match(route, /typeof databaseSql\.transaction !== "function"/);
});

test("public lead intake fails closed without transaction support", async () => {
  const sql = { query: async () => [] } as unknown as Sql;
  await assert.rejects(
    createPublicLeadIntake(
      sql,
      async () => "lead-1",
      { activityType: "note", title: "x", note: "x", metadata: {} },
      { title: "x", description: "x", priority: "normal", dueMinutes: 60 },
    ),
    /transaction support is required/,
  );
});

test("public consultant selection validates an active ID under a share lock", async () => {
  const pg = new PGlite();
  try {
    await pg.exec("create table consultants(id text primary key,name text not null,is_active boolean not null); insert into consultants values('active','مشاور فعال',true),('inactive','مشاور غیرفعال',false)");
    const sql = { query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows } as unknown as Sql;
    assert.deepEqual(await resolveActivePublicLeadConsultant(sql, "active"), { id: "active", name: "مشاور فعال" });
    assert.deepEqual(await resolveActivePublicLeadConsultant(sql, undefined), { id: null, name: "" });
    await assert.rejects(resolveActivePublicLeadConsultant(sql, "inactive"), /مشاور انتخاب‌شده/);
    await assert.rejects(resolveActivePublicLeadConsultant(sql, "missing"), /مشاور انتخاب‌شده/);
  } finally {
    await pg.close();
  }
});

test("a concurrent consultant deactivation waits for an in-flight public lead ID resolution", async () => {
  const pg = new PGlite();
  let release!: () => void;
  let signalLocked!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  const locked = new Promise<void>((resolve) => { signalLocked = resolve; });
  try {
    await pg.exec("create table consultants(id text primary key,name text not null,is_active boolean not null); insert into consultants values('active','مشاور فعال',true)");
    const transaction = pg.transaction(async (tx) => {
      const sql = { query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await tx.query<T>(text, params)).rows } as unknown as Sql;
      await resolveActivePublicLeadConsultant(sql, "active");
      signalLocked();
      await hold;
    });
    await locked;
    let updateFinished = false;
    const deactivation = pg.query("update consultants set is_active=false where id='active'").then(() => { updateFinished = true; });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(updateFinished, false, "FOR SHARE must prevent deactivation until the lead transaction commits");
    release();
    await transaction;
    await deactivation;
    assert.equal(updateFinished, true);
  } finally {
    release();
    await pg.close();
  }
});

test("property lead resolution prefers the locked property consultant ID over the legacy contact snapshot", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table consultants(id text primary key,name text not null);
      create table properties(id text primary key,consultant_id text,contact_name text not null,deleted_at timestamptz,status text,publish_at timestamptz,unpublish_at timestamptz,availability_status text);
      insert into consultants values('c1','نام فعلی');
      insert into properties values
        ('p1','c1','نام قدیمی',null,'published',null,null,'available'),
        ('p2',null,'فقط snapshot',null,'published',null,null,'available');
    `);
    const sql = { query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows } as unknown as Sql;
    assert.deepEqual(await resolvePropertyLeadConsultant(sql, "p1", "fallback"), { id: "c1", name: "نام فعلی" });
    assert.deepEqual(await resolvePropertyLeadConsultant(sql, "p2", "fallback"), { id: null, name: "fallback" });
    await assert.rejects(resolvePropertyLeadConsultant(sql, "missing", "fallback"), /فایل موردنظر/);
  } finally {
    await pg.close();
  }
});
