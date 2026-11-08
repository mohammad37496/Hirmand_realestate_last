import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const propertiesRoute = readFileSync(new URL("../src/routes/properties.index.tsx", import.meta.url), "utf8");
const notificationsRoute = readFileSync(new URL("../src/routes/notifications.tsx", import.meta.url), "utf8");

test("properties saved-search reads are side-effect-free and workspace sync refreshes the mounted state", () => {
  const reader = propertiesRoute.match(/function readSavedSearches\(\): SavedSearch\[\] \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.ok(reader, "saved-search reader should exist");
  assert.doesNotMatch(reader, /localStorage\.setItem|dispatchEvent/, "reading synced state must not echo a workspace-changed event");
  assert.match(propertiesRoute, /addEventListener\("hirmand:workspace-synced", onWorkspaceSynced\)/);
  assert.match(propertiesRoute, /removeEventListener\("hirmand:workspace-synced", onWorkspaceSynced\)/);
  assert.match(propertiesRoute, /setSavedSearchId\(\(current\) => storedSearches\.some\(\(item\) => item\.id === current\) \? current : ""\)/);
  assert.match(propertiesRoute, /savedSearchAlertRefreshGate\.current\.refresh\(signature/);
});

test("notifications sync refreshes saved-search matches without repeating the property-watch POST", () => {
  const refresh = notificationsRoute.match(/const refreshSavedSearchMatches = useCallback\(async \(force = false\) => \{([\s\S]*?)\n\s{2}\}, \[\]\);/)?.[1] ?? "";
  assert.ok(refresh, "saved-search-only refresh should exist");
  assert.doesNotMatch(refresh, /\/api\/property-watch|action:\s*["']sync["']/);
  assert.match(notificationsRoute, /addEventListener\("hirmand:workspace-synced", onWorkspaceSynced\)/);
  assert.match(notificationsRoute, /removeEventListener\("hirmand:workspace-synced", onWorkspaceSynced\)/);
  const listener = notificationsRoute.match(/const onWorkspaceSynced = \(\) => \{([\s\S]*?)\};/)?.[1] ?? "";
  assert.match(listener, /refreshSavedSearchMatches\(\)/);
  assert.doesNotMatch(listener, /\brefresh\(\)/, "workspace sync must not rerun watch alerts or latest-property feed");
  assert.match(notificationsRoute, /savedSearchRefreshGate\.current\.refresh\(signature/);
});
