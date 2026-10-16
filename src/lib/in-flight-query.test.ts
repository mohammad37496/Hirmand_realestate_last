import assert from "node:assert/strict";
import test from "node:test";
import { getOrCreateInFlight } from "./in-flight-query.ts";

test("concurrent identical queries share one promise and one request", async () => {
  const inFlight = new Map<string, Promise<{ rows: string[] }>>();
  let calls = 0;
  let resolveRequest!: (value: { rows: string[] }) => void;
  const create = () => {
    calls += 1;
    return new Promise<{ rows: string[] }>((resolve) => { resolveRequest = resolve; });
  };

  const first = getOrCreateInFlight(inFlight, "same-query", create);
  const second = getOrCreateInFlight(inFlight, "same-query", create);
  assert.equal(first, second);
  assert.equal(calls, 0, "request factory starts in the next microtask");
  await Promise.resolve();
  assert.equal(calls, 1);

  resolveRequest({ rows: ["controlled-result"] });
  assert.deepEqual(await first, { rows: ["controlled-result"] });
  assert.deepEqual(await second, { rows: ["controlled-result"] });
  await Promise.resolve();
  assert.equal(inFlight.has("same-query"), false);
});

test("different query keys do not share a request", async () => {
  const inFlight = new Map<string, Promise<number>>();
  let calls = 0;
  const create = async (value: number) => { calls += 1; return value; };
  const first = getOrCreateInFlight(inFlight, "filter-a", () => create(1));
  const second = getOrCreateInFlight(inFlight, "filter-b", () => create(2));
  assert.deepEqual(await Promise.all([first, second]), [1, 2]);
  assert.equal(calls, 2);
});

test("failed requests are removed so a later retry can proceed", async () => {
  const inFlight = new Map<string, Promise<string>>();
  let calls = 0;
  const first = getOrCreateInFlight(inFlight, "retryable", async () => {
    calls += 1;
    throw new Error("simulated network failure");
  });
  const second = getOrCreateInFlight(inFlight, "retryable", async () => {
    calls += 1;
    return "recovered";
  });
  assert.equal(first, second);
  await assert.rejects(first, /simulated network failure/);
  assert.equal(inFlight.has("retryable"), false);
  assert.equal(await getOrCreateInFlight(inFlight, "retryable", secondCreate), "recovered");
  assert.equal(calls, 2);

  async function secondCreate() {
    calls += 1;
    return "recovered";
  }
});
