import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  deleteTrashedProperty,
  restoreTrashedProperty,
  type TrashedPropertyRow,
} from "./admin-property-trash.ts";

async function createRestoreDb() {
  const db = new PGlite();
  await db.exec(`
    create table properties (
      id text primary key,
      title text,
      status text not null,
      deleted_at timestamptz,
      deleted_from_status text,
      updated_at timestamptz
    );
    create table property_change_history (
      id bigserial primary key,
      property_id text not null,
      action text not null,
      before_state jsonb,
      after_state jsonb
    );
    create table admin_audit_log (
      id bigserial primary key,
      action text not null,
      entity_type text not null,
      entity_id text,
      entity_title text not null default '',
      actor text not null default 'admin',
      metadata jsonb not null default '{}'::jsonb
    );
    insert into properties values
      ('published-no-permission','Published without permission','archived',current_timestamp,'published',current_timestamp),
      ('published-with-permission','Published with permission','archived',current_timestamp,'published',current_timestamp),
      ('draft-property','Draft property','archived',current_timestamp,'draft',current_timestamp),
      ('concurrent-property','Concurrent property','archived',current_timestamp,'published',current_timestamp);
  `);
  return db;
}

function restoreInTransaction(db: PGlite, id: string, canPublish: boolean, actor = "qa-admin") {
  return db.transaction((tx) => restoreTrashedProperty(
    async (statement, params) => (await tx.query<Record<string, unknown>>(statement, params)).rows,
    id,
    canPublish,
    actor,
  ));
}

test("permanent deletion returns only the row still in trash, preserving media after a concurrent restore", async () => {
  const db = new PGlite();
  try {
    await db.exec("create table properties (id text primary key, title text, images jsonb, floor_plan_url text, virtual_tour_url text, deleted_at timestamptz, status text); insert into properties values ('restored', 'Restored property', '[\"https://media.test/restored.jpg\"]', 'https://media.test/plan.jpg', null, '2026-10-01T00:00:00Z', 'archived'), ('trashed', 'Trashed property', '[\"https://media.test/trashed.jpg\"]', null, 'https://media.test/tour.mp4', '2026-10-01T00:00:00Z', 'archived');");
    const query = async (statement: string, params: unknown[]) => (await db.query<TrashedPropertyRow>(statement, params)).rows;
    await db.query("update properties set deleted_at=null, status='draft' where id='restored'");
    assert.equal(await deleteTrashedProperty(query, "restored"), null);
    const restored = await db.query<{ images: string[]; deleted_at: string | null }>("select images, deleted_at from properties where id='restored'");
    assert.equal(restored.rows.length, 1);
    assert.equal(restored.rows[0]?.deleted_at, null);
    assert.deepEqual(restored.rows[0]?.images, ["https://media.test/restored.jpg"]);
    const deleted = await deleteTrashedProperty(query, "trashed");
    assert.equal(deleted?.id, "trashed");
    assert.deepEqual(deleted?.images, ["https://media.test/trashed.jpg"]);
    assert.equal(deleted?.virtual_tour_url, "https://media.test/tour.mp4");
    assert.equal(await deleteTrashedProperty(query, "trashed"), null);
  } finally { await db.close(); }
});

test("restore commits property state, lifecycle history and audit together while enforcing publish permission", async () => {
  const db = await createRestoreDb();
  try {
    assert.deepEqual(await restoreInTransaction(db, "published-no-permission", false, "  qa-restorer  "), {
      id: "published-no-permission",
      title: "Published without permission",
      status: "draft",
    });
    assert.deepEqual(await restoreInTransaction(db, "published-with-permission", true), {
      id: "published-with-permission",
      title: "Published with permission",
      status: "published",
    });
    assert.deepEqual(await restoreInTransaction(db, "draft-property", false), {
      id: "draft-property",
      title: "Draft property",
      status: "draft",
    });
    assert.equal(await restoreInTransaction(db, "draft-property", false), null);

    const history = await db.query<{ property_id: string; action: string; before_state: { status: string }; after_state: { status: string } }>(
      "select property_id,action,before_state,after_state from property_change_history order by id",
    );
    assert.deepEqual(history.rows.map((row) => [row.property_id, row.action, row.before_state.status, row.after_state.status]), [
      ["published-no-permission", "updated", "trash", "draft"],
      ["published-with-permission", "updated", "trash", "published"],
      ["draft-property", "updated", "trash", "draft"],
    ]);

    const audit = await db.query<{ action: string; entity_id: string; entity_title: string; actor: string; metadata: { restoredStatus: string } }>(
      "select action,entity_id,entity_title,actor,metadata from admin_audit_log order by id",
    );
    assert.deepEqual(audit.rows, [
      { action: "property.restored", entity_id: "published-no-permission", entity_title: "Published without permission", actor: "qa-restorer", metadata: { restoredStatus: "draft" } },
      { action: "property.restored", entity_id: "published-with-permission", entity_title: "Published with permission", actor: "qa-admin", metadata: { restoredStatus: "published" } },
      { action: "property.restored", entity_id: "draft-property", entity_title: "Draft property", actor: "qa-admin", metadata: { restoredStatus: "draft" } },
    ]);
  } finally {
    await db.close();
  }
});

