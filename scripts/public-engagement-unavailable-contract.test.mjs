import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const routes = {
  openHouse: read("server/routes/api/property-open-house.post.ts"),
  questions: read("server/routes/api/property-questions.post.ts"),
  reports: read("server/routes/api/property-reports.post.ts"),
  watch: read("server/routes/api/property-watch.post.ts"),
  watchTarget: read("server/routes/api/property-watch-target.post.ts"),
  musicAdmin: read("server/routes/api/music-admin.post.ts"),
  viewingSlots: read("server/routes/api/property-viewing-slots.get.ts"),
};

const components = {
  openHouse: read("src/components/hirmand/property-open-house.tsx"),
  questions: read("src/components/hirmand/property-questions.tsx"),
  adminFeatures: read("src/components/hirmand/admin-property-features.tsx"),
  reports: read("src/components/hirmand/admin-property-reports.tsx"),
  targetAlert: read("src/components/hirmand/property-target-alert.tsx"),
  backInMarket: read("src/components/hirmand/property-back-in-market-alert.tsx"),
  propertyDetail: read("src/components/hirmand/property-detail-view.tsx"),
  notifications: read("src/routes/notifications.tsx"),
  musicAdmin: read("src/components/hirmand/admin-music-manager.tsx"),
  viewingRequest: read("src/components/hirmand/property-viewing-request.tsx"),
};

function unconfiguredBranch(source) {
  const match = source.match(/if\s*\(dbSource\s*===\s*["']unconfigured["']\)\s*\{([\s\S]*?)\}/);
  assert.ok(match, "expected an explicit unconfigured-database branch");
  return match[1];
}

test("public engagement and watch endpoints fail with 503 instead of successful empty or false states", () => {
  assert.match(unconfiguredBranch(routes.openHouse), /throw createError\(\{\s*statusCode:\s*503/);
  assert.doesNotMatch(unconfiguredBranch(routes.openHouse), /return/);

  assert.match(unconfiguredBranch(routes.questions), /throw createError\(\{\s*statusCode:\s*503/);
  assert.doesNotMatch(unconfiguredBranch(routes.questions), /return|accepted\s*:/);

  assert.match(unconfiguredBranch(routes.reports), /throw createError\(\{\s*statusCode:\s*503/);
  assert.doesNotMatch(unconfiguredBranch(routes.reports), /return/);

  assert.match(unconfiguredBranch(routes.watch), /throw createError\(\{\s*statusCode:\s*503/);
  assert.doesNotMatch(unconfiguredBranch(routes.watch), /return|enabled\s*:/);

  assert.match(unconfiguredBranch(routes.watchTarget), /throw createError\(\{\s*statusCode:\s*503/);
  assert.doesNotMatch(unconfiguredBranch(routes.watchTarget), /return|enabled\s*:/);

  assert.match(routes.musicAdmin, /assertAdminDatabaseConfigured\(dbSource/);
  assert.doesNotMatch(routes.musicAdmin, /return\s*\{\s*tracks:\s*\[\]\s*\}/);

  assert.match(unconfiguredBranch(routes.viewingSlots), /statusCode:\s*503/);
  assert.doesNotMatch(unconfiguredBranch(routes.viewingSlots), /return|success\s*:/);
});

test("public and admin engagement views expose retryable unavailable states", () => {
  assert.match(components.openHouse, /loadError/);
  assert.match(components.openHouse, /role=["']alert["']/);
  assert.match(components.openHouse, /loadError\s*&&\s*!events\.length\s*\?\s*null/);

  assert.match(components.questions, /loadError/);
  assert.match(components.questions, /role=["']alert["']/);
  assert.match(components.questions, /accepted\s*!==\s*true/);
  assert.match(components.questions, /loadError\s*&&\s*!questions\.length\s*\?\s*null/);

  assert.match(components.adminFeatures, /loadError/);
  assert.match(components.adminFeatures, /role=["']alert["']/);
  assert.match(components.adminFeatures, /loadError\s*&&\s*!items\.length\s*\?\s*null/);

  assert.match(components.reports, /hasLoaded/);
  assert.match(components.reports, /loadError/);
  assert.match(components.reports, /role=["']alert["']/);
  assert.match(components.reports, /loadError\s*&&\s*!reports\.length\s*\?\s*null/);

  assert.match(components.targetAlert, /loadError/);
  assert.match(components.targetAlert, /role=["']alert["']/);
  assert.match(components.targetAlert, /disabled=\{busy\|\|loading\|\|!!loadError/);
  assert.match(components.targetAlert, /isPropertyWatchTargetMutationSuccessful\(payload/);
  assert.match(routes.watchTarget, /enabled:\s*true/);
  assert.match(routes.watchTarget, /target:\s*parsed\.data\.action\s*===\s*["']clear["']\s*\?\s*null/);

  assert.match(components.backInMarket, /loadError/);
  assert.match(components.backInMarket, /role=["']alert["']/);
  assert.match(components.backInMarket, /payload\?\.enabled\s*!==\s*\(action\s*===\s*["']subscribe["']\)/);

  assert.match(components.propertyDetail, /priceWatchError/);
  assert.match(components.propertyDetail, /priceWatchLoading/);
  assert.match(components.propertyDetail, /aria-pressed=\{priceWatchLoading\s*\|\|\s*priceWatchError\s*\?\s*undefined\s*:/);
  assert.match(components.propertyDetail, /role=["']alert["']/);
  assert.match(components.propertyDetail, /payload\?\.enabled\s*!==\s*\(nextAction\s*===\s*["']subscribe["']\)/);

  assert.match(components.notifications, /watchError/);
  assert.match(components.notifications, /if\s*\(!response\.ok\)\s*throw/);
  assert.match(components.notifications, /role=["']alert["']/);
  assert.match(components.notifications, /watchError\s*\?\s*<section/);

  assert.match(components.musicAdmin, /loadError/);
  assert.match(components.musicAdmin, /role=["']alert["']/);
  assert.match(components.musicAdmin, /\{loadError\s*\?\s*null\s*:\s*loading/);

  assert.match(components.viewingRequest, /slotsError/);
  assert.match(components.viewingRequest, /role=["']alert["']/);
});
