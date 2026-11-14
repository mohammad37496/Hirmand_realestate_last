import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db.ts";
import { syncAdminNotificationCandidates } from "./admin-notification-sync.ts";
import { listAdminNotificationsForAccount } from "./admin-notification-store.ts";

test("notification synchronization is idempotent and refreshes an existing source event", async () => {
  const pg = new PGlite();
  await pg.exec(`
    create table leads (
      id text primary key,name text,status text,created_at timestamptz,follow_up_at timestamptz,
      visit_status text,visit_requested_at timestamptz,visit_preferred_at timestamptz,updated_at timestamptz
    );
    create table admin_notifications (
      id bigserial primary key,source_key text not null unique,kind text not null,severity text not null,
      title text not null,body text not null,entity_type text,entity_id text,entity_slug text,
      required_permission text not null,is_stateful boolean not null default false,resolved_at timestamptz,
      created_at timestamptz not null default current_timestamp,read_at timestamptz
    );
    create table admin_notification_reads (
      notification_id bigint not null references admin_notifications(id) on delete cascade,
      account_id text not null,read_at timestamptz not null default current_timestamp,dismissed_at timestamptz,
      primary key(notification_id,account_id)
    );
    insert into leads values
      ('lead-1','مشتری اول','new',current_timestamp,null,'none',null,null,current_timestamp);
  `);
  const sql = {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query(text, params)).rows as T[],
  } as Sql;

  try {
    await syncAdminNotificationCandidates(sql, ["lead.manage"]);
    await syncAdminNotificationCandidates(sql, ["lead.manage"]);
    let rows = await sql.query<{ source_key: string; body: string; required_permission: string }>(
      "select source_key,body,required_permission from admin_notifications",
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source_key, "lead-new:lead-1");
    assert.equal(rows[0].required_permission, "lead.manage");

    await sql.query("update leads set name='مشتری به‌روزشده' where id='lead-1'");
    await syncAdminNotificationCandidates(sql, ["lead.manage"]);
    rows = await sql.query("select source_key,body,required_permission from admin_notifications");
    assert.equal(rows.length, 1);
    assert.match(rows[0].body, /مشتری به‌روزشده/);
  } finally {
    await pg.close();
  }
});

test("state-based alerts resolve when the underlying CRM condition is cleared and can reopen later", async () => {
  const pg = new PGlite();
  await pg.exec(`
    create table leads (
      id text primary key,name text,status text,created_at timestamptz,follow_up_at timestamptz,
      visit_status text,visit_requested_at timestamptz,visit_preferred_at timestamptz,updated_at timestamptz
    );
    create table admin_notifications (
      id bigserial primary key,source_key text not null unique,kind text not null,severity text not null,
      title text not null,body text not null,entity_type text,entity_id text,entity_slug text,
      required_permission text not null,is_stateful boolean not null default false,resolved_at timestamptz,
      created_at timestamptz not null default current_timestamp,read_at timestamptz
    );
    create table admin_notification_reads (
      notification_id bigint not null references admin_notifications(id) on delete cascade,
      account_id text not null,read_at timestamptz not null default current_timestamp,dismissed_at timestamptz,
      primary key(notification_id,account_id)
    );
    insert into leads values
      ('lead-2','مشتری پیگیری','contacted',current_timestamp - interval '2 days',current_timestamp - interval '1 day',
       'none',null,null,current_timestamp);
  `);
  const sql = {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query(text, params)).rows as T[],
  } as Sql;

  try {
    await syncAdminNotificationCandidates(sql, ["lead.manage"]);
    let alerts = await sql.query<{ source_key: string; resolved_at: string | null }>(
      "select source_key,resolved_at from admin_notifications where source_key like 'lead-overdue:%'",
    );
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].resolved_at, null);

    await sql.query("update leads set follow_up_at=current_timestamp + interval '1 day' where id='lead-2'");
    await syncAdminNotificationCandidates(sql, ["lead.manage"]);
    alerts = await sql.query("select source_key,resolved_at from admin_notifications where source_key like 'lead-overdue:%'");
    assert.equal(alerts[0].resolved_at != null, true);

    await sql.query("update leads set follow_up_at=current_timestamp - interval '2 hours' where id='lead-2'");
    await syncAdminNotificationCandidates(sql, ["lead.manage"]);
    alerts = await sql.query("select source_key,resolved_at from admin_notifications where source_key like 'lead-overdue:%' order by id");
    assert.equal(alerts.length, 2);
    assert.equal(alerts.filter((item) => item.resolved_at == null).length, 1);
  } finally {
    await pg.close();
  }
});

