import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db.ts";
import { sendCustomerChatMessage } from "./customer-chat-send.ts";

async function createFixture() {
  const pg = new PGlite();
  await pg.exec(`
    create table leads (
      id text primary key,
      tracking_token text not null unique
    );
    create table customer_messages (
      id text primary key,
      lead_id text not null references leads(id) on delete cascade,
      tracking_token text not null,
      sender_type text not null,
      sender_name text not null,
      message text not null,
      created_at timestamptz not null default current_timestamp
    );
    insert into leads(id, tracking_token) values ('lead-1', 'HIR-26-ABCDEF123456');
  `);

  const sql = {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query<T>(text, params)).rows,
    transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) =>
      pg.transaction(async (tx) => callback({
        query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) =>
          (await tx.query<R>(text, params)).rows,
      } as Sql)),
  } as Sql;

  return { pg, sql };
}

const input = {
  trackingCode: "HIR-26-ABCDEF123456",
  senderName: "مشتری",
  message: "لطفاً با من تماس بگیرید.",
};

test("concurrent customer chat sends serialize the cooldown check and insert", async () => {
  const { pg, sql } = await createFixture();
  try {
    const results = await Promise.all([
      sendCustomerChatMessage(sql, input),
      sendCustomerChatMessage(sql, input),
    ]);

    assert.equal(results.filter((result) => result.kind === "sent").length, 1);
    assert.equal(results.filter((result) => result.kind === "cooldown").length, 1);
    const messages = await sql.query<{ id: string; sender_type: string }>(
      "select id, sender_type from customer_messages where lead_id='lead-1'",
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.sender_type, "customer");
  } finally {
    await pg.close();
  }
});

test("a recent message blocks a new customer send", async () => {
  const { pg, sql } = await createFixture();
  try {
    await sql.query(
      `insert into customer_messages(id,lead_id,tracking_token,sender_type,sender_name,message)
       values('existing','lead-1',$1,'customer','مشتری','پیام قبلی')`,
      [input.trackingCode],
    );
    assert.deepEqual(await sendCustomerChatMessage(sql, input), { kind: "cooldown" });
    const rows = await sql.query<{ id: string }>("select id from customer_messages order by id");
    assert.deepEqual(rows.map((row) => row.id), ["existing"]);
  } finally {
    await pg.close();
  }
});

test("an unknown tracking code does not create a message", async () => {
  const { pg, sql } = await createFixture();
  try {
    assert.deepEqual(
      await sendCustomerChatMessage(sql, { ...input, trackingCode: "HIR-26-000000000000" }),
      { kind: "not_found" },
    );
    const rows = await sql.query<{ id: string }>("select id from customer_messages");
    assert.equal(rows.length, 0);
  } finally {
    await pg.close();
  }
});

test("customer chat send fails closed when transaction support is unavailable", async () => {
  let queryCount = 0;
  const sql = {
    query: async () => { queryCount += 1; return []; },
  } as unknown as Sql;
  assert.deepEqual(await sendCustomerChatMessage(sql, input), { kind: "unavailable" });
  assert.equal(queryCount, 0);
});

test("a failed cooldown lookup rejects and never inserts a message", async () => {
  let insertCount = 0;
  const sql = {
    transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) => callback({
      query: async <R = Record<string, unknown>>(text: string) => {
        if (/from leads/i.test(text)) return [{ id: "lead-1", trackingToken: input.trackingCode }] as R[];
        if (/from customer_messages/i.test(text)) throw new Error("cooldown lookup unavailable");
        if (/insert into customer_messages/i.test(text)) insertCount += 1;
        return [] as R[];
      },
    } as Sql),
  } as unknown as Sql;

  await assert.rejects(sendCustomerChatMessage(sql, input), /cooldown lookup unavailable/);
  assert.equal(insertCount, 0);
});
