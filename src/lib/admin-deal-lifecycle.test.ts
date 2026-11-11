import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  createAdminCommissionSettlement,
  deleteAdminCommissionSettlement,
  deleteAdminDeal,
} from "./admin-deal-lifecycle.ts";
import {
  updateAdminDealStatusWithSettlementGuard,
  updateCommissionSettlementStatusWithDealGuard,
} from "./admin-deal-status-sql.ts";
import { updateAdminCommissionStatus } from "./admin-commission-input.ts";
import type { Sql } from "./db.ts";

async function createFixture() {
  const pg = new PGlite();
  await pg.exec(`
    create table admin_deals (
      id text primary key,
      status text not null check(status in ('prospect','negotiation','agreement','contracted','completed','cancelled')),
      consultant text not null default '',
      commission numeric,
      updated_at timestamptz not null default current_timestamp
    );
    create table admin_deal_documents (id text primary key, deal_id text not null);
    create table admin_commission_settlements (
      id text primary key, consultant text not null, deal_id text,
      commission_amount numeric not null, consultant_share numeric not null,
      office_share numeric not null, status text not null check(status in ('pending','approved','paid','cancelled')),
      paid_at timestamptz, note text not null, created_by text not null,
      updated_at timestamptz not null default current_timestamp
    );
    insert into admin_deals(id,status,consultant,commission) values
      ('with-settlement','contracted','مشاور','9007199254740993.25'),
      ('without-settlement','prospect','مشاور',100),
      ('completed-deal','completed','مشاور',100),
      ('completed-deal-2','completed','مشاور',100),
      ('prospect-deal','prospect','مشاور',100),
      ('cancelled-deal','cancelled','مشاور',100),
      ('mismatch-deal','contracted','مشاور دیگر',100),
      ('amount-mismatch-deal','contracted','مشاور',101),
      ('nonfinite-commission-deal','contracted','مشاور','NaN');
    insert into admin_deal_documents(id,deal_id) values ('doc-linked','with-settlement'),('doc-free','without-settlement');
  `);
  const sql = {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query(text, params)).rows as T[],
    transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) =>
      pg.transaction(async (tx) => callback({
        query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) =>
          (await tx.query(text, params)).rows as R[],
      } as Sql)),
  } as Sql;
  return { pg, sql };
}

test("a deal with any settlement is retained with its documents and accounting rows", async () => {
  const { pg, sql } = await createFixture();
  try {
    const created = await createAdminCommissionSettlement(sql, {
      id: "settlement-1", consultant: "مشاور", dealId: "with-settlement",
      commission: "9007199254740993.25", consultantShare: "5000000000000000.25",
      officeShare: "4007199254740993", note: "accounting history", createdBy: "owner",
    });
    assert.deepEqual(created, { kind: "created", id: "settlement-1" });
    assert.deepEqual(await deleteAdminDeal(sql, "with-settlement"), { kind: "settlements_exist" });
    assert.equal((await sql.query("select id from admin_deals where id='with-settlement'")).length, 1);
    assert.equal((await sql.query("select id from admin_deal_documents where deal_id='with-settlement'")).length, 1);
    assert.equal((await sql.query("select id from admin_commission_settlements where deal_id='with-settlement'")).length, 1);
  } finally {
    await pg.close();
  }
});

test("a deal without settlements can be deleted with its documents atomically", async () => {
  const { pg, sql } = await createFixture();
  try {
    assert.deepEqual(await deleteAdminDeal(sql, "without-settlement"), { kind: "deleted" });
    assert.equal((await sql.query("select id from admin_deals where id='without-settlement'")).length, 0);
    assert.equal((await sql.query("select id from admin_deal_documents where deal_id='without-settlement'")).length, 0);
    assert.deepEqual(await deleteAdminDeal(sql, "missing"), { kind: "not_found" });
  } finally {
    await pg.close();
  }
});

