import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db.ts";
import { hasCompleteAdminProductivitySummary, loadAdminProductivitySystemCounts } from "./admin-productivity-health.ts";

function createSql(query: (text: string) => Promise<unknown[]>) {
  return {
    query: async <T = Record<string, unknown>>(text: string) => await query(text) as T[],
  } as unknown as Pick<Sql, "query">;
}

test("returns actual productivity counts and preserves genuine zero rows", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table properties(id text);
      create table leads(id text);
      create table consultants(id text);
      create table admin_tasks(id text);
      create table media_objects(id text);
      insert into properties values ('p1'), ('p2');
      insert into leads values ('l1');
      insert into consultants values ('c1');
      insert into admin_tasks values ('t1'), ('t2'), ('t3');
    `);
    const sql = {
      query: async <T = Record<string, unknown>>(text: string) => (await pg.query<T>(text)).rows,
    } as unknown as Pick<Sql, "query">;
    const result = await loadAdminProductivitySystemCounts(sql);
    assert.equal(result.status, "healthy");
    assert.equal(result.coreReady, true);
    assert.deepEqual(result.counts, { properties: 2, leads: 1, consultants: 1, media: 0, tasks: 3 });
    assert.ok(result.lastSuccessfulAt);
  } finally {
    await pg.close();
  }
});

test("reports optional media schema absence as degraded instead of zero", async () => {
  const sql = createSql(async (text) => {
    if (text.includes("media_objects")) throw Object.assign(new Error("relation \"media_objects\" does not exist"), { code: "42P01" });
    return [{ count: 0 }];
  });
  const result = await loadAdminProductivitySystemCounts(sql);
  assert.equal(result.status, "degraded");
  assert.equal(result.coreReady, true);
  assert.equal(result.counts.media, null);
  assert.equal(result.counterStatus.media, "missing");
  assert.equal(result.lastSuccessfulAt, null);
});

test("reports core database query failures as error without fabricated zero counts", async () => {
  const sql = createSql(async (text) => {
    if (text.includes("from leads")) throw new Error("database unavailable");
    return [{ count: 0 }];
  });
  const result = await loadAdminProductivitySystemCounts(sql);
  assert.equal(result.status, "error");
  assert.equal(result.coreReady, false);
  assert.equal(result.counts.leads, null);
  assert.equal(result.counterStatus.leads, "error");
  assert.equal(result.lastSuccessfulAt, null);
});

test("marks query timeouts explicitly and restores healthy status after recovery", async () => {
  let timedOut = true;
  const sql = createSql(async (text) => {
    if (timedOut && text.includes("from properties")) return new Promise<unknown[]>(() => {});
    return [{ count: 4 }];
  });
  const failed = await loadAdminProductivitySystemCounts(sql, { timeoutMs: 5 });
  assert.equal(failed.status, "timeout");
  assert.equal(failed.counts.properties, null);
  assert.deepEqual(failed.timedOutCounters, ["properties"]);
  assert.equal(failed.lastSuccessfulAt, null);

  timedOut = false;
  const recovered = await loadAdminProductivitySystemCounts(sql);
  assert.equal(recovered.status, "healthy");
  assert.equal(recovered.counts.properties, 4);
  assert.ok(recovered.lastSuccessfulAt);
});

test("recognizes PostgreSQL statement timeouts", async () => {
  const sql = createSql(async (text) => {
    if (text.includes("from consultants")) throw Object.assign(new Error("statement canceled"), { code: "57014" });
    return [{ count: 2 }];
  });
  const result = await loadAdminProductivitySystemCounts(sql);
  assert.equal(result.status, "timeout");
  assert.equal(result.counterStatus.consultants, "timeout");
  assert.deepEqual(result.timedOutCounters, ["consultants"]);
});

test("treats incomplete count responses as errors rather than empty tables", async () => {
  const sql = createSql(async (text) => text.includes("from admin_tasks") ? [] : [{ count: 1 }]);
  const result = await loadAdminProductivitySystemCounts(sql);
  assert.equal(result.status, "error");
  assert.equal(result.counts.tasks, null);
  assert.equal(result.counterStatus.tasks, "error");
});

test("rejects incomplete summary rows instead of converting absent counts to zero", () => {
  const taskRows = [{ open: 0, overdue: 0, today: 0, next7: 0 }];
  const propertyRows = [{ total: 0, published: 0, without_images: 0, incomplete: 0, stale: 0, expired_featured: 0 }];
  assert.equal(hasCompleteAdminProductivitySummary(taskRows, propertyRows, []), true);
  assert.equal(hasCompleteAdminProductivitySummary([], propertyRows, []), false);
  assert.equal(hasCompleteAdminProductivitySummary(taskRows, [{ total: null }], []), false);
  assert.equal(hasCompleteAdminProductivitySummary(taskRows, propertyRows, [{ file_count: 2, files: null }]), false);
});
