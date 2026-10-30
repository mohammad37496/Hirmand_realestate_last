import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  ADMIN_CUSTOMER_CHAT_THREAD_SQL,
  DELETE_ADMIN_MESSAGE_TEMPLATE_SQL,
  INSERT_ADMIN_CUSTOMER_CHAT_REPLY_SQL,
} from "./admin-customer-chat-sql.ts";

const routeSource = (path: string) =>
  readFileSync(new URL(`../../server/routes/api/${path}`, import.meta.url), "utf8");
const inboxSource = readFileSync(new URL("../components/hirmand/admin-customer-inbox.tsx", import.meta.url), "utf8");

test("customer inbox returns the newest 200 messages and only marks that visible window read", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table customer_messages (
        id text primary key,
        lead_id text not null,
        tracking_token text not null,
        sender_type text not null,
        sender_name text not null,
        message text not null,
        created_at timestamptz not null,
        read_by_admin_at timestamptz
      );
      insert into customer_messages (id, lead_id, tracking_token, sender_type, sender_name, message, created_at)
      select 'message-' || lpad(n::text, 3, '0'), 'lead-1', 'HIR-26-AAAAAAAAAAAA',
             'customer', 'مشتری', 'پیام ' || n,
             timestamptz '2026-01-01 00:00:00+00' + n * interval '1 minute'
      from generate_series(1, 205) as n;
    `);

    const result = await db.query<{ id: string }>(ADMIN_CUSTOMER_CHAT_THREAD_SQL, ["hir-26-aaaaaaaaaaaa"]);
    assert.equal(result.rows.length, 200);
    assert.equal(result.rows[0].id, "message-006");
    assert.equal(result.rows.at(-1)?.id, "message-205");

    const readState = await db.query<{ unread: number; read: number }>(`
      select count(*) filter (where read_by_admin_at is null)::int as unread,
             count(*) filter (where read_by_admin_at is not null)::int as read
      from customer_messages
    `);
    assert.deepEqual(readState.rows[0], { unread: 5, read: 200 });

    const route = routeSource("admin-customer-chat.get.ts");
    assert.match(route, /ADMIN_CUSTOMER_CHAT_THREAD_SQL/);
    assert.doesNotMatch(route, /update customer_messages set read_by_admin_at/);
  } finally {
    await db.close();
  }
});

test("admin reply insertion is atomic with lead lookup and rejects a vanished tracking code", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table leads (id text primary key, tracking_token text not null);
      create table customer_messages (
        id text primary key,
        lead_id text not null references leads(id) on delete cascade,
        tracking_token text not null,
        sender_type text not null,
        sender_name text not null,
        message text not null
      );
      insert into leads values ('lead-1', 'HIR-26-AAAAAAAAAAAA');
    `);

    const first = await db.query<{ id: string }>(INSERT_ADMIN_CUSTOMER_CHAT_REPLY_SQL, [
      "message-1", "مشاور احراز‌شده", "پاسخ", "hir-26-aaaaaaaaaaaa",
    ]);
    assert.equal(first.rows.length, 1);
    assert.equal(first.rows[0].id, "message-1");
    const sender = await db.query<{ sender_name: string }>("select sender_name from customer_messages where id='message-1'");
    assert.equal(sender.rows[0].sender_name, "مشاور احراز‌شده");

    await db.query("delete from leads where id=$1", ["lead-1"]);
    const afterDelete = await db.query<{ id: string }>(INSERT_ADMIN_CUSTOMER_CHAT_REPLY_SQL, [
      "message-2", "مشاور احراز‌شده", "پاسخ دوم", "HIR-26-AAAAAAAAAAAA",
    ]);
    assert.equal(afterDelete.rows.length, 0);

    const route = routeSource("admin-customer-chat.post.ts");
    assert.match(route, /const senderName = claims\?\.displayName\?\.trim\(\) \|\| "هیرمند"/);
    assert.match(route, /if \(!inserted\[0\]\)\s*\{\s*throw createError\(\{ statusCode:404/);
    assert.doesNotMatch(route, /consultant:\s*z\.string/);
    assert.match(route, /hasAdminPermission\(normalizeAdminRole\(claims\?\.role\), "lead\.manage"\)/);
  } finally {
    await db.close();
  }
});

test("deleting a missing message template returns no row for the API to reject", async () => {
  const db = new PGlite();
  try {
    await db.exec("create table admin_message_templates (id text primary key); insert into admin_message_templates values ('custom-1')");
    const deleted = await db.query<{ id: string }>(DELETE_ADMIN_MESSAGE_TEMPLATE_SQL, ["custom-1"]);
    const missing = await db.query<{ id: string }>(DELETE_ADMIN_MESSAGE_TEMPLATE_SQL, ["custom-1"]);
    assert.equal(deleted.rows.length, 1);
    assert.equal(missing.rows.length, 0);

    const route = routeSource("admin-message-templates.post.ts");
    assert.match(route, /DELETE_ADMIN_MESSAGE_TEMPLATE_SQL/);
    assert.match(route, /if \(!deleted\[0\]\) throw createError\(\{ statusCode: 404/);
    assert.match(route, /hasAdminPermission\(normalizeAdminRole\(claims\?\.role\), "lead\.manage"\)/);
  } finally {
    await db.close();
  }
});

test("switching customer conversations clears stale messages and ignores late thread responses", () => {
  assert.match(inboxSource, /const threadRequestRef = useRef\(0\)/);
  assert.match(inboxSource, /function selectConversation\(code: string\)[\s\S]*?threadRequestRef\.current \+= 1;[\s\S]*?setMessages\(\[\]\)/);
  assert.match(inboxSource, /if \(requestId !== threadRequestRef\.current\) return/);
  assert.match(inboxSource, /setMessages\(\[\]\);\s*setThreadLoading\(true\)/);
  assert.match(inboxSource, /disabled=\{sending \|\| threadLoading\}/);
});
