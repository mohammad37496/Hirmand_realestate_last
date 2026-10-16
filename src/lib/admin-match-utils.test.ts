import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMatchLabel, scoreAreaMatch } from "./admin-match-utils.ts";

test("area matching rewards listings inside closed ranges", () => {
  assert.deepEqual(scoreAreaMatch(105, 90, 120), {
    score: 100,
    reason: "متراژ داخل بازهٔ درخواستی",
    withinRange: true,
  });
});

test("area matching supports one-sided lower and upper bounds", () => {
  assert.equal(scoreAreaMatch(120, 100, null)?.withinRange, true);
  assert.equal(scoreAreaMatch(90, 100, null)?.withinRange, false);
  assert.equal(scoreAreaMatch(90, null, 100)?.withinRange, true);
  assert.equal(scoreAreaMatch(120, null, 100)?.withinRange, false);
});

test("area matching treats absent preferences and missing area as neutral", () => {
  assert.equal(scoreAreaMatch(105, null, null), null);
  assert.equal(scoreAreaMatch(null, 90, 120), null);
  assert.equal(scoreAreaMatch(0, 90, 120), null);
});

test("area matching refuses inverted bounds and explains distant mismatches", () => {
  assert.equal(scoreAreaMatch(105, 120, 90), null);
  const match = scoreAreaMatch(50, 100, 120);
  assert.equal(match?.withinRange, false);
  assert.equal(match?.score, 0);
  assert.equal(match?.reason, "متراژ خارج از بازهٔ درخواستی");
});

test("Persian neighborhood labels normalize Arabic letters and spacing", () => {
  assert.equal(normalizeMatchLabel("  كوى  ياس "), normalizeMatchLabel("کوی یاس"));
});
