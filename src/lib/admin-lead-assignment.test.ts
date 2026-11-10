import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Sql } from "./db.ts";
import { loadAdminLeadAssignmentRows } from "./admin-lead-assignment.ts";

function createSql(results: Array<unknown[] | Error>) {
  const calls: string[] = [];
  const sql = {
    query: async <T = Record<string, unknown>>(text: string) => {
      calls.push(text);
      const result = results.shift();
      if (result instanceof Error) throw result;
      return (result ?? []) as T[];
    },
  } as unknown as Pick<Sql, "query">;
  return { sql, calls };
}

describe("admin lead assignment data loading", () => {
  it("propagates consultant-load database errors instead of returning empty consultants", async () => {
    const { sql, calls } = createSql([new Error("consultant query unavailable")]);

    await assert.rejects(
      loadAdminLeadAssignmentRows(sql, "recommend"),
      /consultant query unavailable/,
    );
    assert.equal(calls.length, 1);
  });

  it("propagates unassigned-lead database errors instead of reporting an empty inbox", async () => {
    const { sql, calls } = createSql([[{ id: "consultant-1", name: "مشاور فعال", phone: "09120000000" }], new Error("lead query unavailable")]);

    await assert.rejects(
      loadAdminLeadAssignmentRows(sql, "recommend"),
      /lead query unavailable/,
    );
    assert.equal(calls.length, 2);
  });

  it("loads consultants for an assignment without running the recommendations query", async () => {
    const consultant = { id: "consultant-1", name: "مشاور فعال", phone: "09120000000" };
    const { sql, calls } = createSql([[consultant]]);

    const result = await loadAdminLeadAssignmentRows(sql, "assign");

    assert.deepEqual(result, { consultants: [consultant], unassigned: [] });
    assert.equal(calls.length, 1);
  });

  it("returns both datasets when every query succeeds", async () => {
    const consultant = { id: "consultant-1", name: "مشاور فعال", phone: "09120000000" };
    const lead = { id: "lead-1", name: "مشتری", phone: "09121111111" };
    const { sql, calls } = createSql([[consultant], [lead]]);

    const result = await loadAdminLeadAssignmentRows(sql, "recommend");

    assert.deepEqual(result, { consultants: [consultant], unassigned: [lead] });
    assert.equal(calls.length, 2);
  });
});
