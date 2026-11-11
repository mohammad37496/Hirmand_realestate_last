import assert from "node:assert/strict";
import { test } from "node:test";
import { compareDecimalStrings, formatDecimalMoney } from "./decimal-money.ts";
import { toExactPublicOfferAmount } from "./public-lead-tracking-money.ts";

test("preserves numeric(20,0) public offer amounts beyond Number.MAX_SAFE_INTEGER", () => {
  const amount = toExactPublicOfferAmount("90071992547409931234");
  assert.equal(amount, "90071992547409931234");
  assert.equal(compareDecimalStrings(amount, "0"), 1);
  assert.equal(formatDecimalMoney(amount), "۹۰٬۰۷۱٬۹۹۲٬۵۴۷٬۴۰۹٬۹۳۱٬۲۳۴");
});

test("preserves null and rejects malformed database amount values", () => {
  assert.equal(toExactPublicOfferAmount(null), null);
  assert.equal(toExactPublicOfferAmount(undefined), null);
  assert.equal(toExactPublicOfferAmount("1,000"), null);
  assert.equal(toExactPublicOfferAmount(""), null);
});
