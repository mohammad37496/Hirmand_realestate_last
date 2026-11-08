import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  createAdminCommissionSettlement,
  deleteAdminDeal,
} from "./admin-deal-lifecycle.ts";
import type { Sql } from "./db.ts";

async function createFixture() {
  const pg = new PGlite();
  await pg.exec(`
    create table admin_deals (id text primary key);
    create table admin_deal_documents (id text primary key, deal_id text not null);
    create table admin_commission_settlements (
      id text primary key, consultant text not null, deal_id text,
      commission_amount numeric not null, consultant_share numeric not null,
      office_share numeric not null, status text not null, note text not null, created_by text not null
    );
    insert into admin_deals(id) values ('with-settlement'),('without-settlement');
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

test("a settlement cannot be created against a missing deal but standalone settlements remain supported", async () => {
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
    assert.deepEqual(standalone, { kind: "created", id: "standalone" });
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
  assert.doesNotMatch(dealsRoute, /delete from admin_deal_documents where deal_id=\$1.*delete from admin_deals/s);
  assert.doesNotMatch(commissionRoute, /insert into admin_commission_settlements\(/);
});