test("settlement creation requires a linked deal and rejects missing deals", async () => {
  const { pg, sql } = await createFixture();
  try {
    const missing = await createAdminCommissionSettlement(sql, {
      id: "orphan-attempt", consultant: "مشاور", dealId: "missing",
      commission: "100", consultantShare: "50", officeShare: "50", note: "", createdBy: "owner",
    });
    assert.deepEqual(missing, { kind: "deal_not_found" });
    const standalone = await createAdminCommissionSettlement(sql, {
      id: "standalone", consultant: "مشاور", dealId: null,
      commission: "100", consultantShare: "50", officeShare: "50", note: "", createdBy: "owner",
    });
    assert.deepEqual(standalone, { kind: "deal_required" });
  } finally {
    await pg.close();
  }
});

test("linked settlements require a contracted or completed deal with exact consultant and commission", async () => {
  const { pg, sql } = await createFixture();
  try {
    const input = (id: string, dealId: string, consultant = "مشاور", commission = "100") => ({
      id, consultant, dealId, commission, consultantShare: "60", officeShare: "40", note: "", createdBy: "owner",
    });
    assert.deepEqual(await createAdminCommissionSettlement(sql, input("valid-contracted", "with-settlement", "مشاور", "9007199254740993.25")), {
      kind: "created", id: "valid-contracted",
    });
    assert.deepEqual(await createAdminCommissionSettlement(sql, input("valid-completed", "completed-deal")), {
      kind: "created", id: "valid-completed",
    });
    assert.deepEqual(await createAdminCommissionSettlement(sql, input("invalid-prospect", "prospect-deal")), { kind: "deal_not_contractual" });
    assert.deepEqual(await createAdminCommissionSettlement(sql, input("invalid-cancelled", "cancelled-deal")), { kind: "deal_not_contractual" });
    assert.deepEqual(await createAdminCommissionSettlement(sql, input("invalid-consultant", "mismatch-deal")), { kind: "consultant_mismatch" });
    assert.deepEqual(await createAdminCommissionSettlement(sql, input("invalid-commission", "amount-mismatch-deal")), { kind: "commission_mismatch" });
    assert.deepEqual(await createAdminCommissionSettlement(sql, input("invalid-nonfinite-commission", "nonfinite-commission-deal")), { kind: "commission_mismatch" });
    assert.deepEqual(await createAdminCommissionSettlement(sql, input("invalid-input-commission", "completed-deal", "مشاور", "not-a-number")), { kind: "commission_mismatch" });
  } finally {
    await pg.close();
  }
});

test("only one non-cancelled settlement can be active for a linked deal", async () => {
  const { pg, sql } = await createFixture();
  try {
    for (const status of ["pending", "approved", "paid"] as const) {
      const dealId = `duplicate-${status}`;
      await sql.query("insert into admin_deals(id,status,consultant,commission) values($1,'completed','مشاور',100)", [dealId]);
      await sql.query(
        "insert into admin_commission_settlements(id,consultant,deal_id,commission_amount,consultant_share,office_share,status,note,created_by) values($1,'مشاور',$2,100,60,40,$3,'','owner')",
        [`existing-${status}`, dealId, status],
      );
      const input = (id: string) => ({
        id, consultant: "مشاور", dealId, commission: "100.00",
        consultantShare: "60", officeShare: "40", note: "", createdBy: "owner",
      });
      assert.deepEqual(await createAdminCommissionSettlement(sql, input(`blocked-${status}`)), { kind: "duplicate_active" });
      await sql.query("update admin_commission_settlements set status='cancelled' where id=$1", [`existing-${status}`]);
      assert.deepEqual(await createAdminCommissionSettlement(sql, input(`replacement-${status}`)), {
        kind: "created", id: `replacement-${status}`,
      });
    }
  } finally {
    await pg.close();
  }
});

