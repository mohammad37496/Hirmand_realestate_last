import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { RESET_ADMIN_ACCOUNT_PASSWORD_SQL } from "./admin-account-password-reset.ts";

async function createFixture(revokeConstraint = false) {
  const db = new PGlite();
  await db.exec(`
    create table admin_accounts (
      id text primary key,
      password_hash text not null,
      updated_at timestamptz
    );
    create table admin_sessions (
      id text primary key,
      account_id text not null,
      revoked_at timestamptz${revokeConstraint ? ", check (id <> 'session-live-1' or revoked_at is null)" : ""}
    );
    insert into admin_accounts (id,password_hash) values ('account-1','old-hash');
    insert into admin_sessions (id,account_id,revoked_at) values
      ('session-live-1','account-1',null),
      ('session-live-2','account-1',null),
      ('session-revoked','account-1',current_timestamp),
      ('other-account-session','account-2',null);
  `);
  return db;
}

test("password reset and active-session revocation succeed together", async () => {
  const db = await createFixture();
  try {
    const result = await db.query<{ id: string }>(RESET_ADMIN_ACCOUNT_PASSWORD_SQL, ["account-1", "new-hash"]);
    assert.deepEqual(result.rows, [{ id: "account-1" }]);
    const account = await db.query<{ password_hash: string }>("select password_hash from admin_accounts where id='account-1'");
    const sessions = await db.query<{ id: string; revoked_at: string | null }>(
      "select id,revoked_at from admin_sessions where account_id='account-1' order by id",
    );
    assert.equal(account.rows[0]?.password_hash, "new-hash");
    assert.ok(sessions.rows.filter((row) => row.id.startsWith("session-live")).every((row) => row.revoked_at));
    assert.ok(sessions.rows.find((row) => row.id === "session-revoked")?.revoked_at);
    const other = await db.query<{ revoked_at: string | null }>("select revoked_at from admin_sessions where id='other-account-session'");
    assert.equal(other.rows[0]?.revoked_at, null);
  } finally {
    await db.close();
  }
});

test("a session-revocation failure rolls back the password update", async () => {
  const db = await createFixture(true);
  try {
    await assert.rejects(db.query(RESET_ADMIN_ACCOUNT_PASSWORD_SQL, ["account-1", "new-hash"]));
    const account = await db.query<{ password_hash: string }>("select password_hash from admin_accounts where id='account-1'");
    assert.equal(account.rows[0]?.password_hash, "old-hash");
    const sessions = await db.query<{ revoked_at: string | null }>(
      "select revoked_at from admin_sessions where account_id='account-1' and id like 'session-live%'",
    );
    assert.ok(sessions.rows.every((row) => row.revoked_at === null));
  } finally {
    await db.close();
  }
});

test("resetting a missing account does not revoke sessions", async () => {
  const db = await createFixture();
  try {
    const result = await db.query<{ id: string }>(RESET_ADMIN_ACCOUNT_PASSWORD_SQL, ["missing-account", "new-hash"]);
    assert.deepEqual(result.rows, []);
    const sessions = await db.query<{ revoked_at: string | null }>("select revoked_at from admin_sessions where id='other-account-session'");
    assert.equal(sessions.rows[0]?.revoked_at, null);
  } finally {
    await db.close();
  }
});
