import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("notification source query failures are visible and do not become an empty inbox", async () => {
  const server = await readFile(new URL("../src/lib/admin-notifications.ts", import.meta.url), "utf8");
  const helper = await readFile(new URL("../src/lib/admin-notification-candidates.ts", import.meta.url), "utf8");
  const component = await readFile(new URL("../src/components/hirmand/admin-notification-center.tsx", import.meta.url), "utf8");

  assert.match(server, /loadAdminNotificationCandidates\(sql\)/);
  assert.doesNotMatch(server, /follow_up_at is not null[\s\S]*?\.catch\(\(\) => \[\]/);
  assert.doesNotMatch(helper, /\.catch\(/);
  assert.match(helper, /jsonb_typeof\(images\)='array'/);
  assert.match(component, /setLoadError\(message\)/);
  assert.match(component, /role="alert"/);
  assert.match(component, /!loadError && !visible\.length/);
});
