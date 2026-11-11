import assert from "node:assert/strict";
import test from "node:test";
import { fetchPropertyViewingSlots } from "./property-viewing-availability.ts";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("viewing availability accepts a successful empty result as verified capacity", async () => {
  const occupiedTimes = await fetchPropertyViewingSlots("property/1", "2026-11-12", async (input, init) => {
    assert.equal(String(input), "/api/property-viewing-slots?propertyId=property%2F1&date=2026-11-12");
    assert.equal(init?.method, "GET");
    assert.equal(init?.credentials, "same-origin");
    return jsonResponse({ success: true, occupiedTimes: [], checkedAt: "2026-11-11T10:00:00.000Z" });
  });

  assert.deepEqual(occupiedTimes, []);
});

test("viewing availability keeps only string occupied slots from a successful response", async () => {
  const occupiedTimes = await fetchPropertyViewingSlots("property-1", "2026-11-12", async () =>
    jsonResponse({ success: true, occupiedTimes: ["10:00", 10, null, "11:30"] }),
  );

  assert.deepEqual(occupiedTimes, ["10:00", "11:30"]);
});

test("viewing availability rejects an HTTP error even when its body resembles a success", async () => {
  await assert.rejects(
    fetchPropertyViewingSlots("property-1", "2026-11-12", async () =>
      jsonResponse({ success: true, occupiedTimes: [] }, 500),
    ),
    /could not be verified/i,
  );
});

test("an unconfigured database response cannot verify an empty day as free capacity", async () => {
  await assert.rejects(
    fetchPropertyViewingSlots("property-1", "2026-11-12", async () =>
      jsonResponse({ success: false, message: "availability unavailable" }, 503),
    ),
    /could not be verified/i,
  );
});

test("viewing availability rejects an unsuccessful or malformed payload", async () => {
  await assert.rejects(
    fetchPropertyViewingSlots("property-1", "2026-11-12", async () =>
      jsonResponse({ success: false, message: "database unavailable" }),
    ),
    /could not be verified/i,
  );
  await assert.rejects(
    fetchPropertyViewingSlots("property-1", "2026-11-12", async () =>
      new Response("not json", { status: 200 }),
    ),
    /could not be verified/i,
  );
  await assert.rejects(
    fetchPropertyViewingSlots("property-1", "2026-11-12", async () =>
      jsonResponse({ success: true, occupiedTimes: "10:00" }),
    ),
    /could not be verified/i,
  );
});

test("viewing availability propagates network failures instead of treating them as an empty day", async () => {
  await assert.rejects(
    fetchPropertyViewingSlots("property-1", "2026-11-12", async () => {
      throw new TypeError("Failed to fetch");
    }),
    /Failed to fetch/,
  );
});