test("settlement deletion permits pending/cancelled only and preserves approved/paid rows", async () => {
  const { pg, sql } = await createFixture();
  try {
    for (const status of ["pending", "cancelled"] as const) {
      await sql.query(
        "insert into admin_commission_settlements(id,consultant,deal_id,commission_amount,consultant_share,office_share,status,note,created_by) values($1,'مشاور','completed-deal',100,60,40,$2,'','owner')",
        [`delete-${status}`, status],
      );
      assert.deepEqual(await deleteAdminCommissionSettlement(sql, `delete-${status}`), { kind: "deleted" });
    }
    for (const status of ["approved", "paid"] as const) {
      await sql.query(
        "insert into admin_commission_settlements(id,consultant,deal_id,commission_amount,consultant_share,office_share,status,paid_at,note,created_by) values($1,'مشاور','completed-deal',100,60,40,$2,case when $2='paid' then current_timestamp else null end,'','owner')",
        [`retain-${status}`, status],
      );
      assert.deepEqual(await deleteAdminCommissionSettlement(sql, `retain-${status}`), { kind: "not_deletable" });
      assert.equal((await sql.query<{ status: string; paid_at: string | null }>(
        "select status,paid_at from admin_commission_settlements where id=$1", [`retain-${status}`],
      ))[0]?.status, status);
    }
    assert.deepEqual(await deleteAdminCommissionSettlement(sql, "missing"), { kind: "not_found" });
  } finally {
    await pg.close();
  }
});

test("deal status changes block every downgrade while pending, approved or paid settlements exist", async () => {
  const { pg, sql } = await createFixture();
  try {
    for (const settlementStatus of ["pending", "approved", "paid"] as const) {
      const dealId = `guard-${settlementStatus}`;
      await sql.query("insert into admin_deals(id,status,consultant,commission) values($1,'contracted','مشاور',100)", [dealId]);
      await sql.query(
        "insert into admin_commission_settlements(id,consultant,deal_id,commission_amount,consultant_share,office_share,status,note,created_by) values($1,'مشاور',$2,100,60,40,$3,'','owner')",
        [`settlement-${settlementStatus}`, dealId, settlementStatus],
      );
      for (const nextStatus of ["prospect", "negotiation", "agreement", "cancelled"] as const) {
        assert.deepEqual(await updateAdminDealStatusWithSettlementGuard(sql, dealId, nextStatus), { kind: "settlement_exists" });
        assert.equal((await sql.query<{ status: string }>("select status from admin_deals where id=$1", [dealId]))[0]?.status, "contracted");
      }
      assert.deepEqual(await updateAdminDealStatusWithSettlementGuard(sql, dealId, "completed"), { kind: "updated" });
    }
    await sql.query("insert into admin_commission_settlements(id,consultant,deal_id,commission_amount,consultant_share,office_share,status,note,created_by) values('cancelled-history','مشاور','completed-deal',100,60,40,'cancelled','','owner')");
    assert.deepEqual(await updateAdminDealStatusWithSettlementGuard(sql, "completed-deal", "cancelled"), { kind: "updated" });
    assert.deepEqual(await updateAdminDealStatusWithSettlementGuard(sql, "missing-deal", "cancelled"), { kind: "missing" });

    await sql.query("insert into admin_commission_settlements(id,consultant,deal_id,commission_amount,consultant_share,office_share,status,note,created_by) values('reactivate-on-prospect','مشاور','prospect-deal',100,60,40,'cancelled','','owner')");
    assert.deepEqual(await updateCommissionSettlementStatusWithDealGuard(sql, "reactivate-on-prospect", "pending"), { kind: "deal_not_contractual" });
    await sql.query("insert into admin_commission_settlements(id,consultant,deal_id,commission_amount,consultant_share,office_share,status,note,created_by) values('cancel-on-prospect','مشاور','prospect-deal',100,60,40,'pending','','owner')");
    assert.deepEqual(await updateCommissionSettlementStatusWithDealGuard(sql, "cancel-on-prospect", "cancelled"), { kind: "updated" });
  } finally {
    await pg.close();
  }
});

