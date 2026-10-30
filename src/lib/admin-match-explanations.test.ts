import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMatchWarnings, normalizeMatchLabel } from "./admin-match-explanations.ts";

test("Persian and Arabic neighborhood spelling variants normalize to the same label", () => {
  assert.equal(normalizeMatchLabel("  كوى  ياس "), normalizeMatchLabel("کوی یاس"));
});

test("matching explanations disclose concrete mismatches without treating unknown data as a mismatch", () => {
  assert.deepEqual(buildMatchWarnings({
    priceMatch: 20,
    amenityCoverage: 0,
    sameNeighborhood: false,
    requestedBedrooms: 3,
    propertyBedrooms: 1,
    floorPreference: "2",
    propertyFloor: 4,
    propertyFloorValid: true,
  }), [
    "قیمت با بودجه فاصله دارد",
    "امکانات درخواستی در این فایل ثبت یا تأیید نشده است",
    "محله فایل با محله درخواستی متفاوت است",
    "تعداد خواب با درخواست مشتری مطابقت ندارد",
    "طبقه فایل با درخواست مشتری متفاوت است",
  ]);
  assert.deepEqual(buildMatchWarnings({
    priceMatch: null,
    amenityCoverage: null,
    sameNeighborhood: null,
    requestedBedrooms: 2,
    propertyBedrooms: null,
    floorPreference: "",
    propertyFloor: null,
    propertyFloorValid: false,
  }), ["تعداد خواب فایل مشخص نشده است"]);
});
