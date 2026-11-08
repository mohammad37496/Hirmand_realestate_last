import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db.ts";
import { updateAdminCommissionStatus } from "./admin-commission-input.ts";
import {
  adminDealCreateEnumsSchema,
  adminDealDocumentUpdateSchema,
  adminDealStatusUpdateSchema,
} from "./admin-deal-input.ts";
import { normalizeConsultantTargetMoney } from "./admin-consultant-targets.ts";
import { financeMoneySummary, normalizeFinanceMoney, parseFinanceAmount } from "./admin-finance-money.ts";
import {
  addDecimalStrings,
  compareDecimalStrings,
  formatDecimalMoney,
  subtractDecimalStrings,
} from "./decimal-money.ts";

describe("admin deal enum validation", () => {
  it("keeps defaults only when optional create values are omitted", () => {
    assert.deepEqual(adminDealCreateEnumsSchema.parse({}), { dealType: "sale", status: "prospect" });
    assert.deepEqual(adminDealDocumentUpdateSchema.parse({}), { documentStatus: "pending" });
  });

  it("accepts every persisted deal type and status", () => {
    for (const dealType of ["sale", "rent", "mortgage", "buy"] as const) {
      assert.equal(adminDealCreateEnumsSchema.parse({ dealType }).dealType, dealType);
    }
    for (const status of ["prospect", "negotiation", "agreement", "contracted", "completed", "cancelled"] as const) {
      assert.equal(adminDealCreateEnumsSchema.parse({ status }).status, status);
      assert.equal(adminDealStatusUpdateSchema.parse({ status }).status, status);
    }
  });

  it("rejects malformed or unsupported create enums instead of coercing them to defaults", () => {
    for (const value of ["invalid", "", " SALE ", "Prospect", null, 1, {}, []]) {
      assert.equal(adminDealCreateEnumsSchema.safeParse({ dealType: value }).success, false, `dealType=${String(value)}`);
      assert.equal(adminDealCreateEnumsSchema.safeParse({ status: value }).success, false, `status=${String(value)}`);
    }
  });

  it("requires a valid status for status mutations and validates document status", () => {
    for (const value of [undefined, "invalid", "", null, 1, {}, []]) {
      assert.equal(adminDealStatusUpdateSchema.safeParse({ status: value }).success, false, `status=${String(value)}`);
    }
    for (const value of ["invalid", "", "Verified", null, 1, {}, []]) {
      assert.equal(adminDealDocumentUpdateSchema.safeParse({ documentStatus: value }).success, false, `documentStatus=${String(value)}`);
    }
    for (const documentStatus of ["pending", "received", "verified", "rejected"] as const) {
      assert.equal(adminDealDocumentUpdateSchema.parse({ documentStatus }).documentStatus, documentStatus);
    }
  });
});

describe("exact decimal money operations", () => {
  it("compares and subtracts amounts beyond Number.MAX_SAFE_INTEGER without rounding", () => {
    assert.equal(compareDecimalStrings("9007199254740993", "9007199254740992"), 1);
    assert.equal(subtractDecimalStrings("9007199254740993.25", "9007199254740992.5"), "0.75");
    assert.equal(addDecimalStrings("9007199254740993.25", "0.75"), "9007199254740994");
  });

  it("formats large integer and fractional values without converting through Number", () => {
    assert.equal(formatDecimalMoney("9007199254740993.25"), "۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳.۲۵");
    assert.equal(formatDecimalMoney("0.005"), "۰.۰۰۵");
  });
});