test("settlement transitions follow the approval graph and clear paid_at outside paid", async () => {
  const { pg, sql } = await createFixture();
  try {
    await sql.query("insert into admin_commission_settlements(id,consultant,deal_id,commission_amount,consultant_share,office_share,status,note,created_by) values('state-row','مشاور','completed-deal',100,60,40,'pending','','owner')");
    assert.deepEqual(await updateCommissionSettlementStatusWithDealGuard(sql, "state-row", "paid"), { kind: "invalid_transition" });
    assert.deepEqual(await updateCommissionSettlementStatusWithDealGuard(sql, "state-row", "approved"), { kind: "updated" });
    assert.deepEqual(await updateCommissionSettlementStatusWithDealGuard(sql, "state-row", "paid"), { kind: "updated" });
    const paid = (await sql.query<{ paid_at: string | null }>("select paid_at from admin_commission_settlements where id='state-row'"))[0];
    assert.ok(paid?.paid_at);
    assert.deepEqual(await updateCommissionSettlementStatusWithDealGuard(sql, "state-row", "approved"), { kind: "invalid_transition" });
    assert.deepEqual(await updateCommissionSettlementStatusWithDealGuard(sql, "state-row", "cancelled"), { kind: "invalid_transition" });

    await sql.query("insert into admin_commission_settlements(id,consultant,deal_id,commission_amount,consultant_share,office_share,status,paid_at,note,created_by) values('cancel-row','مشاور','completed-deal-2',100,60,40,'approved',current_timestamp,'','owner')");
    assert.deepEqual(await updateCommissionSettlementStatusWithDealGuard(sql, "cancel-row", "cancelled"), { kind: "updated" });
    assert.equal((await sql.query<{ paid_at: string | null }>("select paid_at from admin_commission_settlements where id='cancel-row'"))[0]?.paid_at, null);
    assert.deepEqual(await updateCommissionSettlementStatusWithDealGuard(sql, "cancel-row", "pending"), { kind: "updated" });
    assert.deepEqual(await updateCommissionSettlementStatusWithDealGuard(sql, "missing", "pending"), { kind: "missing" });

    await sql.query("insert into admin_commission_settlements(id,consultant,deal_id,commission_amount,consultant_share,office_share,status,note,created_by) values('orphan-reactivation','مشاور','missing-deal',100,60,40,'cancelled','','owner')");
    assert.deepEqual(await updateCommissionSettlementStatusWithDealGuard(sql, "orphan-reactivation", "pending"), { kind: "deal_not_contractual" });
  } finally {
    await pg.close();
  }
});

test("legacy unlinked settlements cannot be reactivated, approved or paid", async () => {
  const { pg, sql } = await createFixture();
  try {
    await sql.query("insert into admin_commission_settlements(id,consultant,deal_id,commission_amount,consultant_share,office_share,status,note,created_by) values('legacy-pending','مشاور',null,100,60,40,'pending','','owner')");
    await sql.query("insert into admin_commission_settlements(id,consultant,deal_id,commission_amount,consultant_share,office_share,status,note,created_by) values('legacy-cancelled','مشاور',null,100,60,40,'cancelled','','owner')");

    assert.deepEqual(await updateCommissionSettlementStatusWithDealGuard(sql, "legacy-pending", "approved"), { kind: "deal_required" });
    assert.deepEqual(await updateCommissionSettlementStatusWithDealGuard(sql, "legacy-pending", "paid"), { kind: "deal_required" });
    assert.deepEqual(await updateCommissionSettlementStatusWithDealGuard(sql, "legacy-cancelled", "pending"), { kind: "deal_required" });
    assert.deepEqual(await updateCommissionSettlementStatusWithDealGuard(sql, "legacy-pending", "cancelled"), { kind: "updated" });

    const rows = await sql.query<{ id: string; status: string; paid_at: string | null }>(
      "select id,status,paid_at from admin_commission_settlements where id like 'legacy-%' order by id",
    );
    assert.deepEqual(rows.map((row) => ({ id: row.id, status: row.status, paidAt: row.paid_at })), [
      { id: "legacy-cancelled", status: "cancelled", paidAt: null },
      { id: "legacy-pending", status: "cancelled", paidAt: null },
    ]);
  } finally {
    await pg.close();
  }
});

