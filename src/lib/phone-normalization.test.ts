import assert from "node:assert/strict";
import test from "node:test";
import { normalizeIranianPhoneForMatch, toIranianE164Phone, toIranianWhatsAppNumber } from "./phone-normalization";

test("Iranian phone normalization accepts national and international mobile formats", () => {
  assert.equal(normalizeIranianPhoneForMatch("۰۹۱۳ ۱۰۵ ۶۰۲۹"), "09131056029");
  assert.equal(toIranianE164Phone("۰۹۱۳ ۱۰۵ ۶۰۲۹"), "+989131056029");
  assert.equal(toIranianE164Phone("0098 913 105 6029"), "+989131056029");
  assert.equal(toIranianWhatsAppNumber("+98 (913) 105-6029"), "989131056029");
});

test("invalid and incomplete Iranian numbers do not become contact links", () => {
  assert.equal(toIranianE164Phone("0913105602"), null);
  assert.equal(toIranianE164Phone("00000000000"), null);
  assert.equal(toIranianWhatsAppNumber("00000000000"), null);
  assert.equal(toIranianWhatsAppNumber("not-a-phone"), null);
});

test("Iranian landline numbers remain valid E.164 contacts", () => {
  assert.equal(toIranianE164Phone("021 8877 6655"), "+982188776655");
});
