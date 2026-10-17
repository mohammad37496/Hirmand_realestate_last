import assert from "node:assert/strict";
import test from "node:test";
import { PROPERTY_FLOOR_OPTIONS } from "./property-options.ts";
import {
  compactSearchText,
  normalizeSearchText,
  parseIntegerFilter,
  validatePropertySearchNumbers,
} from "./property-search-utils.ts";

test("normalizes Persian, Arabic and English digits and grouping separators", () => {
  assert.equal(parseIntegerFilter("۱٬۲۳۴٬۵۶۷").value, 1234567);
  assert.equal(parseIntegerFilter("١،٢٣٤،٥٦٧").value, 1234567);
  assert.equal(parseIntegerFilter("1,234,567").value, 1234567);
  assert.equal(parseIntegerFilter(" ۱۲۳ ۴۵۶ ").value, 123456);
});

test("canonicalizes Persian/Arabic letter variants, diacritics and ZWNJ", () => {
  assert.equal(normalizeSearchText("كوى ولي‌عصر"), "کوی ولیعصر");
  assert.equal(normalizeSearchText("محلهٔ يزدآباد"), "محله یزدآباد");
  assert.equal(compactSearchText("شهرک ولی‌عصر"), compactSearchText("شهرک ولیعصر"));
  assert.equal(compactSearchText("خيابان آزادی"), compactSearchText("خیابان آزادی"));
});

test("integer parser distinguishes empty fields from malformed or unsafe values", () => {
  assert.deepEqual(parseIntegerFilter(""), { value: undefined, valid: true });
  assert.deepEqual(parseIntegerFilter(null), { value: undefined, valid: true });
  for (const raw of ["-1", "12.5", "12-15", "NaN", "Infinity", "۹۹۹۹۹۹۹۹۹۹۹۹۹۹۹۹۹۹۹۹"]) {
    assert.equal(parseIntegerFilter(raw).valid, false, raw);
  }
  assert.equal(parseIntegerFilter("100001", { max: 100000 }).valid, false);
  assert.equal(parseIntegerFilter("30", { max: 30 }).valid, true);
  assert.equal(parseIntegerFilter("-2", { min: -60, max: 200, allowNegative: true }).value, -2);
});

test("validates all supported listing numeric filters without dropping bad values", () => {
  assert.deepEqual(validatePropertySearchNumbers({
    minArea: "۸۰",
    maxArea: "۲۵۰",
    minPrice: "۱٬۲۰۰٬۰۰۰٬۰۰۰",
    maxPrice: "۲٬۰۰۰٬۰۰۰٬۰۰۰",
    minDeposit: "۵۰۰٬۰۰۰٬۰۰۰",
    maxDeposit: "۹۰۰٬۰۰۰٬۰۰۰",
    minRent: "۱۵٬۰۰۰٬۰۰۰",
    maxRent: "۲۵٬۰۰۰٬۰۰۰",
    minBedrooms: "۲",
    minBathrooms: "۱",
    minTotalFloors: "۱",
    maxTotalFloors: "۱۰",
    minBuiltYear: "۱۳۹۵",
    maxBuiltYear: "۱۴۰۵",
  }), []);
  assert.deepEqual(validatePropertySearchNumbers({
    minArea: "-5",
    maxPrice: "999999999999999999",
    minBedrooms: "۳٫۵",
    minRent: "NaN",
    minBuiltYear: "۱۴۰",
  }), ["حداقل متراژ", "حداکثر قیمت", "حداقل اجاره", "حداقل اتاق", "سال ساخت از"]);
  assert.deepEqual(validatePropertySearchNumbers({ minArea: "۱۲۰", maxArea: "۸۰" }), ["بازهٔ متراژ"]);
  assert.deepEqual(validatePropertySearchNumbers({ minFloor: "۵", maxFloor: "۲" }), ["بازهٔ طبقه"]);
});


test("floor options and public filters exclude unsupported floors", () => {
  const floors = PROPERTY_FLOOR_OPTIONS.map((item) => Number(item.value));
  for (let floor = -59; floor <= -1; floor += 1) {
    assert.equal(floors.includes(floor), false, `floor ${floor} should not be offered`);
  }
  for (let floor = 21; floor <= 200; floor += 1) {
    assert.equal(floors.includes(floor), false, `floor ${floor} should not be offered`);
    assert.deepEqual(validatePropertySearchNumbers({ minFloor: String(floor) }), ["طبقه از"]);
    assert.deepEqual(validatePropertySearchNumbers({ maxFloor: String(floor) }), ["طبقه تا"]);
  }
  assert.equal(floors.includes(-60), true);
  assert.equal(floors.includes(0), true);
  assert.equal(floors.includes(20), true);
  assert.equal(floors.includes(21), false);
  assert.deepEqual(validatePropertySearchNumbers({ minFloor: "-59" }), ["طبقه از"]);
  assert.deepEqual(validatePropertySearchNumbers({ maxFloor: "-1" }), ["طبقه تا"]);
  assert.deepEqual(validatePropertySearchNumbers({ minFloor: "-60", maxFloor: "0" }), []);
  assert.deepEqual(validatePropertySearchNumbers({ minFloor: "0", maxFloor: "20" }), []);
});
