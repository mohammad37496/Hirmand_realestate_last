import test from "node:test";
import assert from "node:assert/strict";
import { getPublishReadiness } from "./property-publish-readiness.ts";

const base = {
  transactionType: "sell" as const,
  title: "آپارتمان نوساز ۱۲۰ متری چهارباغ",
  neighborhood: "چهارباغ بالا",
  description: "این فایل با توضیحات کامل برای معرفی ملک و هماهنگی بازدید در اختیار مشتریان قرار گرفته است و مشخصات اصلی آن درج شده.",
  contactName: "آقای شیخ",
  contactPhone: "09131056029",
  price: "3800000000",
  deposit: "",
  rent: "",
  imageCount: 4,
  areaM2: "120",
  features: "پارکینگ\nآسانسور",
  latitude: 32.65,
  longitude: 51.67,
};

test("publish readiness accepts a complete sell listing", () => {
  const result = getPublishReadiness(base);
  assert.equal(result.ready, true);
  assert.equal(result.blockers.length, 0);
});

test("publish readiness blocks an incomplete listing", () => {
  const result = getPublishReadiness({
    ...base,
    title: "ملک",
    neighborhood: "",
    description: "کوتاه",
    contactName: "",
    contactPhone: "",
    price: "",
  });
  assert.equal(result.ready, false);
  assert.ok(result.blockers.length >= 5);
});

test("publish readiness warns about optional quality fields without blocking", () => {
  const result = getPublishReadiness({
    ...base,
    imageCount: 0,
    areaM2: "",
    features: "",
    latitude: null,
    longitude: null,
  });
  assert.equal(result.ready, true);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.warnings.length, 4);
});

test("buy requests do not require a sale price", () => {
  const result = getPublishReadiness({
    ...base,
    transactionType: "buy",
    price: "",
  });
  assert.equal(result.ready, true);
});
