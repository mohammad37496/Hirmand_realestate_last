import assert from "node:assert/strict";
import { test } from "node:test";
import { LatestRequestSequence } from "./latest-request-sequence.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("lead A responses cannot overwrite lead B when requests resolve out of order", async () => {
  const sequence = new LatestRequestSequence();
  const applied: Array<{ leadId: string; value: string }> = [];
  const request = (leadId: string, response: Promise<string>) => {
    const requestId = sequence.next();
    return response.then((value) => {
      if (sequence.isCurrent(requestId)) applied.push({ leadId, value });
    });
  };

  const responseA = deferred<string>();
  const responseB = deferred<string>();
  const pendingA = request("lead-A", responseA.promise);
  const pendingB = request("lead-B", responseB.promise);

  responseA.resolve("property-A");
  await pendingA;
  assert.deepEqual(applied, []);

  responseB.resolve("property-B");
  await pendingB;
  assert.deepEqual(applied, [{ leadId: "lead-B", value: "property-B" }]);
});

test("A to B to A selection creates a new generation and invalidates the first A", async () => {
  const sequence = new LatestRequestSequence();
  const applied: string[] = [];
  const responseA1 = deferred<string>();
  const responseB = deferred<string>();
  const responseA2 = deferred<string>();

  const start = (leadId: string, response: Promise<string>) => {
    const requestId = sequence.next();
    return response.then((value) => {
      if (sequence.isCurrent(requestId)) applied.push(`${leadId}:${value}`);
    });
  };

  const pendingA1 = start("lead-A", responseA1.promise);
  const pendingB = start("lead-B", responseB.promise);
  const pendingA2 = start("lead-A", responseA2.promise);

  responseA1.resolve("old");
  responseB.resolve("middle");
  await Promise.all([pendingA1, pendingB]);
  assert.deepEqual(applied, []);

  responseA2.resolve("new");
  await pendingA2;
  assert.deepEqual(applied, ["lead-A:new"]);
});

test("cleanup invalidates only its own generation and cannot cancel a newer request", () => {
  const sequence = new LatestRequestSequence();
  const oldRequest = sequence.next();
  const newRequest = sequence.next();

  sequence.invalidate(oldRequest);

  assert.equal(sequence.isCurrent(newRequest), true);
  sequence.invalidate(newRequest);
  assert.equal(sequence.isCurrent(newRequest), false);
});
