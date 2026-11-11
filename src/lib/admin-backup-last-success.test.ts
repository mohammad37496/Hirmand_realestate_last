import assert from "node:assert/strict";
import { test } from "node:test";
import { readLastSuccessfulBackupVerification, writeLastSuccessfulBackupVerification } from "./admin-backup-last-success.ts";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

test("persists and restores only a valid last-success timestamp", () => {
  const storage = createStorage();
  writeLastSuccessfulBackupVerification(storage, "2026-11-11T01:02:03.000Z");
  assert.equal(readLastSuccessfulBackupVerification(storage), "2026-11-11T01:02:03.000Z");
});

test("ignores malformed timestamps and unavailable browser storage", () => {
  assert.equal(readLastSuccessfulBackupVerification(createStorage({ "hirmand.admin-backup.last-success.v1": "not-json" })), null);
  assert.equal(readLastSuccessfulBackupVerification(null), null);
  const broken = { getItem: () => { throw new Error("storage blocked"); }, setItem: () => { throw new Error("storage blocked"); } };
  assert.equal(readLastSuccessfulBackupVerification(broken), null);
  assert.doesNotThrow(() => writeLastSuccessfulBackupVerification(broken, "2026-11-11T01:02:03.000Z"));
});

test("does not persist invalid dates", () => {
  const storage = createStorage();
  writeLastSuccessfulBackupVerification(storage, "not-a-date");
  assert.equal(readLastSuccessfulBackupVerification(storage), null);
});
