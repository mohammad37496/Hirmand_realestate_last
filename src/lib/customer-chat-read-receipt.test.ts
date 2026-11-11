import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db.ts";
import { markCustomerChatMessagesRead } from "./customer-chat-read-receipt.ts";

async function createFixture() {
  const pg = new PGlite();
  await pg.exec(`
    create table leads (id text primary key, public_tracking_token text not null unique);
    create table customer_messages (
      id text primary key,
      lead_id text not null references leads(id) on delete cascade,
      sender_type text not null,
      read_by_customer_at timestamptz
    );
    insert into leads(id,public_tracking_token) values
      ('lead-1','HIR-26-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      ('lead-2','HIR-26-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB');
    insert into customer_messages(id,lead_id,sender_type,read_by_customer_at) values
      ('admin-unread','lead-1','admin',null),
      ('admin-read','lead-1','admin',current_timestamp),
      ('customer-message','lead-1','customer',null),
      ('other-lead-message','lead-2','admin',null);
  `);
  const sql = {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query<T>(text, params)).rows,
  } as Sql;
  return { pg, sql };
}

const token = "HIR-26-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

test("read receipt marks only fetched unread admin messages for the matching lead", async () => {
  const { pg, sql } = await createFixture();
  try {
    const result = await markCustomerChatMessagesRead(sql, token, [
      "admin-unread",
      "admin-unread",
      "admin-read",
      "customer-message",
      "other-lead-message",
      "not-a-message",
    ]);
    assert.deepEqual(result, { kind: "marked", count: 1 });
    const rows = await sql.query<{ id: string; read_by_customer_at: string | null }>(
      "select id,read_by_customer_at from customer_messages order by id",
    );
    assert.ok(rows.find((row) => row.id === "admin-unread")?.read_by_customer_at);
    assert.ok(rows.find((row) => row.id === "admin-read")?.read_by_customer_at);
    assert.equal(rows.find((row) => row.id === "customer-message")?.read_by_customer_at, null);
    assert.equal(rows.find((row) => row.id === "other-lead-message")?.read_by_customer_at, null);
  } finally {
    await pg.close();
  }
});

test("an unknown tracking token cannot update any read receipt", async () => {
  const { pg, sql } = await createFixture();
  try {
    assert.deepEqual(
      await markCustomerChatMessagesRead(sql, "HIR-26-CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC", ["admin-unread"]),
      { kind: "not_found" },
    );
    const rows = await sql.query<{ read_by_customer_at: string | null }>(
      "select read_by_customer_at from customer_messages where id='admin-unread'",
    );
    assert.equal(rows[0]?.read_by_customer_at, null);
  } finally {
    await pg.close();
  }
});

test("read receipt query failures propagate", async () => {
  const sql = {
    query: async () => { throw new Error("read receipt query unavailable"); },
  } as unknown as Sql;
  await assert.rejects(
    markCustomerChatMessagesRead(sql, token, ["admin-unread"]),
    /read receipt query unavailable/,
  );
});
