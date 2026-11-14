import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db.ts";
import {
  dismissAdminNotificationForAccount,
  listAdminNotificationsForAccount,
  markAdminNotificationReadForAccount,
  markAllAdminNotificationsReadForAccount,
} from "./admin-notification-store.ts";

async function setup() {
  const pg = new PGlite();
  await pg.exec(`
    create table admin_notifications (
      id bigserial primary key, source_key text not null unique, kind text not null,
      severity text not null, title text not null, body text not null,
      entity_type text, entity_id text, entity_slug text, created_at timestamptz not null default current_timestamp,
      read_at timestamptz, required_permission text not null, is_stateful boolean not null default false, resolved_at timestamptz
    );
    create table admin_notification_reads (
      notification_id bigint not null references admin_notifications(id) on delete cascade,
      account_id text not null, read_at timestamptz not null default current_timestamp,
      dismissed_at timestamptz, primary key(notification_id,account_id)
    );
    insert into admin_notifications(source_key,kind,severity,title,body,required_permission) values
      ('lead-1','lead','warning','Lead','Lead body','lead.manage'),
      ('message-1','message','warning','Message','Message body','reports.view'),
      ('property-1','property','warning','Property','Property body','property.manage'),
      ('publish-1','publication','warning','Publish','Publish body','property.publish'),
      ('system-1','system','critical','System','System body','team.manage');
    insert into admin_notifications(source_key,kind,severity,title,body,required_permission,is_stateful,resolved_at)
      values ('resolved-1','property','info','Resolved','Resolved body','property.manage',true,current_timestamp);
  `);
  const sql = {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query(text, params)).rows as T[],
  } as Sql;
  return { pg, sql };
}

test("inbox filters by permitted scopes and calculates the exact per-account unread count", async () => {
  const { pg, sql } = await setup();
  try {
    const permissions = ["lead.manage", "property.manage"] as const;
    const first = await listAdminNotificationsForAccount(sql, "account-a", permissions, 50);
    assert.equal(first.unread, 2);
    assert.deepEqual(first.notifications.map((item) => item.kind).sort(), ["lead", "property"]);
    const leadOnly = await listAdminNotificationsForAccount(sql, "account-a", ["lead.manage"], 50);
    assert.deepEqual(leadOnly.notifications.map((item) => item.kind), ["lead"]);
    const withReports = await listAdminNotificationsForAccount(sql, "account-a", ["lead.manage", "reports.view"], 50);
    assert.deepEqual(withReports.notifications.map((item) => item.kind).sort(), ["lead", "message"]);
    assert.equal(withReports.unread, 2);
    const [resolved] = await sql.query<{ id: number }>("select id from admin_notifications where source_key='resolved-1'");
    assert.equal(await markAdminNotificationReadForAccount(sql, resolved.id, "account-a", permissions), false);

    assert.equal(await markAdminNotificationReadForAccount(sql, first.notifications[0].id, "account-a", permissions), true);
    const afterRead = await listAdminNotificationsForAccount(sql, "account-a", permissions, 50);
    assert.equal(afterRead.unread, 1);
    assert.equal(afterRead.notifications.filter((item) => item.readAt).length, 1);

    const otherAccount = await listAdminNotificationsForAccount(sql, "account-b", permissions, 50);
    assert.equal(otherAccount.unread, 2);
  } finally {
    await pg.close();
  }
});

test("mark all changes only this account's permitted unread rows", async () => {
  const { pg, sql } = await setup();
  try {
    const marked = await markAllAdminNotificationsReadForAccount(sql, "account-a", ["lead.manage", "property.manage"]);
    assert.equal(marked, 2);
    assert.equal((await listAdminNotificationsForAccount(sql, "account-a", ["lead.manage", "property.manage"], 50)).unread, 0);
    assert.equal((await listAdminNotificationsForAccount(sql, "account-b", ["lead.manage", "property.manage"], 50)).unread, 2);
    assert.equal((await listAdminNotificationsForAccount(sql, "account-a", ["team.manage"], 50)).unread, 1);
  } finally {
    await pg.close();
  }
});

test("dismissal is persistent and a caller cannot read or dismiss another scope", async () => {
  const { pg, sql } = await setup();
  try {
    const [property] = await sql.query<{ id: number }>("select id from admin_notifications where source_key='property-1'");
    assert.equal(await markAdminNotificationReadForAccount(sql, property.id, "account-a", ["lead.manage"]), false);
    assert.equal(await dismissAdminNotificationForAccount(sql, property.id, "account-a", ["lead.manage"]), false);
    assert.equal(await dismissAdminNotificationForAccount(sql, property.id, "account-a", ["property.manage"]), true);
    const visible = await listAdminNotificationsForAccount(sql, "account-a", ["property.manage"], 50);
    assert.equal(visible.notifications.length, 0);
    assert.equal(visible.unread, 0);
    assert.equal((await listAdminNotificationsForAccount(sql, "account-b", ["property.manage"], 50)).notifications.length, 1);
  } finally {
    await pg.close();
  }
});

test("concurrent read requests are idempotent and legacy global read state remains respected", async () => {
  const { pg, sql } = await setup();
  try {
    const [lead] = await sql.query<{ id: number }>("select id from admin_notifications where source_key='lead-1'");
    const outcomes = await Promise.all(Array.from({ length: 8 }, () =>
      markAdminNotificationReadForAccount(sql, lead.id, "account-a", ["lead.manage"])));
    assert.equal(outcomes.every(Boolean), true);
    await sql.query("update admin_notifications set read_at=current_timestamp where source_key='property-1'");
    const result = await listAdminNotificationsForAccount(sql, "legacy:owner", ["lead.manage", "property.manage"], 50);
    assert.equal(result.unread, 1);
    assert.equal(result.notifications.find((item) => item.kind === "property")?.readAt != null, true);
  } finally {
    await pg.close();
  }
});
