import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db.ts";
import { loadLatestCustomerChatMessages } from "./customer-chat-messages.ts";

test("customer chat loads the latest 100 messages in chronological order and counts visible unread admin messages", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table customer_messages (
        id text primary key, lead_id text not null, tracking_token text not null, sender_type text not null,
        sender_name text not null, message text not null, created_at timestamptz not null,
        read_by_customer_at timestamptz
      );
      insert into customer_messages(id,lead_id,tracking_token,sender_type,sender_name,message,created_at,read_by_customer_at)
      select 'msg-' || lpad(n::text,3,'0'), 'lead-1', 'HIR-26-AAAAAAAAAAAA',
             case when n in (1,100,101,105) then 'admin' else 'customer' end,
             'sender', 'message ' || n::text, current_timestamp + n * interval '1 second',
             case when n in (1,100,101,105) then null else current_timestamp end
      from generate_series(1,105) as n;
    `);
    const sql = { query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query<T>(text, params)).rows } as Sql;
    const result = await loadLatestCustomerChatMessages(sql, "lead-1", "HIR-26-AAAAAAAAAAAA");
    assert.equal(result.messages.length, 100);
    assert.equal(result.messages[0]?.id, "msg-006");
    assert.equal(result.messages.at(-1)?.id, "msg-105");
    assert.deepEqual(result.messages.map((message) => message.createdAt),
      [...result.messages.map((message) => message.createdAt)].sort());
    assert.equal(result.unreadCount, 3, "only unread admin messages in the visible latest-100 window are counted");
  } finally {
    await pg.close();
  }
});

test("merged customer chat reads only the conversation for the requested legacy token", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table customer_messages (
        id text primary key,
        lead_id text not null,
        tracking_token text not null,
        sender_type text not null,
        sender_name text not null,
        message text not null,
        created_at timestamptz not null,
        read_by_customer_at timestamptz
      );
      insert into customer_messages(id,lead_id,tracking_token,sender_type,sender_name,message,created_at,read_by_customer_at) values
        ('message-A','canonical','HIR-26-AAAAAAAAAAAA','admin','مشاور','پیام پرونده اصلی','2026-11-10T10:00:00Z',null),
        ('message-B','canonical','HIR-26-BBBBBBBBBBBB','admin','مشاور','پیام پرونده ادغام‌شده','2026-11-10T11:00:00Z',null),
        ('reply-B','canonical','HIR-26-BBBBBBBBBBBB','customer','مشتری','پاسخ مشتری','2026-11-10T11:01:00Z',null);
    `);
    const sql = {
      query: async <T = Record<string, unknown>>(query: string, params: unknown[] = []) =>
        (await pg.query(query, params)).rows as T[],
    } as Pick<Sql, "query">;

    const conversation = await loadLatestCustomerChatMessages(sql, "canonical", "HIR-26-BBBBBBBBBBBB");
    assert.deepEqual(conversation.messages.map((message) => message.id), ["message-B", "reply-B"]);
    assert.equal(conversation.unreadCount, 1);
  } finally {
    await pg.close();
  }
});
