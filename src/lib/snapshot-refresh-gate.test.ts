import assert from "node:assert/strict";
import test from "node:test";
import { createSnapshotRefreshGate } from "./snapshot-refresh-gate.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("identical in-flight snapshots share one load and one applied result", async () => {
  const gate = createSnapshotRefreshGate();
  const pending = deferred<string>();
  let loads = 0;
  const applied: string[] = [];
  const load = () => { loads += 1; return pending.promise; };
  const first = gate.refresh("same", load, (value) => applied.push(value));
  const second = gate.refresh("same", load, (value) => applied.push(value));

  assert.equal(loads, 1);
  pending.resolve("fresh");
  await Promise.all([first, second]);
  assert.deepEqual(applied, ["fresh"]);
});

test("a slower stale snapshot cannot overwrite a newer workspace snapshot", async () => {
  const gate = createSnapshotRefreshGate();
  const stale = deferred<string>();
  const fresh = deferred<string>();
  const applied: string[] = [];
  const staleRequest = gate.refresh("old", () => stale.promise, (value) => applied.push(value));
  const freshRequest = gate.refresh("new", () => fresh.promise, (value) => applied.push(value));

  fresh.resolve("new workspace");
  await freshRequest;
  stale.resolve("old workspace");
  await staleRequest;
  assert.deepEqual(applied, ["new workspace"]);
});

test("completed snapshots are skipped unless an explicit refresh is requested", async () => {
  const gate = createSnapshotRefreshGate();
  let loads = 0;
  const load = async () => { loads += 1; return loads; };
  await gate.refresh("same", load, () => {});
  await gate.refresh("same", load, () => {});
  await gate.refresh("same", load, () => {}, { force: true });
  assert.equal(loads, 2);
});
