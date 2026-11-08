import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import pg from "pg";
import test from "node:test";
import { cancelPropertyOpenHouse, createPropertyOpenHouseRsvp } from "../src/lib/property-open-house-rsvp.ts";

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function twoPartyBarrier() {
  let arrived = 0;
  const gate = deferred();
  return async () => {
    arrived += 1;
    if (arrived === 2) gate.resolve();
    await gate.promise;
  };
}

function createTransactionalSql(pool, hooks = {}) {
  return {
    transaction: async (callback) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const pidResult = await client.query("select pg_backend_pid() as pid");
        const backendPid = Number(pidResult.rows[0]?.pid);
        await hooks.onBegin?.(backendPid);
        const transactionSql = {
          query: async (text, params = []) => {
            const eventLock = /from\s+property_open_houses\s+where\s+id=\$1\s+for update/i.test(text);
            const result = await client.query(text, params);
            if (eventLock) await hooks.afterEventLock?.(backendPid);
            return result.rows;
          },
        };
        const result = await callback(transactionSql);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

async function waitForBlockedBackend(admin, backendPid) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await admin.query(
      "select wait_event_type, cardinality(pg_blocking_pids(pid))::int as blockers from pg_stat_activity where pid=$1",
      [backendPid],
    );
    if (result.rows[0]?.wait_event_type === "Lock" && Number(result.rows[0]?.blockers) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`PostgreSQL backend ${backendPid} never entered a row-lock wait`);
}

test("open-house RSVP capacity, uniqueness and both cancellation lock orders serialize across PostgreSQL sessions", {
  skip: !databaseUrl && "TEST_DATABASE_URL must point to an isolated PostgreSQL test database",
}, async () => {
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const schema = `open_house_rsvp_${process.pid}_${randomBytes(4).toString("hex")}`;
  let pool;
  try {
    await admin.query(`create schema "${schema}"`);
    pool = new Pool({
      connectionString: databaseUrl,
      max: 8,
      options: `-c search_path=${schema},public`,
    });
    await pool.query(`
      create table properties (
        id text primary key, status text not null, deleted_at timestamptz,
        publish_at timestamptz, unpublish_at timestamptz
      );
      create table property_open_houses (
        id text primary key, property_id text not null, starts_at timestamptz not null,
        capacity integer not null, status text not null
      );
      create table property_open_house_rsvps (
        id text primary key, open_house_id text not null, name text not null,
        phone text not null, party_size integer not null, note text not null default '',
        status text not null default 'requested'
      );
      insert into properties(id,status) values ('property-1','published');
    `);
    const migration = await readFile(
      new URL("../migrations/0061_open_house_rsvp_atomicity.sql", import.meta.url),
      "utf8",
    );
    await pool.query(migration);

    const addEvent = async (id, capacity = 8) => pool.query(
      "insert into property_open_houses(id,property_id,starts_at,capacity,status) values($1,'property-1','2099-11-09T10:00:00Z',$2,'scheduled')",
      [id, capacity],
    );
    const activeSeats = async (eventId) => {
      const result = await pool.query(
        "select coalesce(sum(party_size),0)::int as seats from property_open_house_rsvps where open_house_id=$1 and status <> 'cancelled'",
        [eventId],
      );
      return Number(result.rows[0]?.seats) || 0;
    };
    const assertNoActiveRsvps = async (eventId) => {
      assert.equal(await activeSeats(eventId), 0, `event ${eventId} must have no active RSVPs`);
    };

    await addEvent("capacity-race", 3);
    const capacityPids = [];
    const capacityLockHeld = deferred();
    const releaseCapacityLock = deferred();
    let capacityHolderPid;
    const twoPartyBarrierGate = twoPartyBarrier();
    const capacityHooks = {
      onBegin: async (pid) => { capacityPids.push(pid); await twoPartyBarrierGate(); },
      afterEventLock: async (pid) => {
        if (capacityHolderPid == null) {
          capacityHolderPid = pid;
          capacityLockHeld.resolve();
          await releaseCapacityLock.promise;
        }
      },
    };
    const capacitySql = createTransactionalSql(pool, capacityHooks);
    const capacityPromises = [
      createPropertyOpenHouseRsvp(capacitySql, { eventId: "capacity-race", name: "One", phone: "09130000001", partySize: 2, note: "" }),
      createPropertyOpenHouseRsvp(capacitySql, { eventId: "capacity-race", name: "Two", phone: "09130000002", partySize: 2, note: "" }),
    ];
    await capacityLockHeld.promise;
    const capacityContenderPid = capacityPids.find((pid) => pid !== capacityHolderPid);
    await waitForBlockedBackend(admin, capacityContenderPid);
    releaseCapacityLock.resolve();
    const capacityResults = await Promise.all(capacityPromises);
    assert.deepEqual(capacityResults.map((result) => result.kind).sort(), ["capacity", "created"]);
    assert.equal(await activeSeats("capacity-race"), 2);

    await addEvent("duplicate-race", 8);
    const duplicatePids = [];
    const duplicateLockHeld = deferred();
    const releaseDuplicateLock = deferred();
    let duplicateHolderPid;
    const duplicateBarrierGate = twoPartyBarrier();
    const duplicateSql = createTransactionalSql(pool, {
      onBegin: async (pid) => { duplicatePids.push(pid); await duplicateBarrierGate(); },
      afterEventLock: async (pid) => {
        if (duplicateHolderPid == null) {
          duplicateHolderPid = pid;
          duplicateLockHeld.resolve();
          await releaseDuplicateLock.promise;
        }
      },
    });
    const duplicatePromises = [
      createPropertyOpenHouseRsvp(duplicateSql, { eventId: "duplicate-race", name: "Same", phone: "09130000003", partySize: 1, note: "" }),
      createPropertyOpenHouseRsvp(duplicateSql, { eventId: "duplicate-race", name: "Same", phone: "09130000003", partySize: 1, note: "" }),
    ];
    await duplicateLockHeld.promise;
    const duplicateContenderPid = duplicatePids.find((pid) => pid !== duplicateHolderPid);
    await waitForBlockedBackend(admin, duplicateContenderPid);
    releaseDuplicateLock.resolve();
    const duplicateResults = await Promise.all(duplicatePromises);
    assert.deepEqual(duplicateResults.map((result) => result.kind).sort(), ["created", "duplicate"]);
    await assert.rejects(
      pool.query(
        "insert into property_open_house_rsvps(id,open_house_id,name,phone,party_size,note) values('duplicate-direct','duplicate-race','Direct','09130000003',1,'')",
      ),
      (error) => error.code === "23505" && error.constraint === "property_open_house_rsvps_active_phone_uidx",
    );
    await pool.query("update property_open_house_rsvps set status='cancelled' where open_house_id='duplicate-race' and phone='09130000003'");
    await pool.query(
      "insert into property_open_house_rsvps(id,open_house_id,name,phone,party_size,note) values('duplicate-retry','duplicate-race','Retry','09130000003',1,'')",
    );

    // RSVP obtains the event lock first; cancellation waits, then must cancel
    // the RSVP that commits immediately before it.
    await addEvent("rsvp-first");
    const rsvpLocked = deferred();
    const releaseRsvp = deferred();
    const cancelPid = deferred();
    const rsvpFirst = createPropertyOpenHouseRsvp(
      createTransactionalSql(pool, { afterEventLock: async () => { rsvpLocked.resolve(); await releaseRsvp.promise; } }),
      { eventId: "rsvp-first", name: "Guest", phone: "09130000004", partySize: 2, note: "" },
    );
    await rsvpLocked.promise;
    const cancelAfterRsvp = cancelPropertyOpenHouse(
      createTransactionalSql(pool, { onBegin: (pid) => cancelPid.resolve(pid) }),
      "rsvp-first",
    );
    await waitForBlockedBackend(admin, await cancelPid.promise);
    releaseRsvp.resolve();
    const [rsvpFirstResult, cancelAfterRsvpResult] = await Promise.all([rsvpFirst, cancelAfterRsvp]);
    assert.equal(rsvpFirstResult.kind, "created");
    assert.equal(cancelAfterRsvpResult, "cancelled");
    const rsvpFirstEvent = await pool.query("select status from property_open_houses where id='rsvp-first'");
    assert.equal(rsvpFirstEvent.rows[0]?.status, "cancelled");
    await assertNoActiveRsvps("rsvp-first");

    // Cancellation obtains the event lock first; a waiting RSVP must observe
    // the committed cancelled status and must not insert a row.
    await addEvent("cancel-first");
    const cancelLocked = deferred();
    const releaseCancel = deferred();
    const rsvpPid = deferred();
    const cancelFirst = cancelPropertyOpenHouse(
      createTransactionalSql(pool, { afterEventLock: async () => { cancelLocked.resolve(); await releaseCancel.promise; } }),
      "cancel-first",
    );
    await cancelLocked.promise;
    const rsvpAfterCancel = createPropertyOpenHouseRsvp(
      createTransactionalSql(pool, { onBegin: (pid) => rsvpPid.resolve(pid) }),
      { eventId: "cancel-first", name: "Late", phone: "09130000005", partySize: 1, note: "" },
    );
    await waitForBlockedBackend(admin, await rsvpPid.promise);
    releaseCancel.resolve();
    const [cancelFirstResult, rsvpAfterCancelResult] = await Promise.all([cancelFirst, rsvpAfterCancel]);
    assert.equal(cancelFirstResult, "cancelled");
    assert.equal(rsvpAfterCancelResult.kind, "not_found");
    const cancelFirstEvent = await pool.query("select status from property_open_houses where id='cancel-first'");
    assert.equal(cancelFirstEvent.rows[0]?.status, "cancelled");
    await assertNoActiveRsvps("cancel-first");
  } finally {
    if (pool) await pool.end().catch(() => {});
    await admin.query(`drop schema if exists "${schema}" cascade`).catch(() => {});
    await admin.end();
  }
});
