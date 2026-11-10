import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SELECTED_NEIGHBORHOODS,
  normalizeNeighborhoodSelection,
  readNeighborhoodSelection,
  writeNeighborhoodSelection,
} from "./neighborhood-selection.ts";

test("repeated neighborhood values take precedence over a stale legacy alias", () => {
  const params = new URLSearchParams("neighborhoods=%D8%AC%D9%84%D9%81%D8%A7&neighborhoods=%D9%85%D8%B1%D8%AF%D8%A7%D9%88%DB%8C%D8%AC&neighborhood=%DA%A9%D8%A7%D8%B4%D8%A7%D9%86%DB%8C");
  assert.deepEqual(readNeighborhoodSelection(params), ["جلفا", "مرداویج"]);
});

test("legacy single-neighborhood URLs remain supported when no repeated values exist", () => {
  assert.deepEqual(readNeighborhoodSelection(new URLSearchParams("neighborhood=%D8%AC%D9%84%D9%81%D8%A7")), ["جلفا"]);
});

test("selection trims and de-duplicates Persian and Arabic spelling variants", () => {
  assert.deepEqual(normalizeNeighborhoodSelection([" جلفا ", "جِلفا", "کاشانی", "كاشانی", null]), ["جلفا", "کاشانی"]);
});

test("selection enforces the shared maximum", () => {
  const values = Array.from({ length: MAX_SELECTED_NEIGHBORHOODS + 2 }, (_, index) => `محله ${index}`);
  assert.equal(normalizeNeighborhoodSelection(values).length, MAX_SELECTED_NEIGHBORHOODS);
});

test("single selections keep the backward-compatible URL parameter", () => {
  const params = new URLSearchParams("neighborhoods=%D8%AC%D9%84%D9%81%D8%A7&map_place_hash=4%7Cold");
  assert.deepEqual(writeNeighborhoodSelection(params, ["جلفا"]), ["جلفا"]);
  assert.equal(params.get("neighborhood"), "جلفا");
  assert.equal(params.has("neighborhoods"), false);
  assert.equal(params.get("map_place_hash"), "4|old");
});

test("multiple selections use repeated URL values and discard a stale single-place hash", () => {
  const params = new URLSearchParams("neighborhood=%D8%AC%D9%84%D9%81%D8%A7&map_place_hash=4%7Cold");
  assert.deepEqual(writeNeighborhoodSelection(params, ["جلفا", "مرداویج"]), ["جلفا", "مرداویج"]);
  assert.equal(params.has("neighborhood"), false);
  assert.deepEqual(params.getAll("neighborhoods"), ["جلفا", "مرداویج"]);
  assert.equal(params.has("map_place_hash"), false);
});

test("clearing selection removes both URL forms and stale map-place state", () => {
  const params = new URLSearchParams("neighborhood=%D8%AC%D9%84%D9%81%D8%A7&neighborhoods=%D9%85%D8%B1%D8%AF%D8%A7%D9%88%DB%8C%D8%AC&map_place_hash=4%7Cold");
  assert.deepEqual(writeNeighborhoodSelection(params, []), []);
  assert.equal(params.has("neighborhood"), false);
  assert.equal(params.has("neighborhoods"), false);
  assert.equal(params.has("map_place_hash"), false);
});
