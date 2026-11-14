import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("notification source query failures are visible and do not become an empty inbox", async () => {
  const server = await readFile(new URL("../src/lib/admin-notifications.ts", import.meta.url), "utf8");
  const helper = await readFile(new URL("../src/lib/admin-notification-candidates.ts", import.meta.url), "utf8");
  const sync = await readFile(new URL("../src/lib/admin-notification-sync.ts", import.meta.url), "utf8");
  const store = await readFile(new URL("../src/lib/admin-notification-store.ts", import.meta.url), "utf8");
  const access = await readFile(new URL("../src/lib/admin-notification-access.ts", import.meta.url), "utf8");
  const component = await readFile(new URL("../src/components/hirmand/admin-notification-center.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/components/hirmand/admin-shell-css.ts", import.meta.url), "utf8");

  assert.match(server, /syncAdminNotificationCandidates\(sql,\s*admin\.permissions\)/);
  assert.match(server, /getAdminNotificationPermissions\(role\)/);
  assert.match(sync, /loadAdminNotificationCandidates\(sql, permissions\)/);
  assert.match(sync, /on conflict\(source_key\) do update/);
  assert.doesNotMatch(helper, /\.catch\(/);
  assert.match(helper, /jsonb_typeof\(images\)='array'/);
  assert.match(helper, /notification:property-publication/);
  assert.match(helper, /notification:deal-document/);
  assert.match(helper, /notification:divar-sync/);
  assert.match(helper, /notification:backup-health/);
  assert.match(store, /admin_notification_reads/);
  assert.match(store, /required_permission=any\(\$2::text\[\]\)/);
  assert.match(store, /dismissed_at/);
  assert.match(access, /hasAdminPermission\(role, permission\)/);
  assert.match(component, /setLoadError\(error instanceof Error/);
  assert.match(component, /role="alert"/);
  assert.match(component, /30_000/);
  assert.match(component, /visibilitychange/);
  assert.match(component, /window\.addEventListener\("focus"/);
  assert.match(component, /mutationVersion\.current/);
  assert.match(component, /dismissAdminNotification\(/);
  assert.match(component, /!loading && !loadError && !visible\.length/);
  assert.match(styles, /admin-notification-row-actions \.btn-ghost\{min-height:44px\}/);
  assert.match(styles, /admin-notification-dismiss\{width:44px;height:44px\}/);
});
