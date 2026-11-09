import assert from "node:assert/strict";
import { test } from "node:test";
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