test("a restore history failure rolls back the property state and audit record", async () => {
  const db = await createRestoreDb();
  try {
    await db.exec(`
      create function qa_reject_restore_history() returns trigger language plpgsql as $$
      begin raise exception 'simulated property restore history failure'; end;
      $$;
      create trigger qa_reject_restore_history before insert on property_change_history
      for each row execute function qa_reject_restore_history();
    `);
    await assert.rejects(restoreInTransaction(db, "published-no-permission", true), /simulated property restore history failure/);
    const property = await db.query<{ status: string; deleted_at: string | null; deleted_from_status: string | null }>(
      "select status,deleted_at,deleted_from_status from properties where id='published-no-permission'",
    );
    assert.equal(property.rows[0]?.status, "archived");
    assert.ok(property.rows[0]?.deleted_at);
    assert.equal(property.rows[0]?.deleted_from_status, "published");
    assert.equal((await db.query("select id from property_change_history")).rows.length, 0);
    assert.equal((await db.query("select id from admin_audit_log")).rows.length, 0);
  } finally {
    await db.close();
  }
});

test("a restore audit failure rolls back the property state and lifecycle history", async () => {
  const db = await createRestoreDb();
  try {
    await db.exec(`
      create function qa_reject_restore_audit() returns trigger language plpgsql as $$
      begin raise exception 'simulated property restore audit failure'; end;
      $$;
      create trigger qa_reject_restore_audit before insert on admin_audit_log
      for each row execute function qa_reject_restore_audit();
    `);
    await assert.rejects(restoreInTransaction(db, "published-no-permission", true), /simulated property restore audit failure/);
    const property = await db.query<{ status: string; deleted_at: string | null; deleted_from_status: string | null }>(
      "select status,deleted_at,deleted_from_status from properties where id='published-no-permission'",
    );
    assert.equal(property.rows[0]?.status, "archived");
    assert.ok(property.rows[0]?.deleted_at);
    assert.equal(property.rows[0]?.deleted_from_status, "published");
    assert.equal((await db.query("select id from property_change_history")).rows.length, 0);
    assert.equal((await db.query("select id from admin_audit_log")).rows.length, 0);
  } finally {
    await db.close();
  }
});

test("concurrent restores produce one state transition, one history row and one audit row", async () => {
  const db = await createRestoreDb();
  try {
    const results = await Promise.all([
      restoreInTransaction(db, "concurrent-property", true, "qa-admin-a"),
      restoreInTransaction(db, "concurrent-property", true, "qa-admin-b"),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(results.filter((result) => result === null).length, 1);
    assert.equal((await db.query("select id from property_change_history where property_id='concurrent-property'")).rows.length, 1);
    assert.equal((await db.query("select id from admin_audit_log where entity_id='concurrent-property'")).rows.length, 1);
  } finally {
    await db.close();
  }
});

test("trash APIs and UI distinguish unavailable data and unsuccessful restore/delete results", () => {
  const properties = readFileSync(new URL("./properties.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../components/hirmand/admin-trash-manager.tsx", import.meta.url), "utf8");
  const permanentStart = properties.indexOf("export const permanentlyDeleteProperty");
  const permanentEnd = properties.indexOf("export const listAdminPropertySchedules", permanentStart);
  const permanent = properties.slice(permanentStart, permanentEnd);
  const trashStart = properties.indexOf("export const listAdminTrashProperties");
  const restoreStart = properties.indexOf("export const restoreDeletedProperty", trashStart);
  const trashList = properties.slice(trashStart, restoreStart);
  const restore = properties.slice(restoreStart, permanentStart);
  assert.match(trashList, /dbSource === "unconfigured"\) throw new Error/);
  assert.match(restore, /withSqlTransaction\(async \(tx\)/);
  assert.match(restore, /restoreTrashedProperty/);
  assert.doesNotMatch(restore, /writeAdminAuditLog\(/);
  assert.doesNotMatch(restore, /catch\(\(\)\s*=>\s*\{\}\)/);
  assert.match(permanent, /deleteTrashedProperty/);
  assert.match(permanent, /if \(!deletion\) return \{ success: false, deleted: 0 \}/);
  assert.match(permanent, /withSqlTransaction\(async \(tx\)/);
  assert.match(permanent, /enqueueMediaCleanupJob\(tx, url\)/);
  assert.match(permanent, /processMediaCleanupJobs\(jobIds, sql\)/);
  assert.ok(permanent.indexOf("if (!existing)") < permanent.indexOf("enqueueMediaCleanupJob"));
  assert.match(permanent, /existing\.virtual_tour_url/);
  assert.doesNotMatch(permanent, /select images, floor_plan_url, title from properties/);
  assert.match(ui, /result\.success !== true \|\| result\.restored !== 1/);
  assert.match(ui, /result\.success !== true \|\| result\.deleted !== 1/);
  assert.match(ui, /setLoadError\(message\)/);
  assert.match(ui, /<AdminErrorBanner/);
});
