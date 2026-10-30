import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { resolveAdminDataHealthFinding } from "./admin-data-health-findings.ts";

test("data-health resolution changes one open finding and refuses missing or already-resolved rows", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table admin_data_health_findings (id integer primary key, resolved_at timestamptz);
      insert into admin_data_health_findings (id) values (17);
    `);
    const query = async (statement: string, params: unknown[]) => {
      const result = await db.query<{ id: number }>(statement, params);
      return result.rows;
    };

    assert.equal(await resolveAdminDataHealthFinding(query, 17), 17);
    assert.equal(await resolveAdminDataHealthFinding(query, 17), null);
    assert.equal(await resolveAdminDataHealthFinding(query, 18), null);
  } finally {
    await db.close();
  }
});
