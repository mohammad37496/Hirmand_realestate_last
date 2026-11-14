import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("notification scope and per-account read migration is safe to apply repeatedly", async () => {
  const pg = new PGlite();
  const migration = await readFile(new URL("../../migrations/0108_admin_notification_scope_and_reads.sql", import.meta.url), "utf8");
  try {
    await pg.exec(`
      create table admin_notifications (
        id bigserial primary key,source_key text not null unique,kind text not null,severity text not null,
        title text not null,body text not null,entity_type text,entity_id text,
        created_at timestamptz not null default current_timestamp,read_at timestamptz
      );
      create table customer_property_submission_events (id text,created_at timestamptz);
      create table customer_property_submissions (id text,status text,queue_started_at timestamptz,created_at timestamptz);
      create table customer_messages (id text,lead_id text,sender_type text,read_by_admin_at timestamptz,created_at timestamptz);
      create table admin_deal_documents (id text,status text,updated_at timestamptz);
      create table properties (
        id text,deleted_at timestamptz,status text,updated_at timestamptz,last_verified_at timestamptz,
        published_at timestamptz,created_at timestamptz
      );
      insert into admin_notifications(source_key,kind,severity,title,body) values
        ('lead','lead','warning','Lead','Body'),
        ('message','message','warning','Message','Body'),
        ('property','property','warning','Property','Body'),
        ('publication','publication','warning','Publication','Body'),
        ('deal','deal_document','warning','Deal document','Body'),
        ('divar','divar','critical','Divar','Body'),
        ('system','system','critical','System','Body'),
        ('lead-overdue:lead-1','lead','critical','Overdue','Body');
    `);

    await pg.exec(migration);
    await pg.exec(migration);

    const scopes = await pg.query<{ source_key: string; required_permission: string }>(
      "select source_key,required_permission from admin_notifications order by source_key",
    );
    assert.deepEqual(scopes.rows, [
      { source_key: "deal", required_permission: "deal.manage" },
      { source_key: "divar", required_permission: "divar.import" },
      { source_key: "lead", required_permission: "lead.manage" },
      { source_key: "lead-overdue:lead-1", required_permission: "lead.manage" },
      { source_key: "message", required_permission: "reports.view" },
      { source_key: "property", required_permission: "property.manage" },
      { source_key: "publication", required_permission: "property.publish" },
      { source_key: "system", required_permission: "team.manage" },
    ]);
    const [stateful] = (await pg.query<{ is_stateful: boolean }>(
      "select is_stateful from admin_notifications where source_key='lead-overdue:lead-1'",
    )).rows;
    assert.equal(stateful.is_stateful, true);

    const notificationResult = await pg.query<{ id: number }>("select id from admin_notifications where source_key='lead'");
    const [notification] = notificationResult.rows;
    await pg.query("insert into admin_notification_reads(notification_id,account_id) values($1,'account-a')", [notification.id]);
    await pg.query("delete from admin_notifications where id=$1", [notification.id]);
    const reads = await pg.query("select notification_id from admin_notification_reads");
    assert.equal(reads.rows.length, 0, "deleting an event must cascade its per-account read state");
  } finally {
    await pg.close();
  }
});
