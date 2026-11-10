import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { loadCustomerSubmissionHistory } from "./customer-submission-history.ts";
import type { Sql } from "./db.ts";

async function createFixture() {
  const pg = new PGlite();
  await pg.exec(`
    create table customer_property_submission_events (
      id text primary key,
      submission_id text not null,
      action text not null,
      note text,
      metadata jsonb,
      created_at timestamptz not null
    );
    insert into customer_property_submission_events values
      ('event-1','submission-1','created','ثبت اولیه','{"source":"public"}',current_timestamp - interval '1 hour'),
      ('event-2','submission-1','edit','ویرایش','{}',current_timestamp),
      ('other','submission-2','created','پرونده دیگر','{}',current_timestamp);
  `);
  const sql = {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query(text, params)).rows as T[],
  } as Sql;
  return { pg, sql };
}

test("submission history returns only the selected file's events in reverse chronological order", async () => {
  const { pg, sql } = await createFixture();
  try {
    const events = await loadCustomerSubmissionHistory(sql, "submission-1");
    assert.equal(events.length, 2);
    assert.equal(events[0]?.id, "event-2");
    assert.equal(events[1]?.id, "event-1");
    assert.deepEqual(events[1]?.metadata, { source: "public" });
    assert.ok(events.every((event) => Number.isFinite(Date.parse(event.createdAt))));
  } finally {
    await pg.close();
  }
});

test("submission history propagates database failures instead of returning an empty timeline", async () => {
  const { pg } = await createFixture();
  const failingSql = {
    query: <T = Record<string, unknown>>(_text: string, _params: unknown[] = []) =>
      Promise.reject(new Error("submission history database unavailable")) as Promise<T[]>,
  } as Sql;
  try {
    await assert.rejects(loadCustomerSubmissionHistory(failingSql, "submission-1"), /submission history database unavailable/);
  } finally {
    await pg.close();
  }
});
