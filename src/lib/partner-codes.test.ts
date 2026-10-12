import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isValidTrackingCode,
  normalizeDigits,
  normalizePartnerCode,
  normalizeTrackingCode,
} from "./partner-codes.ts";

test("normalizes Persian and Arabic digits", () => {
  assert.equal(normalizeDigits("۱۲۳٤"), "1234");
});

test("normalizes partner codes and removes invisible spacing", () => {
  assert.equal(normalizePartnerCode(" hr-۱۲۳۴۵۶ "), "HR-123456");
  assert.equal(normalizePartnerCode("HR-12‌34"), "HR-1234");
});

test("normalizes tracking-code punctuation and digits", () => {
  assert.equal(normalizeTrackingCode(" hir-۲۶-ABCD۱۲۳۴ "), "HIR-26-ABCD1234");
  assert.equal(normalizeTrackingCode("HIR-26—ABCD1234"), "HIR-26-ABCD1234");
});

test("validates only the canonical tracking-code shape", () => {
  assert.equal(isValidTrackingCode("HIR-26-ABCD1234"), true);
  assert.equal(isValidTrackingCode(" hir-۲۶-abcd۱۲۳۴ "), true);
  assert.equal(isValidTrackingCode("HIR-26-ABC123"), false);
  assert.equal(isValidTrackingCode("HR-26-ABCD1234"), false);
  assert.equal(isValidTrackingCode("https://example.com/HIR-26-ABCD1234"), false);
});
