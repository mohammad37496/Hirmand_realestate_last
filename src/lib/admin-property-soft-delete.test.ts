import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  softDeleteProperty,
  type PropertyTrashQuery,
} from "./admin-property-soft-delete.ts";

async function createDb() {
  const db = new PGlite();
  await db.exec(`
    create table properties (
      id text primary key,
      slug text not null unique,
      status text not null,
      featured boolean not null default false,
      featured_until timestamptz,
      title text not null,
      deleted_at timestamptz,
      deleted_from_status text,
      updated_at timestamptz not null default current_timestamp
    );
    create table property_change_history (
      id bigserial primary key,
      property_id text not null,
      action text not null,
      before_state jsonb,
      after_state jsonb,
      changed_at timestamptz not null default current_timestamp
    );
    create table admin_audit_log (
      id bigserial primary key,
      action text not null,
      entity_type text not null,
      entity_id text,
      entity_title text not null default '',
      actor text not null default 'admin',
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default current_timestamp
    );
    insert into properties (id,slug,status,featured,featured_until,title) values
      ('published','qa-published','published',true,current_timestamp + interval '1 day','Published property'),
      ('draft','qa-draft','draft',false,null,'Draft property'),
      ('already-trashed','qa-trashed','archived',false,null,'Already trashed property');
    update properties set deleted_at=current_timestamp, deleted_from_status='published' where id='already-trashed';
  `);
  return db;
}

function deleteInTransaction(db: PGlite, propertyId: string) {
  return db.transaction((tx) => {
    const query: PropertyTrashQuery = async (statement, params) => {
      const result = await tx.query<Record<string, unknown>>(statement, params);
      return result.rows;
    };
    return softDeleteProperty(
      query,
      propertyId,
      (row) => ({
        title: row.title,
        status: row.status,
        featured: row.featured,
      }),
      "qa-admin",
    );
  });
}

test("soft delete snapshots the locked row and commits lifecycle history and audit together", async () => {
  const db = await createDb();
  try {
    const result = await deleteInTransaction(db, "published");
    assert.deepEqual(result, {
      id: "published",
      title: "Published property",
      fromStatus: "published",
    });

    const property = await db.query<{
      status: string;
      deleted_at: string | null;
      deleted_from_status: string | null;
      featured: boolean;
      featured_until: string | null;
    }>("select status,deleted_at,deleted_from_status,featured,featured_until from properties where id='published'");
    assert.equal(property.rows[0]?.status, "archived");
    assert.ok(property.rows[0]?.deleted_at);
    assert.equal(property.rows[0]?.deleted_from_status, "published");
    assert.equal(property.rows[0]?.featured, false);
    assert.equal(property.rows[0]?.featured_until, null);

    const history = await db.query<{ action: string; before_state: { title: string; status: string; featured: boolean } }>(
      "select action,before_state from property_change_history where property_id='published'",
    );
    assert.deepEqual(history.rows, [{
      action: "deleted",
      before_state: { title: "Published property", status: "published", featured: true },
    }]);

    const audit = await db.query<{ action: string; entity_id: string; entity_title: string; actor: string; metadata: { fromStatus: string } }>(
      "select action,entity_id,entity_title,actor,metadata from admin_audit_log where entity_id='published'",
    );
    assert.deepEqual(audit.rows, [{
      action: "property.trashed",
      entity_id: "published",
      entity_title: "Published property",
      actor: "qa-admin",
      metadata: { fromStatus: "published" },
    }]);
  } finally {
    await db.close();
  }
});

test("missing and already-trashed properties are idempotent no-ops", async () => {
  const db = await createDb();
  try {
    assert.equal(await deleteInTransaction(db, "missing"), null);
    assert.equal(await deleteInTransaction(db, "already-trashed"), null);
    assert.equal((await db.query("select id from property_change_history")).rows.length, 0);
    assert.equal((await db.query("select id from admin_audit_log")).rows.length, 0);
  } finally {
    await db.close();
  }
});

test("the history snapshot reflects the current locked property state", async () => {
  const db = await createDb();
  try {
    await db.query(
      "update properties set title='Latest title',status='draft',featured=false where id='published'",
    );
    const result = await deleteInTransaction(db, "published");
    assert.equal(result?.fromStatus, "draft");
    assert.equal(result?.title, "Latest title");
    const history = await db.query<{ before_state: { title: string; status: string; featured: boolean } }>(
      "select before_state from property_change_history where property_id='published'",
    );
    assert.deepEqual(history.rows[0]?.before_state, {
      title: "Latest title",
      status: "draft",
      featured: false,
    });
  } finally {
    await db.close();
  }
});

test("a history write failure rolls back the property trash mutation", async () => {
  const db = await createDb();
  try {
    await db.exec(`
      create function qa_reject_property_history() returns trigger language plpgsql as $$
      begin raise exception 'simulated property history failure'; end;
      $$;
      create trigger qa_reject_property_history before insert on property_change_history
      for each row execute function qa_reject_property_history();
    `);
    await assert.rejects(deleteInTransaction(db, "published"), /simulated property history failure/);
    const property = await db.query<{ status: string; deleted_at: string | null; featured: boolean }>(
      "select status,deleted_at,featured from properties where id='published'",
    );
    assert.deepEqual(property.rows[0], { status: "published", deleted_at: null, featured: true });
    assert.equal((await db.query("select id from property_change_history")).rows.length, 0);
    assert.equal((await db.query("select id from admin_audit_log")).rows.length, 0);
  } finally {
    await db.close();
  }
});

test("an audit write failure rolls back the property mutation and history", async () => {
  const db = await createDb();
  try {
    await db.exec(`
      create function qa_reject_property_audit() returns trigger language plpgsql as $$
      begin raise exception 'simulated property audit failure'; end;
      $$;
      create trigger qa_reject_property_audit before insert on admin_audit_log
      for each row execute function qa_reject_property_audit();
    `);
    await assert.rejects(deleteInTransaction(db, "published"), /simulated property audit failure/);
    const property = await db.query<{ status: string; deleted_at: string | null; featured: boolean }>(
      "select status,deleted_at,featured from properties where id='published'",
    );
    assert.deepEqual(property.rows[0], { status: "published", deleted_at: null, featured: true });
    assert.equal((await db.query("select id from property_change_history")).rows.length, 0);
    assert.equal((await db.query("select id from admin_audit_log")).rows.length, 0);
  } finally {
    await db.close();
  }
});

test("concurrent soft-delete attempts produce exactly one transition and one audit trail", async () => {
  const db = await createDb();
  try {
    const results = await Promise.all([
      deleteInTransaction(db, "published"),
      deleteInTransaction(db, "published"),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(results.filter((result) => result === null).length, 1);
    assert.equal((await db.query("select id from property_change_history where property_id='published'")).rows.length, 1);
    assert.equal((await db.query("select id from admin_audit_log where entity_id='published'")).rows.length, 1);
  } finally {
    await db.close();
  }
});

test("property deletion server function uses the transaction-scoped soft-delete helper", () => {
  const source = readFileSync(new URL("./properties.ts", import.meta.url), "utf8");
  const start = source.indexOf("export const deleteProperty =");
  const handler = source.slice(start);
  assert.ok(start >= 0);
  assert.match(handler, /withSqlTransaction\(async \(tx\)/);
  assert.match(handler, /softDeleteProperty\(/);
  assert.match(handler, /clearPropertyReadCache\(\)/);
  assert.doesNotMatch(handler, /writeAdminAuditLog\(/);
});
