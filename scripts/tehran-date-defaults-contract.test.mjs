import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const dateConsumers = [
  "src/routes/favorites.tsx",
  "src/components/hirmand/property-follow-up-reminder.tsx",
  "src/components/hirmand/property-negotiation-log.tsx",
  "src/components/hirmand/property-deal-room.tsx",
  "src/components/hirmand/property-viewing-request.tsx",
  "src/components/hirmand/property-callback-request.tsx",
  "src/components/hirmand/admin-finance-manager.tsx",
];

test("Iran calendar date defaults use the explicit Tehran date helper", async () => {
  for (const file of dateConsumers) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /getTehranDateOnly/, `${file} must use the Tehran calendar date`);
    assert.doesNotMatch(source, /toISOString\(\)\.slice\(0,\s*10\)/, `${file} must not derive a calendar date from UTC`);
  }

  const reminder = await readFile(new URL("../src/components/hirmand/property-follow-up-reminder.tsx", import.meta.url), "utf8");
  assert.match(reminder, /addDateOnlyDays\(getTehranDateOnly\(\),\s*1\)/, "the reminder default must be tomorrow in Tehran");
});
