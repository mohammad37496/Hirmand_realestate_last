import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "@/lib/db";
import { saveConsultantWithSql, type ConsultantMutationInput } from "./consultant-mutations.ts";

const consultant: ConsultantMutationInput = {
  id: "consultant-1",
  name: "مشاور جدید",
  role: "مشاور فروش",
  phone: "09120000000",
  phoneDisplay: "۰۹۱۲ ۰۰۰ ۰۰۰۰",
  icon: "handshake",
  bio: "",
  whatsapp: "",
  telegram: "",
  eitaa: "",
  instagram: "",
  rubika: "",
  bale: "",
  igap: "",
  soroush: "",
  sortOrder: 10,
  isActive: true,
};

async function createDb() {
  const db = new PGlite();
  await db.exec(`
    create table consultants (
      id text primary key, name text not null, role text not null, phone text not null,
      phone_display text not null, icon text not null, bio text not null,
      whatsapp text not null, telegram text not null, eitaa text not null,
      instagram text not null, rubika text not null, bale text not null,
      igap text not null, soroush text not null, sort_order integer not null,
      is_active boolean not null, updated_at timestamptz
    );
    create table properties (
      id text primary key, contact_name text, contact_phone text, updated_at timestamptz
    );
    create table leads (
      id text primary key, consultant text not null default '', updated_at timestamptz not null default current_timestamp
    );
    insert into consultants (id,name,role,phone,phone_display,icon,bio,whatsapp,telegram,eitaa,instagram,rubika,bale,igap,soroush,sort_order,is_active)
      values ('consultant-1','مشاور قبلی','مشاور','09121111111','۰۹۱۲۱۱۱۱۱۱۱','handshake','','','','','','','','','',10,true);
    insert into leads (id,consultant) values
      ('lead-1',(select name from consultants where id='consultant-1')),
      ('lead-2','  ' || (select name from consultants where id='consultant-1') || '  '),
      ('lead-3','Another Consultant');
    insert into properties (id,contact_name,contact_phone) values
      ('property-1','مشاور قبلی','09121111111'),
      ('property-2','  مشاور قبلی  ','09121111111');
  `);
  return db;
}

function transactionSql(tx: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }) {
  return {
    query: async <T>(text: string, params: unknown[] = []) => (await tx.query(text, params)).rows as T[],
  } as Pick<Sql, "query">;
}

test("consultant rename updates CRM lead assignments and every matching property contact together", async () => {
  const db = await createDb();
  try {
    await db.transaction(async (tx) => saveConsultantWithSql(transactionSql(tx), consultant));
    const saved = await db.query<{ name: string; phone: string }>("select name,phone from consultants where id='consultant-1'");
    const properties = await db.query<{ contact_name: string; contact_phone: string }>("select contact_name,contact_phone from properties order by id");
    const leads = await db.query<{ id: string; consultant: string }>("select id,consultant from leads order by id");
    assert.deepEqual(saved.rows[0], { name: consultant.name, phone: consultant.phone });
    assert.deepEqual(properties.rows, [
      { contact_name: consultant.name, contact_phone: consultant.phone },
      { contact_name: consultant.name, contact_phone: consultant.phone },
    ]);
    assert.deepEqual(leads.rows, [
      { id: "lead-1", consultant: consultant.name },
      { id: "lead-2", consultant: consultant.name },
      { id: "lead-3", consultant: "Another Consultant" },
    ]);
  } finally {
    await db.close();
  }
});

test("consultant save rejects duplicate names after trimming and case normalization", async () => {
  const db = await createDb();
  try {
    await db.query(
      `insert into consultants
        (id,name,role,phone,phone_display,icon,bio,whatsapp,telegram,eitaa,instagram,rubika,bale,igap,soroush,sort_order,is_active)
       select 'consultant-2','  ' || upper($1) || '  ',role,phone,phone_display,icon,bio,whatsapp,telegram,eitaa,instagram,rubika,bale,igap,soroush,20,is_active
         from consultants where id='consultant-1'`,
      [consultant.name],
    );

    await assert.rejects(
      db.transaction(async (tx) => saveConsultantWithSql(transactionSql(tx), consultant)),
      /A consultant with this name already exists/,
    );

    const consultants = await db.query<{ id: string; name: string }>("select id,name from consultants order by id");
    assert.equal(consultants.rows[0]?.id, "consultant-1");
    assert.notEqual(consultants.rows[0]?.name, consultant.name);
    assert.equal(consultants.rows[1]?.name.trim().toLowerCase(), consultant.name.trim().toLowerCase());
  } finally {
    await db.close();
  }
});

test("concurrent consultant saves cannot create the same normalized name", async () => {
  const db = await createDb();
  try {
    const results = await Promise.allSettled([
      db.transaction(async (tx) => saveConsultantWithSql(transactionSql(tx), consultant)),
      db.transaction(async (tx) => saveConsultantWithSql(transactionSql(tx), { ...consultant, id: "consultant-2" })),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    const duplicates = await db.query<{ id: string }>(
      "select id from consultants where lower(trim(name))=lower(trim($1))",
      [consultant.name],
    );
    assert.equal(duplicates.rows.length, 1);
  } finally {
    await db.close();
  }
});

test("a property contact sync failure rolls back the consultant update", async () => {
  const db = await createDb();
  try {
    await db.exec(`
      create function reject_contact_sync() returns trigger language plpgsql as $$
      begin raise exception 'simulated property sync failure'; end;
      $$;
      create trigger reject_contact_sync before update on properties
      for each row execute function reject_contact_sync();
    `);
    await assert.rejects(
      db.transaction(async (tx) => saveConsultantWithSql(transactionSql(tx), consultant)),
      /simulated property sync failure/,
    );
    const saved = await db.query<{ name: string; phone: string }>("select name,phone from consultants where id='consultant-1'");
    const properties = await db.query<{ contact_name: string; contact_phone: string }>("select contact_name,contact_phone from properties order by id");
    assert.deepEqual(saved.rows[0], { name: "مشاور قبلی", phone: "09121111111" });
    assert.deepEqual(properties.rows, [
      { contact_name: "مشاور قبلی", contact_phone: "09121111111" },
      { contact_name: "  مشاور قبلی  ", contact_phone: "09121111111" },
    ]);
  } finally {
    await db.close();
  }
});

test("a property contact sync failure rolls back the lead reassignment too", async () => {
  const db = await createDb();
  try {
    await db.exec(`
      create function reject_contact_sync() returns trigger language plpgsql as $$
      begin raise exception 'simulated property sync failure'; end;
      $$;
      create trigger reject_contact_sync before update on properties
      for each row execute function reject_contact_sync();
    `);
    await assert.rejects(
      db.transaction(async (tx) => saveConsultantWithSql(transactionSql(tx), consultant)),
      /simulated property sync failure/,
    );
    const saved = await db.query<{ name: string }>("select name from consultants where id='consultant-1'");
    const leads = await db.query<{ id: string; consultant: string }>("select id,consultant from leads order by id");
    assert.equal(leads.rows[0]?.consultant.trim(), saved.rows[0]?.name);
    assert.equal(leads.rows[1]?.consultant.trim(), saved.rows[0]?.name);
    assert.equal(leads.rows[2]?.consultant, "Another Consultant");
  } finally {
    await db.close();
  }
});

test("the admin server function runs consultant upsert and property sync in one database transaction", () => {
  const source = readFileSync(new URL("./consultants.ts", import.meta.url), "utf8");
  assert.match(source, /withSqlTransaction\(\(sql\) => saveConsultantWithSql\(sql, data\)\)/);
});