test("every settlement status pair matches the pending/approved/paid/cancelled transition matrix", async () => {
  const { pg, sql } = await createFixture();
  const allowed: Record<string, string[]> = {
    pending: ["pending", "approved", "cancelled"],
    approved: ["approved", "paid", "cancelled"],
    paid: ["paid"],
    cancelled: ["cancelled", "pending"],
  };
  try {
    for (const current of ["pending", "approved", "paid", "cancelled"] as const) {
      for (const next of ["pending", "approved", "paid", "cancelled"] as const) {
        const id = `matrix-${current}-${next}`;
        const dealId = `matrix-deal-${current}-${next}`;
        await sql.query("insert into admin_deals(id,status,consultant,commission) values($1,'completed','مشاور',100)", [dealId]);
        await sql.query(
          "insert into admin_commission_settlements(id,consultant,deal_id,commission_amount,consultant_share,office_share,status,paid_at,note,created_by) values($1,'مشاور',$2,100,60,40,$3,current_timestamp,'','owner')",
          [id, dealId, current],
        );
        const result = await updateCommissionSettlementStatusWithDealGuard(sql, id, next);
        const shouldUpdate = allowed[current].includes(next);
        assert.deepEqual(result, shouldUpdate ? { kind: "updated" } : { kind: "invalid_transition" }, `${current} -> ${next}`);
        const persisted = (await sql.query<{ status: string; paid_at: string | null }>(
          "select status,paid_at from admin_commission_settlements where id=$1", [id],
        ))[0];
        assert.equal(persisted?.status, shouldUpdate ? next : current, `${current} -> ${next} status`);
        assert.equal(Boolean(persisted?.paid_at), shouldUpdate ? next === "paid" : true, `${current} -> ${next} paid_at`);
      }
    }
    assert.deepEqual(await updateAdminCommissionStatus(sql, "missing-wrapper-row", "pending"), { kind: "not_found" });
    assert.deepEqual(await updateAdminCommissionStatus(sql, "missing-wrapper-row", "unknown"), { kind: "invalid_status" });
  } finally {
    await pg.close();
  }
});

test("cancelled-settlement reactivation cannot create a second active settlement for the same deal", async () => {
  const { pg, sql } = await createFixture();
  try {
    await sql.query("insert into admin_commission_settlements(id,consultant,deal_id,commission_amount,consultant_share,office_share,status,note,created_by) values('active-existing','مشاور','completed-deal',100,60,40,'pending','','owner')");
    await sql.query("insert into admin_commission_settlements(id,consultant,deal_id,commission_amount,consultant_share,office_share,status,note,created_by) values('cancelled-old','مشاور','completed-deal',100,60,40,'cancelled','','owner')");
    assert.deepEqual(await updateCommissionSettlementStatusWithDealGuard(sql, "cancelled-old", "pending"), { kind: "duplicate_active" });
    assert.equal((await sql.query<{ status: string }>("select status from admin_commission_settlements where id='cancelled-old'"))[0]?.status, "cancelled");
    assert.deepEqual(await updateCommissionSettlementStatusWithDealGuard(sql, "active-existing", "cancelled"), { kind: "updated" });
    assert.deepEqual(await updateCommissionSettlementStatusWithDealGuard(sql, "cancelled-old", "pending"), { kind: "updated" });
  } finally {
    await pg.close();
  }
});

test("deal deletion and settlement creation are guarded by the shared lifecycle helpers", async () => {
  const dealsRoute = await readFile(new URL("../../server/routes/api/admin-deals.post.ts", import.meta.url), "utf8");
  const commissionRoute = await readFile(new URL("../../server/routes/api/admin-commission.post.ts", import.meta.url), "utf8");
  assert.match(dealsRoute, /deleteAdminDeal\(sql,id\)/);
  assert.match(dealsRoute, /kind==="settlements_exist"\)throw createError\(\{statusCode:409/);
  assert.match(commissionRoute, /createAdminCommissionSettlement\(sql/);
  assert.match(commissionRoute, /kind==="deal_not_found"\)throw createError\(\{statusCode:404/);
  assert.match(commissionRoute, /kind==="deal_not_contractual"\)throw createError\(\{statusCode:409/);
  assert.match(commissionRoute, /kind==="consultant_mismatch"\)throw createError\(\{statusCode:409/);
  assert.match(commissionRoute, /kind==="commission_mismatch"\)throw createError\(\{statusCode:409/);
  assert.match(commissionRoute, /deleteAdminCommissionSettlement\(sql,id\)/);
  assert.match(commissionRoute, /kind==="not_deletable"\)throw createError\(\{statusCode:409/);
  assert.doesNotMatch(dealsRoute, /delete from admin_deal_documents where deal_id=\$1.*delete from admin_deals/s);
  assert.doesNotMatch(commissionRoute, /insert into admin_commission_settlements\(/);
});
