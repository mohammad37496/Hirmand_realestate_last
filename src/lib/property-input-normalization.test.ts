import assert from "node:assert/strict";
import test from "node:test";
import {
  isPropertyDescriptionValidForStatus,
  isMoneyText,
  nullableMoneyFieldSchema,
  normalizeMoneyInput,
  normalizeMoneyText,
  parseCustomerPropertyAreaM2,
} from "./property-input-normalization.ts";

test("property descriptions may be incomplete only while the record is a draft", () => {
  assert.equal(isPropertyDescriptionValidForStatus("draft", ""), true);
  assert.equal(isPropertyDescriptionValidForStatus("draft", "short"), true);
  assert.equal(isPropertyDescriptionValidForStatus("published", "short"), false);
  assert.equal(isPropertyDescriptionValidForStatus("archived", "123456789"), false);
  assert.equal(isPropertyDescriptionValidForStatus("archived", "1234567890"), true);
});

test("money normalization treats null-like values as null without changing real digits", () => {
  assert.equal(normalizeMoneyInput("null"), null);
  assert.equal(normalizeMoneyInput(" undefined "), null);
  assert.equal(normalizeMoneyText("۱۲۳٬۴۵۶"), "123456");
  assert.equal(normalizeMoneyText("1,234,567"), "1234567");
  assert.equal(normalizeMoneyText(""), "");
  assert.equal(isMoneyText("99999999999999999999"), true);
});

test("money schema owns the contract as string|null", () => {
  assert.equal(nullableMoneyFieldSchema.parse("null"), null);
  assert.equal(nullableMoneyFieldSchema.parse(""), null);
  assert.equal(nullableMoneyFieldSchema.parse("۱۲۳۴۵۶"), "123456");
  assert.equal(nullableMoneyFieldSchema.parse("99999999999999999999"), "99999999999999999999");
});

test("finite legacy numeric money payloads are normalized to strings", () => {
  assert.equal(nullableMoneyFieldSchema.parse(1500000000), "1500000000");
  assert.equal(nullableMoneyFieldSchema.parse(null), null);
});

test("malformed money and NaN are rejected instead of being silently nulled", () => {
  assert.throws(() => nullableMoneyFieldSchema.parse("12.5"), /Invalid|regex|expected/i);
  assert.throws(() => nullableMoneyFieldSchema.parse("NaN"), /Invalid|regex|expected/i);
  assert.throws(() => nullableMoneyFieldSchema.parse(NaN), /Invalid|expected/i);
});

test("integer input contract rejects malformed non-empty values", async () => {
  const { isInvalidIntegerInput, nullableIntegerInput } = await import("./property-input-normalization.ts");
  assert.equal(isInvalidIntegerInput("۱۲۳٬۴۵۶"), false);
  assert.equal(nullableIntegerInput("۱۲۳٬۴۵۶"), 123456);
  assert.equal(isInvalidIntegerInput(""), false);
  assert.equal(nullableIntegerInput(""), null);
  assert.equal(isInvalidIntegerInput("null"), false);
  assert.equal(nullableIntegerInput("null"), null);
  assert.equal(isInvalidIntegerInput("NaN"), true);
  assert.equal(isInvalidIntegerInput("12.5"), true);
  assert.equal(isInvalidIntegerInput("-2"), true);
  assert.equal(isInvalidIntegerInput("-2", true), false);
  assert.equal(isInvalidIntegerInput("٩٩٩"), false);
  assert.equal(nullableIntegerInput("٩٩٩"), 999);
  assert.equal(isInvalidIntegerInput("9007199254740992"), true);
  assert.equal(nullableIntegerInput("9007199254740992"), null);
});

test("customer property area matches the API positive-integer contract before submission", () => {
  assert.equal(parseCustomerPropertyAreaM2("120"), 120);
  assert.equal(parseCustomerPropertyAreaM2("120.5"), null);
  assert.equal(parseCustomerPropertyAreaM2("0"), null);
  assert.equal(parseCustomerPropertyAreaM2("-2"), null);
  assert.equal(parseCustomerPropertyAreaM2("100001"), null);
  assert.equal(parseCustomerPropertyAreaM2("123,456"), null);
  assert.equal(parseCustomerPropertyAreaM2("250"), 250);
});
