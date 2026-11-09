import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parsePersianNumberToken } from "../src/lib/smart-property-search-core.mjs";

const parser = readFileSync(new URL("../src/lib/smart-property-search.ts", import.meta.url), "utf8");

test("natural-language bedroom counts accept Persian number words and Persian/Arabic digits", () => {
  assert.equal(parsePersianNumberToken("دو"), 2);
  assert.equal(parsePersianNumberToken("چهار"), 4);
  assert.equal(parsePersianNumberToken("۳"), 3);
  assert.equal(parsePersianNumberToken("٣"), 3);
  assert.equal(parsePersianNumberToken("نامشخص"), null);
  assert.match(parser, /\(\\d\+\|یک\|یه\|دو\|سه\|چهار/);
});

test("bare area examples become exact min/max filters instead of being ignored", () => {
  assert.match(parser, /const exactArea = captureNumber/);
  assert.match(parser, /filters\.minArea = Math\.max\(0, Math\.floor\(exactArea\)\)/);
  assert.match(parser, /filters\.maxArea = Math\.max\(0, Math\.floor\(exactArea\)\)/);
});

test("unrecognized natural-language input falls back to a bounded real text search", () => {
  assert.match(parser, /filters\.search = original\.slice\(0, 80\)/);
  assert.match(parser, /summary\.push\("جستجوی متنی"\)/);
  assert.match(parser, /summary\.push\("دارای موقعیت مکانی"\)/);
});
