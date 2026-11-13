import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import { replacePhoneBridgeFileIndex } from "./phone-bridge-file-index.ts";

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
    create table phone_bridge_file_entries (
      id text primary key,
      device_id text not null references phone_bridge_devices(id) on delete cascade,
      root_uri text not null,
      uri text not null,
      parent_uri text,
      name text not null check (name <> 'fail'),
      relative_path text not null,
      mime_type text not null default 'application/octet-stream',
      size_bytes bigint not null default 0,
      modified_at bigint not null default 0,
      is_directory boolean not null default false,
      indexed_at timestamptz not null default current_timestamp,
      unique(device_id, uri)
    );
    insert into phone_bridge_devices(id) values ('device-1');
    insert into phone_bridge_file_entries(id,device_id,root_uri,uri,name,relative_path)
    values ('old','device-1','content://root','content://old','old.txt','old.txt');
  `);
}

test("replaces a device file index atomically and reports only unique valid entries", async () => {
  const pg = new PGlite();
  try {
    await createSchema(pg);
    const count = await replacePhoneBridgeFileIndex(sqlFor(pg), {
      deviceId: "device-1",
      rootUri: "content://tree/root",
      entries: [
        { uri: "content://tree/a", parentUri: "content://tree/root", name: "a", relativePath: "a", sizeBytes: 12 },
        { uri: "content://tree/a", name: "duplicate" },
        { uri: "", name: "invalid" },
        { uri: "content://tree/folder", name: "folder", isDirectory: true, sizeBytes: -1 },
      ],
    });

    assert.equal(count, 2);
    const rows = await pg.query<{ uri: string; name: string; size_bytes: number; is_directory: boolean }>(
      "select uri,name,size_bytes,is_directory from phone_bridge_file_entries where device_id='device-1' order by uri",
    );
    assert.deepEqual(rows.rows, [
      { uri: "content://tree/a", name: "a", size_bytes: 12, is_directory: false },
      { uri: "content://tree/folder", name: "folder", size_bytes: 0, is_directory: true },
    ]);
  } finally {
    await pg.close();
  }
});

test("a failed insert rolls back the index replacement and preserves the previous tree", async () => {
  const pg = new PGlite();
  try {
    await createSchema(pg);
    const sql = sqlFor(pg);
    await assert.rejects(replacePhoneBridgeFileIndex(sql, {
      deviceId: "device-1",
      rootUri: "content://tree/new-root",
      entries: [{ uri: "content://tree/new", name: "new" }, { uri: "content://tree/invalid", name: "fail" }],
    }));
    const rows = await pg.query<{ uri: string }>("select uri from phone_bridge_file_entries where device_id='device-1'");
    assert.deepEqual(rows.rows, [{ uri: "content://old" }]);
  } finally {
    await pg.close();
  }
});

test("requires transaction support before touching the current file index", async () => {
  let queried = false;
  const sql = { query: async () => { queried = true; return []; } } as unknown as Sql;
  await assert.rejects(
    replacePhoneBridgeFileIndex(sql, { deviceId: "device-1", rootUri: "content://tree", entries: [] }),
    /requires transaction support/,
  );
  assert.equal(queried, false);
});