describe("consultant target money input", () => {
  it("preserves large integer and fractional decimal strings without Number coercion", () => {
    assert.equal(normalizeConsultantTargetMoney("9007199254740993"), "9007199254740993");
    assert.equal(normalizeConsultantTargetMoney("9007199254740993.25"), "9007199254740993.25");
    assert.equal(normalizeConsultantTargetMoney("۹۰۰۷۱۹۹۲۵۴۷۴۰۹۹۳٫۲۵"), "9007199254740993.25");
  });

  it("rejects unsafe numeric inputs and malformed or excessive values", () => {
    assert.equal(normalizeConsultantTargetMoney(Number("9007199254740993")), "0");
    assert.equal(normalizeConsultantTargetMoney(0.1), "0");
    for (const value of ["", "-1", "1e20", "1.2.3", "x", "1".repeat(21), "1".repeat(40) + ".1", null, {}, []]) {
      assert.equal(normalizeConsultantTargetMoney(value), "0", String(value));
    }
  });
});

describe("finance ledger exact money", () => {
  it("accepts up to the numeric(20,0) limit as a decimal string", () => {
    assert.equal(parseFinanceAmount("۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳٬۰۰۰"), "9007199254740993000");
    assert.equal(parseFinanceAmount("00000042"), "42");
    assert.equal(parseFinanceAmount("1".repeat(20)), "1".repeat(20));
  });

  it("rejects invalid, negative, fractional and over-precision ledger amounts", () => {
    for (const value of ["", "-1", "1.5", "1e20", "1".repeat(21), "abc", null, {}, []]) {
      assert.equal(parseFinanceAmount(value), null, String(value));
    }
  });

  it("keeps ledger rows and aggregate balances exact beyond Number.MAX_SAFE_INTEGER", () => {
    assert.equal(normalizeFinanceMoney("90071992547409930000"), "90071992547409930000");
    assert.deepEqual(
      financeMoneySummary("90071992547409930000", "90071992547409929999"),
      { income: "90071992547409930000", expense: "90071992547409929999", balance: "1" },
    );
    assert.deepEqual(financeMoneySummary("invalid", null), { income: "0", expense: "0", balance: "0" });
  });
});

describe("commission settlement status validation", () => {
  it("rejects an invalid status without changing a paid settlement", async () => {
    const pg = new PGlite();
    try {
      await pg.exec(`
        create table admin_commission_settlements (
          id text primary key, status text not null, paid_at timestamptz,
          updated_at timestamptz not null default current_timestamp
        );
        insert into admin_commission_settlements(id,status,paid_at,updated_at)
          values ('settlement-1','paid','2026-11-01 09:30:00+00','2026-11-01 09:30:00+00');
      `);
      const before = await pg.query<{ status: string; paid_at: string; updated_at: string }>(
        "select status,paid_at::text,updated_at::text from admin_commission_settlements where id=$1",
        ["settlement-1"],
      );
      const sql = {
        query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
          (await pg.query(text, params)).rows as T[],
      } as Sql;

      assert.deepEqual(await updateAdminCommissionStatus(sql, "settlement-1", "paidd"), { kind: "invalid_status" });
      assert.deepEqual(
        await pg.query("select status,paid_at::text,updated_at::text from admin_commission_settlements where id=$1", ["settlement-1"]),
        before,
      );
      assert.equal((await updateAdminCommissionStatus(sql, "settlement-1", "approved")).kind, "updated");
      assert.equal((await updateAdminCommissionStatus(sql, "missing", "approved")).kind, "not_found");
    } finally {
      await pg.close();
    }
  });

  it("validates commission status before any settlement update in the route", async () => {
    const route = await readFile(new URL("../../server/routes/api/admin-commission.post.ts", import.meta.url), "utf8");
    const statusAction = route.slice(route.indexOf('if(action==="status")'), route.indexOf('if(action==="delete")'));
    assert.match(statusAction, /updateAdminCommissionStatus\(sql, id, body\.status\)/);
    assert.match(statusAction, /kind==="invalid_status"\) throw createError\(\{statusCode:400/);
    assert.match(statusAction, /kind==="not_found"\) throw createError\(\{statusCode:404/);
    assert.doesNotMatch(statusAction, /validStatus\(body\.status\)/);
    assert.doesNotMatch(statusAction, /update admin_commission_settlements/);
  });
});