test("stale backup alerts are created for managers and resolve after a new backup", async () => {
  const pg = new PGlite();
  await pg.exec(`
    create table admin_backup_log (id bigserial primary key,created_at timestamptz not null);
    create table admin_data_health_findings (
      id bigserial primary key,source_key text,kind text,severity text,title text,detail text,
      entity_type text,entity_id text,detected_at timestamptz,resolved_at timestamptz
    );
    create table admin_notifications (
      id bigserial primary key,source_key text not null unique,kind text not null,severity text not null,
      title text not null,body text not null,entity_type text,entity_id text,entity_slug text,
      required_permission text not null,is_stateful boolean not null default false,resolved_at timestamptz,
      created_at timestamptz not null default current_timestamp,read_at timestamptz
    );
    create table admin_notification_reads (
      notification_id bigint not null references admin_notifications(id) on delete cascade,
      account_id text not null,read_at timestamptz not null default current_timestamp,dismissed_at timestamptz,
      primary key(notification_id,account_id)
    );
    insert into admin_backup_log(created_at) values (current_timestamp - interval '10 days');
  `);
  const sql = {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query(text, params)).rows as T[],
  } as Sql;

  try {
    await syncAdminNotificationCandidates(sql, ["team.manage"]);
    let alerts = await sql.query<{ kind: string; required_permission: string; is_stateful: boolean; resolved_at: string | null }>(
      "select kind,required_permission,is_stateful,resolved_at from admin_notifications where source_key like 'backup-health:%'",
    );
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].kind, "backup");
    assert.equal(alerts[0].required_permission, "team.manage");
    assert.equal(alerts[0].is_stateful, true);
    assert.equal(alerts[0].resolved_at, null);

    const [missingBackup] = await sql.query<{ id: number }>("select id from admin_notifications where source_key like 'backup-health:%'");
    await sql.query("insert into admin_notification_reads(notification_id,account_id,dismissed_at) values($1,'account-a',current_timestamp)", [missingBackup.id]);

    await sql.query("insert into admin_backup_log(created_at) values(current_timestamp)");
    await syncAdminNotificationCandidates(sql, ["team.manage"]);
    alerts = await sql.query("select kind,required_permission,is_stateful,resolved_at from admin_notifications where source_key like 'backup-health:%'");
    assert.equal(alerts[0].resolved_at != null, true);
    assert.equal((await sql.query("select notification_id from admin_notification_reads where notification_id=$1", [missingBackup.id])).length, 0);

    await sql.query("delete from admin_backup_log where created_at > current_timestamp - interval '1 day'");
    await syncAdminNotificationCandidates(sql, ["team.manage"]);
    const reopened = await listAdminNotificationsForAccount(sql, "account-a", ["team.manage"], 20);
    assert.equal(reopened.unread, 1);
    assert.equal(reopened.notifications[0].id, missingBackup.id);
  } finally {
    await pg.close();
  }
});

test("customer-message notifications require reports.view even when the caller can manage leads", async () => {
  const pg = new PGlite();
  await pg.exec(`
    create table leads (
      id text primary key,name text,status text,created_at timestamptz,follow_up_at timestamptz,
      visit_status text,visit_requested_at timestamptz,visit_preferred_at timestamptz,updated_at timestamptz
    );
    create table customer_messages (id text,lead_id text,sender_type text,read_by_admin_at timestamptz,created_at timestamptz);
    create table admin_notifications (
      id bigserial primary key,source_key text not null unique,kind text not null,severity text not null,
      title text not null,body text not null,entity_type text,entity_id text,entity_slug text,
      required_permission text not null,is_stateful boolean not null default false,resolved_at timestamptz,
      created_at timestamptz not null default current_timestamp,read_at timestamptz
    );
    create table admin_notification_reads (
      notification_id bigint not null references admin_notifications(id) on delete cascade,
      account_id text not null,read_at timestamptz not null default current_timestamp,dismissed_at timestamptz,
      primary key(notification_id,account_id)
    );
    insert into leads values ('lead-1','مشتری','new',current_timestamp,null,'none',null,null,current_timestamp);
    insert into customer_messages values ('message-1','lead-1','customer',null,current_timestamp);
  `);
  const sql = {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query(text, params)).rows as T[],
  } as Sql;
  try {
    await syncAdminNotificationCandidates(sql, ["lead.manage", "reports.view"]);
    const [message] = await sql.query<{ required_permission: string }>(
      "select required_permission from admin_notifications where kind='message'",
    );
    assert.equal(message.required_permission, "reports.view");
    await syncAdminNotificationCandidates(sql, ["lead.manage"]);
    const leadOnly = await listAdminNotificationsForAccount(sql, "account-a", ["lead.manage"], 20);
    assert.equal(leadOnly.notifications.some((item) => item.kind === "message"), false);
    const withReports = await listAdminNotificationsForAccount(sql, "account-a", ["lead.manage", "reports.view"], 20);
    assert.equal(withReports.notifications.some((item) => item.kind === "message"), true);
  } finally {
    await pg.close();
  }
});
