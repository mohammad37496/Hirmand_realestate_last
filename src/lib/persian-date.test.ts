import assert from "node:assert/strict";
import { test } from "node:test";
import { addDateOnlyDays, getTehranDateOnly } from "./persian-date.ts";

test("Tehran date changes at Tehran midnight, independent of the host timezone", () => {
  assert.equal(getTehranDateOnly(new Date("2026-11-10T20:29:59.999Z")), "2026-11-10");
  assert.equal(getTehranDateOnly(new Date("2026-11-10T20:30:00.000Z")), "2026-11-11");
});

test("date-only day arithmetic follows the calendar across month and year boundaries", () => {
  assert.equal(addDateOnlyDays("2026-11-11", 1), "2026-11-12");
  assert.equal(addDateOnlyDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDateOnlyDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDateOnlyDays("2028-03-01", -1), "2028-02-29");
});

test("date-only day arithmetic rejects malformed dates and non-integer offsets", () => {
  assert.equal(addDateOnlyDays("2026-02-31", 1), "");
  assert.equal(addDateOnlyDays("2026-11-11", 0.5), "");
  assert.equal(addDateOnlyDays("not-a-date", 1), "");
});
