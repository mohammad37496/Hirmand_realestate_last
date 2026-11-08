import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  adminDealCreateEnumsSchema,
  adminDealDocumentUpdateSchema,
  adminDealStatusUpdateSchema,
} from "./admin-deal-input.ts";
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
