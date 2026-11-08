import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { cancelPropertyVisitRequest } from "./property-visit-request.ts";
import type { Sql } from "./db.ts";

test("public visit cancellation only changes requested or confirmed visits", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table leads (id text primary key, visit_status text not null, updated_at timestamptz not null default current_timestamp);
      insert into leads(id,visit_status) values ('requested','requested'),('confirmed','confirmed'),('completed','completed'),('cancelled','cancelled');
    `);
    const sql = {
      query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
        (await pg.query(text, params)).rows as T[],
    } as Sql;

    assert.deepEqual(await cancelPropertyVisitRequest(sql, "requested"), { kind: "cancelled" });
    assert.deepEqual(await cancelPropertyVisitRequest(sql, "confirmed"), { kind: "cancelled" });
    assert.deepEqual(await cancelPropertyVisitRequest(sql, "completed"), { kind: "not_cancellable" });
    assert.deepEqual(await cancelPropertyVisitRequest(sql, "cancelled"), { kind: "not_cancellable" });
    assert.deepEqual(await cancelPropertyVisitRequest(sql, "missing"), { kind: "not_cancellable" });

    const rows = await sql.query<{ id: string; visit_status: string }>(
      "select id,visit_status from leads order by id",
    );
    assert.deepEqual(rows, [
      { id: "cancelled", visit_status: "cancelled" },
      { id: "completed", visit_status: "completed" },
      { id: "confirmed", visit_status: "cancelled" },
      { id: "requested", visit_status: "cancelled" },
    ]);
  } finally {
    await pg.close();
  }
});
