import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
    const { sql, calls } = createSql([[{ name: "مشاور فعال", phone: "09120000000" }], new Error("lead query unavailable")]);

    await assert.rejects(
      loadAdminLeadAssignmentRows(sql, "recommend"),
      /lead query unavailable/,
    );
    assert.equal(calls.length, 2);
  });

  it("loads consultants for an assignment without running the recommendations query", async () => {
    const consultant = { name: "مشاور فعال", phone: "09120000000" };
    const { sql, calls } = createSql([[consultant]]);

    const result = await loadAdminLeadAssignmentRows(sql, "assign");

    assert.deepEqual(result, { consultants: [consultant], unassigned: [] });
    assert.equal(calls.length, 1);
  });

  it("returns both datasets when every query succeeds", async () => {
    const consultant = { name: "مشاور فعال", phone: "09120000000" };
    const lead = { id: "lead-1", name: "مشتری", phone: "09121111111" };
    const { sql, calls } = createSql([[consultant], [lead]]);

    const result = await loadAdminLeadAssignmentRows(sql, "recommend");

    assert.deepEqual(result, { consultants: [consultant], unassigned: [lead] });
    assert.equal(calls.length, 2);
  });
});

it("admin lead 360 fails closed and does not show an unavailable customer as unselected", async () => {
  const route = await readFile(new URL("../../server/routes/api/admin-lead-360.post.ts", import.meta.url), "utf8");
  const component = await readFile(new URL("../components/hirmand/admin-lead-360.tsx", import.meta.url), "utf8");
  const guard = route.indexOf('dbSource === "unconfigured"');
  assert.ok(guard >= 0);
  assert.match(route, /dbSource === "unconfigured"\)\s*\{\s*throw createError\(\{ statusCode: 503/);
  assert.ok(guard < route.indexOf("getSql()"));
  assert.doesNotMatch(route, /return \{ customer: null, activities: \[\], deals: \[\], settlements: \[\], documents: \[\]/);
  assert.match(component, /loadError/);
  assert.match(component, /requestSequence/);
  assert.match(component, /role="alert"/);
  assert.match(component, /تلاش دوباره/);
  assert.match(component, /پرونده این مشتری پیدا نشد/);
});
