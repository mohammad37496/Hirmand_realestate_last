import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { SET_ADMIN_ACCOUNT_ACTIVE_SQL } from "./admin-account-active-update.ts";

async function createFixture(ownerCount = 2) {
  const db = new PGlite();
  await db.exec(`
    create table admin_accounts (
      id text primary key,
      role text not null,
      is_active boolean not null default true,
      updated_at timestamptz
    );
  `);
  for (let index = 1; index <= ownerCount; index += 1) {
    await db.query("insert into admin_accounts (id,role,is_active) values ($1,'owner',true)", [`owner-${index}`]);
  }
  await db.query("insert into admin_accounts (id,role,is_active) values ('manager-1','manager',true)");
  return db;
}

test("concurrent owner deactivations cannot disable every active owner", async () => {
  const db = await createFixture(2);
  try {
    const results = await Promise.all([
      db.query<{ id: string; result: string }>(SET_ADMIN_ACCOUNT_ACTIVE_SQL, ["owner-1", false]),
      db.query<{ id: string; result: string }>(SET_ADMIN_ACCOUNT_ACTIVE_SQL, ["owner-2", false]),
    ]);
    const outcomes = results.map((result) => result.rows[0]?.result).sort();
    assert.deepEqual(outcomes, ["last_owner", "updated"]);

    const activeOwners = await db.query<{ count: number }>(
      "select count(*)::int as count from admin_accounts where role='owner' and is_active=true",
    );
    assert.equal(activeOwners.rows[0]?.count, 1);
  } finally {
    await db.close();
  }
});

test("the only active owner cannot be deactivated", async () => {
  const db = await createFixture(1);
  try {
    const result = await db.query<{ id: string; result: string }>(SET_ADMIN_ACCOUNT_ACTIVE_SQL, ["owner-1", false]);
    assert.equal(result.rows[0]?.result, "last_owner");
    const rows = await db.query<{ is_active: boolean }>("select is_active from admin_accounts where id='owner-1'");
    assert.equal(rows.rows[0]?.is_active, true);
  } finally {
    await db.close();
  }
});

test("non-owner deactivation and missing account results remain distinct", async () => {
  const db = await createFixture(1);
  try {
    const manager = await db.query<{ id: string; result: string }>(SET_ADMIN_ACCOUNT_ACTIVE_SQL, ["manager-1", false]);
    const missing = await db.query<{ id: string; result: string }>(SET_ADMIN_ACCOUNT_ACTIVE_SQL, ["missing", false]);
    assert.equal(manager.rows[0]?.result, "updated");
    assert.equal(missing.rows.length, 0);
  } finally {
    await db.close();
  }
});
