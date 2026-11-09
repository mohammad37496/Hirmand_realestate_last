import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { loadAdminNotificationCandidates } from "./admin-notification-candidates.ts";
import type { Sql } from "./db.ts";

const sourceQueries = [
  "follow_up_at is not null",
  "visit_status='requested'",
  "from customer_messages",
  "jsonb_array_length(images)",
];

test("notification candidates load all four source feeds", async () => {
  let calls = 0;
  const sql = {
    query: async <T = Record<string, unknown>>(_text: string, _params: unknown[] = []) => [{ id: String(++calls) }] as T[],
  } as Sql;
  const result = await loadAdminNotificationCandidates(sql);
  assert.equal(calls, 4);
  assert.deepEqual(result, {
    leads: [{ id: "1" }],
    visits: [{ id: "2" }],
    messages: [{ id: "3" }],
    staleProperties: [{ id: "4" }],
  });
});

test("stale-property notification query safely handles malformed non-array JSONB images", async () => {
  const pg = new PGlite();
  await pg.exec(`
    create table leads (id text, name text, status text, follow_up_at timestamptz, visit_status text, visit_requested_at timestamptz);
    create table customer_messages (lead_id text, sender_type text, read_by_admin_at timestamptz, created_at timestamptz);
    create table properties (id text, title text, deleted_at timestamptz, status text, images jsonb, updated_at timestamptz);
    insert into properties values
      ('object','Legacy object',null,'published','{"cover":"https://example.test/cover.jpg"}',current_timestamp),
      ('empty','Empty gallery',null,'published','[]',current_timestamp),
      ('filled','Has gallery',null,'published','["https://example.test/a.jpg"]',current_timestamp);
  `);
  const sql = {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query(text, params)).rows as T[],
  } as Sql;
  try {
    const result = await loadAdminNotificationCandidates(sql);
    assert.deepEqual(result.staleProperties.map((row) => row.id).sort(), ["empty", "object"]);
  } finally {
    await pg.close();
  }
});

for (const fragment of sourceQueries) {
  test(`notification candidate loading propagates ${fragment} database failures`, async () => {
    const sql = {
      query: async <T = Record<string, unknown>>(text: string, _params: unknown[] = []) =>
        text.includes(fragment)
          ? Promise.reject(new Error("notification source unavailable")) as Promise<T[]>
          : Promise.resolve([] as T[]),
    } as Sql;
    await assert.rejects(loadAdminNotificationCandidates(sql), /notification source unavailable/);
  });
}
