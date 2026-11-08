import assert from "node:assert/strict";
import test from "node:test";
import { runWithTimeout } from "./run-with-timeout.mjs";

function trackTimers() {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const counts = { scheduled: 0, cleared: 0 };
  globalThis.setTimeout = (...args) => {
    counts.scheduled += 1;
    return originalSetTimeout(...args);
  };
  globalThis.clearTimeout = (handle) => {
    counts.cleared += 1;
    return originalClearTimeout(handle);
  };
  return {
    counts,
    restore() {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    },
  };
}

test("successful tasks release their timeout immediately", async () => {
  const timers = trackTimers();
  try {
    assert.equal(await runWithTimeout(async () => "migrated", 15_000, "migration timeout"), "migrated");
    assert.deepEqual(timers.counts, { scheduled: 1, cleared: 1 });
  } finally {
    timers.restore();
  }
});

test("rejected tasks release their timeout", async () => {
  const timers = trackTimers();
  try {
    await assert.rejects(runWithTimeout(async () => { throw new Error("database failed"); }, 15_000), /database failed/);
    assert.deepEqual(timers.counts, { scheduled: 1, cleared: 1 });
  } finally {
    timers.restore();
  }
});

test("timed-out tasks reject and release the fired timer", async () => {
  const timers = trackTimers();
  try {
    await assert.rejects(runWithTimeout(() => new Promise(() => {}), 5, "migration timeout"), /migration timeout/);
    assert.deepEqual(timers.counts, { scheduled: 1, cleared: 1 });
  } finally {
    timers.restore();
  }
});
