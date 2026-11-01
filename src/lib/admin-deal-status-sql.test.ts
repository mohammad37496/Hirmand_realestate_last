import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createPgliteTransactionRunner } from "./db.ts";
import {
  updateAdminDealStatusWithSettlementGuard,
  updateCommissionSettlementStatusWithDealGuard,
} from "./admin-deal-status-sql.ts";

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create table admin_deals (
      id text primary key,
      status text not null check(status in ('prospect','negotiation','agreement','contracted','completed','cancelled')),
      updated_at timestamptz not null default current_timestamp
    );
    create table admin_commission_settlements (
      id text primary key,
      deal_id text,
      status text not null check(status in ('pending','approved','paid','cancelled')),
      paid_at timestamptz,
      updated_at timestamptz not null default current_timestamp
    );
  `);
  return { db, transaction: createPgliteTransactionRunner(db) };
}

test("an active settlement blocks deal downgrades but permits contracted/completed transitions", async () => {
  const { db, transaction } = await fixture();
  try {
    for (const settlementStatus of ["pending", "approved", "paid"] as const) {
      const dealId = `deal-${settlementStatus}`;
      await db.query("insert into admin_deals(id,status) values($1,'contracted')", [dealId]);
      await db.query("insert into admin_commission_settlements(id,deal_id,status) values($1,$2,$3)", [`settlement-${settlementStatus}`, dealId, settlementStatus]);

      for (const downgradeStatus of ["prospect", "negotiation", "agreement", "cancelled"] as const) {
        const blocked = await transaction((tx) => updateAdminDealStatusWithSettlementGuard(tx, dealId, downgradeStatus));
        assert.deepEqual(blocked, { kind: "settlement_exists" });
        assert.equal((await db.query<{ status: string }>("select status from admin_deals where id=$1", [dealId])).rows[0]?.status, "contracted");
      }

      const completed = await transaction((tx) => updateAdminDealStatusWithSettlementGuard(tx, dealId, "completed"));
      assert.deepEqual(completed, { kind: "updated" });
      assert.equal((await db.query<{ status: string }>("select status from admin_deals where id=$1", [dealId])).rows[0]?.status, "completed");
    }
  } finally {
    await db.close();
  }
});

test("a cancelled settlement does not block a deal downgrade", async () => {
  const { db, transaction } = await fixture();
  try {
    await db.exec("insert into admin_deals(id,status) values('deal-1','completed'); insert into admin_commission_settlements(id,deal_id,status) values('settlement-1','deal-1','cancelled')");
    const result = await transaction((tx) => updateAdminDealStatusWithSettlementGuard(tx, "deal-1", "cancelled"));
    assert.deepEqual(result, { kind: "updated" });
    assert.equal((await db.query<{ status: string }>("select status from admin_deals where id='deal-1'")).rows[0]?.status, "cancelled");
  } finally {
    await db.close();
  }
});

test("settlement reactivation requires a contractual deal and cancelled settlements remain cancellable", async () => {
  const { db, transaction } = await fixture();
  try {
    await db.exec(`
      insert into admin_deals(id,status) values ('cancelled-deal','cancelled'),('contracted-deal','contracted'),('prospect-deal','prospect');
      insert into admin_commission_settlements(id,deal_id,status) values
        ('reactivate-cancelled','cancelled-deal','cancelled'),
        ('reactivate-contracted','contracted-deal','cancelled'),
        ('invalid-transition','contracted-deal','pending'),
        ('cancel-on-prospect','prospect-deal','pending');
    `);

    assert.deepEqual(
      await transaction((tx) => updateCommissionSettlementStatusWithDealGuard(tx, "reactivate-cancelled", "pending")),
      { kind: "deal_not_contractual" },
    );
    assert.deepEqual(
      await transaction((tx) => updateCommissionSettlementStatusWithDealGuard(tx, "reactivate-contracted", "pending")),
      { kind: "updated" },
    );
    assert.deepEqual(
      await transaction((tx) => updateCommissionSettlementStatusWithDealGuard(tx, "cancel-on-prospect", "cancelled")),
      { kind: "updated" },
    );
    assert.deepEqual(
      await transaction((tx) => updateCommissionSettlementStatusWithDealGuard(tx, "invalid-transition", "paid")),
      { kind: "invalid_transition" },
    );
  } finally {
    await db.close();
  }
});

test("linked settlement status changes cannot reactivate a settlement on a missing or non-contractual deal", async () => {
  const { db, transaction } = await fixture();
  try {
    await db.exec("insert into admin_commission_settlements(id,deal_id,status) values('orphan','missing-deal','cancelled')");
    assert.deepEqual(
      await transaction((tx) => updateCommissionSettlementStatusWithDealGuard(tx, "orphan", "pending")),
      { kind: "deal_not_contractual" },
    );
    assert.deepEqual(
      await transaction((tx) => updateCommissionSettlementStatusWithDealGuard(tx, "not-found", "pending")),
      { kind: "missing" },
    );
  } finally {
    await db.close();
  }
});
