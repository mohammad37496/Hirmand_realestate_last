import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  calculateBuy,
  calculateRent,
  commissionRateStatus,
  DEFAULT_COMMISSION_RATES,
  normalizeCommissionRates,
  resultSummary,
} from "./commission.ts";

test("sale commission uses the configured total rate and VAT, then splits between parties", () => {
  const result = calculateBuy(1_000_000_000);
  assert.ok(result);
  assert.equal(result.base, 5_000_000);
  assert.equal(result.vat, 500_000);
  assert.equal(result.total, 5_500_000);
  assert.equal(result.each, 2_750_000);

  const custom = calculateBuy(1_000_000_000, { ...DEFAULT_COMMISSION_RATES, saleTotalPercent: 1, vatPercent: 0 });
  assert.ok(custom);
  assert.equal(custom.base, 10_000_000);
  assert.equal(custom.total, 10_000_000);
});

test("rent commission applies each party's monthly-rent and deposit rates independently", () => {
  const result = calculateRent(10_000_000, 1_000_000_000);
  assert.ok(result);
  assert.equal(result.rentFromDeposit, 20_000_000);
  assert.equal(result.monthlyEq, 30_000_000);
  assert.equal(result.base, 15_000_000);
  assert.equal(result.vat, 1_500_000);
  assert.equal(result.total, 16_500_000);
  assert.equal(result.each, 8_250_000);

  const custom = calculateRent(10_000_000, 1_000_000_000, {
    ...DEFAULT_COMMISSION_RATES,
    rentDepositPercent: 0.25,
    rentMonthlyPercent: 10,
    vatPercent: 0,
  });
  assert.ok(custom);
  assert.equal(custom.base, 7_000_000);
});

test("commission calculators reject negative, non-finite and unreasonable amounts", () => {
  assert.equal(calculateBuy(0), null);
  assert.equal(calculateBuy(-1), null);
  assert.equal(calculateBuy(Number.NaN), null);
  assert.equal(calculateBuy(1_000_000_000_000_001), null);
  assert.equal(calculateRent(-1, 1_000_000), null);
  assert.equal(calculateRent(1_000_000, Number.POSITIVE_INFINITY), null);
  assert.equal(calculateRent(0, 0), null);
});

test("rate normalization fails closed for unsafe sources, invalid dates and out-of-range percentages", () => {
  const rates = normalizeCommissionRates({
    ...DEFAULT_COMMISSION_RATES,
    saleTotalPercent: 999,
    rentMonthlyPercent: -10,
    sourceLabel: "مرجع نامعتبر",
    sourceUrl: "javascript:alert(1)",
    effectiveFrom: "2026-02-31",
    effectiveTo: "2025-01-01",
    verified: true,
  });
  assert.equal(rates.saleTotalPercent, DEFAULT_COMMISSION_RATES.saleTotalPercent);
  assert.equal(rates.rentMonthlyPercent, DEFAULT_COMMISSION_RATES.rentMonthlyPercent);
  assert.equal(rates.sourceUrl, "");
  assert.equal(rates.effectiveFrom, "");
  assert.equal(rates.verified, false);
});

test("rate verification depends on a secure source and its effective date range in Tehran time", () => {
  const now = new Date("2026-11-09T12:00:00.000Z");
  const valid = normalizeCommissionRates({
    ...DEFAULT_COMMISSION_RATES,
    sourceLabel: "نرخ‌نامه آزمایشی",
    sourceUrl: "https://example.org/rates",
    effectiveFrom: "2026-11-01",
    effectiveTo: "2026-11-30",
    verified: true,
  });
  assert.equal(commissionRateStatus(valid, now), "verified");

  const upcoming = normalizeCommissionRates({ ...valid, effectiveFrom: "2026-11-10" });
  assert.equal(commissionRateStatus(upcoming, now), "upcoming");

  const expired = normalizeCommissionRates({ ...valid, effectiveTo: "2026-11-08" });
  assert.equal(commissionRateStatus(expired, now), "expired");
});

test("copied commission summaries carry the verification status and source instead of implying an official rate", () => {
  const estimate = calculateBuy(1_000_000_000);
  assert.ok(estimate);
  assert.match(resultSummary(estimate), /تأییدنشده و صرفاً برآورد/);

  const verifiedRates = normalizeCommissionRates({
    ...DEFAULT_COMMISSION_RATES,
    sourceLabel: "نرخ‌نامه آزمایشی",
    sourceUrl: "https://example.org/rates",
    effectiveFrom: "2026-01-01",
    verified: true,
  });
  const verified = calculateBuy(1_000_000_000, verifiedRates);
  assert.ok(verified);
  assert.match(resultSummary(verified), /https:\/\/example\.org\/rates/);
  assert.match(resultSummary(verified), /تأییدشده توسط مدیریت/);
});

test("commission-rate migration adds unverified defaults rather than claiming an official tariff", async () => {
  const db = new PGlite();
  try {
    await db.exec("create table site_settings (id integer primary key);");
    const migration = readFileSync(new URL("../../migrations/0102_commission_rate_config.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.exec("insert into site_settings (id) values (1);");
    const result = await db.query<{ commission_rates: Record<string, unknown> }>("select commission_rates from site_settings where id = 1");
    const rates = result.rows[0]?.commission_rates;
    assert.equal(rates.city, "اصفهان");
    assert.equal(rates.verified, false);
    assert.equal(rates.sourceUrl, "");
    assert.equal(rates.saleTotalPercent, 0.5);
  } finally {
    await db.close();
  }
});
