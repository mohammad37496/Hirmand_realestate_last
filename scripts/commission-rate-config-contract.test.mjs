import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { pendingMigrations } from "./migration-plan.mjs";

const settings = readFileSync(new URL("../src/lib/site-settings.ts", import.meta.url), "utf8");
const admin = readFileSync(new URL("../src/components/hirmand/admin-site-settings.tsx", import.meta.url), "utf8");
const calculator = readFileSync(new URL("../src/components/hirmand/commission-calculator.tsx", import.meta.url), "utf8");
const propertyTools = readFileSync(new URL("../src/components/hirmand/property-decision-tools.tsx", import.meta.url), "utf8");
const commissionRoute = readFileSync(new URL("../src/routes/tools/commission.tsx", import.meta.url), "utf8");
const propertyRoute = readFileSync(new URL("../src/routes/properties.$slug.tsx", import.meta.url), "utf8");
const homeRoute = readFileSync(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../migrations/0102_commission_rate_config.sql", import.meta.url), "utf8");
const browserSmoke = readFileSync(new URL("./browser-smoke.mjs", import.meta.url), "utf8");

test("commission rates are persisted in admin-controlled settings with source and validity metadata", () => {
  assert.match(settings, /commissionRatesSchema/);
  assert.match(settings, /settings\.manage/);
  assert.match(settings, /sourceUrl: z\.string\(\)/);
  assert.match(settings, /effectiveFrom/);
  assert.match(settings, /effectiveTo/);
  assert.match(settings, /commission_rates = excluded\.commission_rates/);
  assert.match(migration, /commission_rates jsonb NOT NULL/);
  assert.match(migration, /"verified":false/);
  assert.ok(pendingMigrations(["0101_auth_rate_limit.sql", "0102_commission_rate_config.sql"], ["0101_auth_rate_limit.sql"])
    .some(({ name }) => name === "0102_commission_rate_config.sql"), "the Liara and PGlite migration planners must discover 0102");
});

test("admin rate edits revoke prior verification and require explicit confirmation", () => {
  assert.match(admin, /updateCommissionRateConfig\(current\.commissionRates, key, value\)/);
  assert.match(admin, /تأیید مدیریتی منبع و بازه اعتبار نرخ‌ها/);
  assert.match(admin, /با تغییر هر نرخ یا منبع، تأیید قبلی به‌صورت خودکار لغو می‌شود/);
  assert.match(admin, /تأیید داخلی مدیریت است و به معنی تأیید رسمی یا قانونی تعرفه نیست/);
  assert.match(admin, /commissionRates: form\.commissionRates/);
});

test("public calculator and property decision tools use the same configured rate snapshot", () => {
  assert.match(calculator, /calculateBuy\(parseAmount\(price\), rates\)/);
  assert.match(calculator, /calculateRent\(parseAmount\(rent\), parseAmount\(deposit\), rates\)/);
  assert.match(calculator, /commissionRateStatus\(rates\)/);
  assert.match(propertyTools, /calculateBuy\(propertyPrice, commissionRates\)/);
  assert.match(propertyTools, /commissionRateStatus\(commissionRates\)/);
  assert.match(commissionRoute, /commissionRates: settings\.commissionRates/);
  assert.match(propertyRoute, /commissionRates: settings\.commissionRates/);
  assert.match(homeRoute, /commissionRates=\{settings\.commissionRates\}/);
  assert.match(calculator, /COMMISSION_LEGAL_BASIS_NOTICE/);
  assert.match(calculator, /برآورد کمیسیون/);
  assert.match(admin, /جایگزین ضریب ارزش معاملاتی و سقف مصوب شهرستان/);
  assert.match(propertyTools, /COMMISSION_LEGAL_BASIS_NOTICE/);
  assert.match(propertyTools, /سهم برآوردی کمیسیون خریدار/);
});

test("browser smoke checks the legal-basis notice and responsive commission estimate", () => {
  assert.match(browserSmoke, /commissionCheck/);
  assert.match(browserSmoke, /\.commission-legal-basis-note/);
  assert.match(browserSmoke, /getByLabel\("مبلغ معامله \(تومان\)"\)/);
  assert.match(browserSmoke, /widths: \[390, 768, 1280\]/);
});
