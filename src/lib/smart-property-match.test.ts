import assert from "node:assert/strict";
import test from "node:test";
import { parseSmartBudgetAmount, SMART_MATCH_WEIGHTS, smartMatchReasons, type SmartMatchPreferences } from "./smart-property-match.ts";
import type { PropertyCardData } from "./properties.ts";

test("guided budget input accepts Persian digits and million/billion units", () => {
  assert.equal(parseSmartBudgetAmount("۸ میلیارد تومان"), 8_000_000_000);
  assert.equal(parseSmartBudgetAmount("۵۰۰ میلیون"), 500_000_000);
  assert.equal(parseSmartBudgetAmount("۸٬۵۰۰٬۰۰۰٬۰۰۰"), 8_500_000_000);
  assert.equal(parseSmartBudgetAmount("۸٫۵ میلیارد"), 8_500_000_000);
  assert.equal(parseSmartBudgetAmount("-۸ میلیارد"), 0);
  assert.equal(parseSmartBudgetAmount("۸..۵ میلیارد"), 0);
  assert.equal(parseSmartBudgetAmount("نامعتبر"), 0);
});

test("guided match weights total 100 percent", () => {
  assert.equal(Object.values(SMART_MATCH_WEIGHTS).reduce((sum, weight) => sum + weight, 0), 100);
});

test("match explanations reflect only the user's selected criteria", () => {
  const property = {
    price: "8000000000",
    neighborhood: "مرداویج",
    areaM2: 125,
    bedrooms: 3,
    parking: true,
    elevator: true,
    storage: false,
  } as PropertyCardData;
  const preferences: SmartMatchPreferences = {
    maxPrice: 9_000_000_000,
    neighborhoods: ["مرداویج"],
    minArea: 100,
    maxArea: 150,
    minBedrooms: 2,
    amenities: ["parking", "elevator", "storage"],
  };
  assert.deepEqual(smartMatchReasons(property, preferences), [
    "بودجه در محدوده انتخابی",
    "محدوده مرداویج",
    "متراژ در بازه انتخابی",
    "تعداد خواب مطابق نیاز",
    "۲ از ۳ امکانات انتخابی",
  ]);
});

test("bedroom explanations distinguish exact counts from minimum counts", () => {
  const property = { bedrooms: 3 } as PropertyCardData;
  assert.deepEqual(smartMatchReasons(property, { neighborhoods: [], amenities: [], exactBedrooms: 2 }), ["تعداد خواب متفاوت از انتخاب شما"]);
  assert.deepEqual(smartMatchReasons(property, { neighborhoods: [], amenities: [], exactBedrooms: 3 }), ["تعداد خواب مطابق انتخاب شما"]);
  assert.deepEqual(smartMatchReasons(property, { neighborhoods: [], amenities: [], minBedrooms: 4 }), ["تعداد خواب کمتر از حداقل انتخابی"]);
  assert.deepEqual(smartMatchReasons({ bedrooms: null } as PropertyCardData, { neighborhoods: [], amenities: [], exactBedrooms: 0 }), ["تعداد خواب در آگهی ثبت نشده"]);
});
