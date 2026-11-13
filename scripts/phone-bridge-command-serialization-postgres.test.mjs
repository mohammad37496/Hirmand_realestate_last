import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { test } from "node:test";
import { queuePhoneBridgeRemoteCommand } from "../src/lib/phone-bridge-remote-command-sql.ts";

const connectionString = process.env.TEST_DATABASE_URL;

test("independent PostgreSQL sessions cannot queue two active remote commands for one device", {
  skip: !connectionString,
}, async () => {
  const admin = new Pool({ connectionString, max: 1 });
  const schema = "phone_bridge_command_race_" + randomUUID().replaceAll("-", "");
  let pool;
  try {
    await admin.query("create schema " + schema);
    pool = new Pool({
      connectionString,
      max: 4,
      options: "-c search_path=" + schema,
    });
    await pool.query(`
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
      insert into phone_bridge_devices(id) values ('device-1');
    `);

    const sql = {
      query: async (text, params = []) => (await pool.query(text, params)).rows,
      transaction: async (callback) => {
        const client = await pool.connect();
        try {
          await client.query("begin");
          const tx = {
            query: async (text, params = []) => (await client.query(text, params)).rows,
          };
          const result = await callback(tx);
          await client.query("commit");
          return result;
        } catch (error) {
          await client.query("rollback").catch(() => {});
          throw error;
        } finally {
          client.release();
        }
      },
    };

    const command = (id) => ({
      id,
      deviceId: "device-1",
      action: "manage_files",
      payload: JSON.stringify({ operation: "pick_folder" }),
      requestedBy: "admin-1",
      expiresInSeconds: 180,
    });
    const results = await Promise.allSettled([
      queuePhoneBridgeRemoteCommand(sql, command("command-1")),
      queuePhoneBridgeRemoteCommand(sql, command("command-2")),
    ]);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = results.find((result) => result.status === "rejected");
    assert.ok(rejected && rejected.status === "rejected");
    assert.match(String(rejected.reason), /فرمان ریموت هنوز در حال اجراست/);
    const rows = await pool.query(
      "select id from phone_bridge_remote_commands where device_id=$1 and status in ('queued','running')",
      ["device-1"],
    );
    assert.equal(rows.rowCount, 1);
  } finally {
    await pool.end().catch(() => {});
    await admin.query("drop schema if exists " + schema + " cascade").catch(() => {});
    await admin.end();
  }
});
