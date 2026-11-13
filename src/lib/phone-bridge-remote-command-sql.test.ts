import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import { queuePhoneBridgeRemoteCommand } from "./phone-bridge-remote-command-sql.ts";

function sqlFor(pg: PGlite): Sql {
  return {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query<T>(text, params)).rows,
    transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) =>
      pg.transaction(async (tx) => callback({
        query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) =>
          (await tx.query<R>(text, params)).rows,
      } as unknown as Sql)),
  } as unknown as Sql;
}

async function createSchema(pg: PGlite) {
  await pg.exec(`
    create table phone_bridge_devices (id text primary key);
    create table phone_bridge_remote_commands (
      id text primary key,
      device_id text not null references phone_bridge_devices(id) on delete cascade,
      action text not null,
      status text not null check (status in ('queued','running','succeeded','failed','expired')),
      payload jsonb not null,
      requested_by text,
      expires_at timestamptz not null
    );
    insert into phone_bridge_devices(id) values ('device-1'), ('device-2');
  `);
}

function command(id: string, deviceId = "device-1") {
  return {
    id,
    deviceId,
    action: "manage_files",
    payload: JSON.stringify({ operation: "pick_folder" }),
    requestedBy: "admin-1",
    expiresInSeconds: 180 as const,
  };
}

test("serializes simultaneous command creation for one device and admits only one active command", async () => {
  const pg = new PGlite();
  try {
    await createSchema(pg);
    const sql = sqlFor(pg);
    const results = await Promise.allSettled([
      queuePhoneBridgeRemoteCommand(sql, command("command-1")),
      queuePhoneBridgeRemoteCommand(sql, command("command-2")),
    ]);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = results.find((result) => result.status === "rejected");
    assert.ok(rejected && rejected.status === "rejected");
    assert.match(String(rejected.reason), /فرمان ریموت هنوز در حال اجراست/);
    const rows = await pg.query<{ id: string }>(
      "select id from phone_bridge_remote_commands where device_id='device-1' and status in ('queued','running')",
    );
    assert.equal(rows.rows.length, 1);
  } finally {
    await pg.close();
  }
});

test("allows a new command after the previous command has expired", async () => {
  const pg = new PGlite();
  try {
    await createSchema(pg);
    await pg.query(
      "insert into phone_bridge_remote_commands (id,device_id,action,status,payload,requested_by,expires_at) values ('expired','device-1','manage_files','queued','{}',null,current_timestamp - interval '1 second')",
    );
    await queuePhoneBridgeRemoteCommand(sqlFor(pg), command("new-command"));
    const rows = await pg.query<{ id: string; status: string }>(
      "select id,status from phone_bridge_remote_commands where device_id='device-1' order by id",
    );
    assert.deepEqual(rows.rows, [
      { id: "expired", status: "queued" },
      { id: "new-command", status: "queued" },
    ]);
  } finally {
    await pg.close();
  }
});

test("does not queue commands for a missing device", async () => {
  const pg = new PGlite();
  try {
    await createSchema(pg);
    await assert.rejects(
      queuePhoneBridgeRemoteCommand(sqlFor(pg), command("missing", "missing-device")),
      /device is unavailable/,
    );
    const rows = await pg.query<{ count: number }>("select count(*)::int as count from phone_bridge_remote_commands");
    assert.equal(rows.rows[0]?.count, 0);
  } finally {
    await pg.close();
  }
});

test("requires transaction support before issuing any query", async () => {
  let queried = false;
  const sql = { query: async () => { queried = true; return []; } } as unknown as Sql;
  await assert.rejects(
    queuePhoneBridgeRemoteCommand(sql, command("no-transaction")),
    /requires transaction support/,
  );
  assert.equal(queried, false);
});
