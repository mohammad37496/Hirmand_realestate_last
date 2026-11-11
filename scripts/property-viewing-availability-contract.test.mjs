import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(
  new URL("../src/components/hirmand/property-viewing-request.tsx", import.meta.url),
  "utf8",
);
const endpoint = await readFile(
  new URL("../server/routes/api/property-viewing-slots.get.ts", import.meta.url),
  "utf8",
);

test("viewing request shows an error and blocks submission until availability is verified", () => {
  const timeLabelIndex = component.indexOf('<label htmlFor="property-viewing-time">');
  const timeFieldStart = component.lastIndexOf('<div className="field">', timeLabelIndex);
  const timeFieldEnd = component.indexOf('<label className="field property-viewing-note">', timeLabelIndex);
  assert.ok(timeFieldStart >= 0 && timeFieldEnd > timeFieldStart);
  const timeField = component.slice(timeFieldStart, timeFieldEnd);
  assert.match(component, /const \[verifiedSlotsKey, setVerifiedSlotsKey\] = useState\(""\)/);
  assert.match(component, /const slotsVerified = verifiedSlotsKey === property\.id \+ ":" \+ date/);
  assert.match(component, /const \[slotsError, setSlotsError\] = useState\(""\)/);
  assert.match(component, /disabled=\{loadingSlots \|\| !slotsVerified\}/);
  assert.match(component, /disabled=\{busy \|\| loadingSlots \|\| !slotsVerified \|\| !time\}/);
  assert.match(component, /role=\{slotsError \? "alert" : undefined\}/);
  assert.match(component, /setSlotsRetry\(\(value\) => value \+ 1\)/);
  assert.match(component, /if \(!slotsVerified \|\| loadingSlots\)/);
  assert.match(timeField, /<label htmlFor="property-viewing-time">/);
  assert.match(timeField, /property-viewing-retry/);
  assert.doesNotMatch(timeField, /<label className="field">/);
  assert.doesNotMatch(component, /catch\(\(\) => \{\s*if \(!cancelled\) setOccupiedTimes\(\[\]\);\s*\}\)/);
});

test("viewing slots endpoint returns 503 instead of claiming every slot is free when the database is unconfigured", () => {
  assert.match(endpoint, /if \(dbSource === "unconfigured"\)\s*\{\s*throw createError\(\{ statusCode: 503/);
  assert.doesNotMatch(endpoint, /dbSource === "unconfigured"[^\n]*return \{ success: true, occupiedTimes: \[\]/);
});
