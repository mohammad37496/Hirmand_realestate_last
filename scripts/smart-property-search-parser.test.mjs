import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { parsePersianNumberToken } from "../src/lib/smart-property-search-core.mjs";

const parserSource = readFileSync(new URL("../src/lib/smart-property-search.ts", import.meta.url), "utf8");
const runtimeParserSource = parserSource
  .replace(
    'import { NEIGHBORHOOD_NAMES, PROPERTY_TYPES } from "@/lib/site";',
    'const NEIGHBORHOOD_NAMES = ["مرداویج"]; const PROPERTY_TYPES = [{ id: "apartment", title: "آپارتمان" }, { id: "villa", title: "ویلا" }];',
  )
  .replace(
    'from "@/lib/smart-property-search-core.mjs"',
    `from "${new URL("../src/lib/smart-property-search-core.mjs", import.meta.url).href}"`,
  );
const compiledParser = ts.transpileModule(runtimeParserSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { parseSmartPropertySearch } = await import(`data:text/javascript;base64,${Buffer.from(compiledParser).toString("base64")}`);

test("natural-language bedroom counts accept Persian number words and Persian/Arabic digits", () => {
  assert.equal(parsePersianNumberToken("دو"), 2);
  assert.equal(parsePersianNumberToken("چهار"), 4);
  assert.equal(parsePersianNumberToken("۳"), 3);
  assert.equal(parsePersianNumberToken("٣"), 3);
  assert.equal(parsePersianNumberToken("نامشخص"), null);
  assert.match(parserSource, /\(\\d\+\|یک\|یه\|دو\|سه\|چهار/);
});

test("bare area examples become exact min/max filters instead of being ignored", () => {
  assert.match(parserSource, /const exactArea = captureNumber/);
  assert.match(parserSource, /filters\.minArea = Math\.max\(0, Math\.floor\(exactArea\)\)/);
  assert.match(parserSource, /filters\.maxArea = Math\.max\(0, Math\.floor\(exactArea\)\)/);
  const parsed = parseSmartPropertySearch("خانه ۱۸۰ متری تا ۱۵ میلیارد");
  assert.equal(parsed.filters.minArea, 180);
  assert.equal(parsed.filters.maxArea, 180);
  assert.equal(parsed.filters.maxPrice, 15_000_000_000);
});

test("unrecognized natural-language input falls back to a bounded real text search", () => {
  assert.match(parserSource, /filters\.search = original\.slice\(0, 80\)/);
  assert.match(parserSource, /summary\.push\("جستجوی متنی"\)/);
  assert.match(parserSource, /summary\.push\("دارای موقعیت مکانی"\)/);
  assert.equal(parseSmartPropertySearch("نزدیک پارک صفه").filters.search, "نزدیک پارک صفه");
});

test("mixed structured and free-text queries preserve the unrecognized place phrase", () => {
  const apartment = parseSmartPropertySearch("آپارتمان نزدیک پارک صفه");
  assert.equal(apartment.filters.propertyType, "apartment");
  assert.equal(apartment.filters.search, "پارک صفه");
  assert.ok(apartment.summary.includes("عبارت متنی: پارک صفه"));

  const neighborhood = parseSmartPropertySearch("آپارتمان در مرداویج نزدیک پارک صفه");
  assert.equal(neighborhood.filters.neighborhood, "مرداویج");
  assert.equal(neighborhood.filters.search, "پارک صفه");

  const area = parseSmartPropertySearch("آپارتمان ۹۰ متری نزدیک پارک صفه");
  assert.equal(area.filters.minArea, 90);
  assert.equal(area.filters.maxArea, 90);
  assert.equal(area.filters.search, "پارک صفه");

  const budget = parseSmartPropertySearch("آپارتمان بودجه ۸ میلیارد نزدیک پارک صفه");
  assert.equal(budget.filters.maxPrice, 8_000_000_000);
  assert.equal(budget.filters.search, "پارک صفه");
});

test("fully recognized structured queries do not add a redundant text filter", () => {
  const parsed = parseSmartPropertySearch("آپارتمان دو خوابه تا ۸ میلیارد در مرداویج با آسانسور و پارکینگ");
  assert.equal(parsed.filters.search, undefined);
});

test("property-type words are not misread as transaction verbs", () => {
  const parsed = parseSmartPropertySearch("فروشگاه تجاری در مرداویج");
  assert.equal(parsed.filters.propertyType, "commercial");
  assert.equal(parsed.filters.transactionType, undefined);
});

test("the four advertised smart-search examples apply their stated bedroom, area and budget constraints", () => {
  const first = parseSmartPropertySearch("آپارتمان دو خوابه تا ۸ میلیارد در مرداویج با آسانسور و پارکینگ");
  assert.equal(first.filters.minBedrooms, 2);
  assert.equal(first.filters.maxPrice, 8_000_000_000);
  assert.equal(first.filters.neighborhood, "مرداویج");
  assert.equal(first.filters.elevatorOnly, true);
  assert.equal(first.filters.parkingOnly, true);

  const second = parseSmartPropertySearch("خانه ۱۸۰ متری تا ۱۵ میلیارد");
  assert.equal(second.filters.minArea, 180);
  assert.equal(second.filters.maxArea, 180);

  const third = parseSmartPropertySearch("آپارتمان ۳ خواب تا ۱۰ میلیارد در مرداویج");
  assert.equal(third.filters.minBedrooms, 3);
  assert.equal(third.filters.maxPrice, 10_000_000_000);

  const fourth = parseSmartPropertySearch("اجاره آپارتمان چهار خوابه تا ۲۰ میلیون");
  assert.equal(fourth.filters.minBedrooms, 4);
  assert.equal(fourth.filters.maxPrice, 20_000_000);
});
