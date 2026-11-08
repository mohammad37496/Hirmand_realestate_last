import assert from "node:assert/strict";
import test from "node:test";
import { chooseCustomerWorkspaceSync, mergeCustomerWorkspaceThreeWay } from "../src/lib/customer-workspace-sync-plan.mjs";

const remote = {
  ownerId: "user-a",
  updatedAt: "2026-11-07T10:00:00.000Z",
  favorites: ["remote-a", "shared"],
  recentProperties: ["remote-recent"],
  savedSearches: [{ id: "remote-search", name: "Remote", params: "city=Isfahan" }],
  favoriteMeta: { "remote-a": { note: "remote" } },
};
const local = {
  favorites: ["local-a", "shared"],
  recentProperties: ["local-recent"],
  savedSearches: [{ id: "local-search", name: "Local", params: "type=rent" }],
  favoriteMeta: { "local-a": { note: "local" } },
};

test("first sign-in merges anonymous browser data into the signed-in account", () => {
  const result = chooseCustomerWorkspaceSync({
    remote,
    local,
    ownerId: null,
    currentUserId: "user-a",
    pendingLocalChanges: false,
  });
  assert.equal(result.direction, "push");
  assert.deepEqual(result.workspace.favorites, ["local-a", "shared", "remote-a"]);
  assert.deepEqual(result.workspace.savedSearches.map((item) => item.id), ["local-search", "remote-search"]);
});

test("a different account never receives the previous account's local snapshot", () => {
  const result = chooseCustomerWorkspaceSync({
    remote: { ...remote, ownerId: "user-b" },
    local,
    ownerId: "user-a",
    currentUserId: "user-b",
    pendingLocalChanges: true,
  });
  assert.equal(result.direction, "pull");
  assert.deepEqual(result.workspace.favorites, remote.favorites);
});

test("pending local edits are sent as an exact snapshot so deletions propagate", () => {
  const result = chooseCustomerWorkspaceSync({
    remote,
    local: { ...local, favorites: ["local-a"] },
    ownerId: "user-a",
    currentUserId: "user-a",
    pendingLocalChanges: true,
  });
  assert.equal(result.direction, "push");
  assert.deepEqual(result.workspace.favorites, ["local-a"]);
});

test("without local edits, the newest server snapshot replaces stale browser data", () => {
  const result = chooseCustomerWorkspaceSync({
    remote,
    local,
    ownerId: "user-a",
    currentUserId: "user-a",
    pendingLocalChanges: false,
  });
  assert.equal(result.direction, "pull");
  assert.deepEqual(result.workspace.favorites, remote.favorites);
});

test("an existing local account snapshot can restore an empty remote row", () => {
  const result = chooseCustomerWorkspaceSync({
    remote: { ...remote, updatedAt: null, favorites: [] },
    local,
    ownerId: "user-a",
    currentUserId: "user-a",
    pendingLocalChanges: false,
  });
  assert.equal(result.direction, "push");
  assert.deepEqual(result.workspace.favorites, local.favorites);
});

test("three-way merge preserves independent additions and deletions across all workspace collections", () => {
  const base = {
    favorites: ["keep", "delete-local", "delete-remote"],
    recentProperties: ["recent-keep", "recent-delete-local", "recent-delete-remote"],
    savedSearches: [
      { id: "keep-search", name: "Keep", params: "a=1" },
      { id: "delete-local-search", name: "Delete local", params: "b=2" },
      { id: "delete-remote-search", name: "Delete remote", params: "c=3" },
    ],
    favoriteMeta: {
      keep: { note: "same" },
      "delete-local": { note: "remove locally" },
      "delete-remote": { note: "remove remotely" },
    },
  };
  const local = {
    favorites: ["keep", "delete-remote", "local-add"],
    recentProperties: ["recent-keep", "recent-delete-remote", "local-recent-add"],
    savedSearches: [base.savedSearches[0], base.savedSearches[2], { id: "local-search", name: "Local", params: "x=1" }],
    favoriteMeta: { keep: { note: "same" }, "delete-remote": { note: "remove remotely" }, "local-add": { note: "local" } },
  };
  const remoteSnapshot = {
    favorites: ["keep", "delete-local", "remote-add"],
    recentProperties: ["recent-keep", "recent-delete-local", "remote-recent-add"],
    savedSearches: [base.savedSearches[0], base.savedSearches[1], { id: "remote-search", name: "Remote", params: "y=2" }],
    favoriteMeta: { keep: { note: "same" }, "delete-local": { note: "remove locally" }, "remote-add": { note: "remote" } },
  };
  const merged = mergeCustomerWorkspaceThreeWay(base, local, remoteSnapshot);
  assert.deepEqual(new Set(merged.favorites), new Set(["keep", "local-add", "remote-add"]));
  assert.deepEqual(new Set(merged.recentProperties), new Set(["recent-keep", "local-recent-add", "remote-recent-add"]));
  assert.deepEqual(new Set(merged.savedSearches.map((item) => item.id)), new Set(["keep-search", "local-search", "remote-search"]));
  assert.deepEqual(Object.keys(merged.favoriteMeta).sort(), ["keep", "local-add", "remote-add"]);
});

test("same-key favorite metadata conflicts deterministically prefer local changes", () => {
  const merged = mergeCustomerWorkspaceThreeWay(
    { favorites: ["home"], recentProperties: [], savedSearches: [], favoriteMeta: { home: { note: "base" } } },
    { favorites: ["home"], recentProperties: [], savedSearches: [], favoriteMeta: { home: { note: "local edit" } } },
    { favorites: ["home"], recentProperties: [], savedSearches: [], favoriteMeta: { home: { note: "remote edit" } } },
  );
  assert.deepEqual(merged.favoriteMeta.home, { note: "local edit" });
});

test("same-id saved-search conflicts deterministically prefer local changes", () => {
  const merged = mergeCustomerWorkspaceThreeWay(
    { favorites: [], recentProperties: [], savedSearches: [{ id: "s", name: "Base", params: "a=1" }], favoriteMeta: {} },
    { favorites: [], recentProperties: [], savedSearches: [{ id: "s", name: "Local", params: "a=1" }], favoriteMeta: {} },
    { favorites: [], recentProperties: [], savedSearches: [{ id: "s", name: "Remote", params: "a=1" }], favoriteMeta: {} },
  );
  assert.equal(merged.savedSearches[0]?.name, "Local");
});

test("favorites cap prioritizes local additions and retains remote additions and deletions", () => {
  const baseFavorites = Array.from({ length: 199 }, (_, index) => `favorite-${index}`);
  const merged = mergeCustomerWorkspaceThreeWay(
    { favorites: baseFavorites, recentProperties: [], savedSearches: [], favoriteMeta: {} },
    { favorites: [...baseFavorites.slice(1), "local-favorite"], recentProperties: [], savedSearches: [], favoriteMeta: {} },
    { favorites: [...baseFavorites, "remote-favorite"], recentProperties: [], savedSearches: [], favoriteMeta: {} },
  );
  assert.equal(merged.favorites.length, 200);
  assert.equal(merged.favorites[0], "local-favorite");
  assert.ok(merged.favorites.includes("remote-favorite"));
  assert.ok(!merged.favorites.includes("favorite-0"));
});

test("saved-search cap prioritizes local changed IDs and additions before remote additions", () => {
  const baseSearches = Array.from({ length: 8 }, (_, index) => ({
    id: `search-${index}`, name: `Base ${index}`, params: `page=${index}`,
  }));
  const localSearches = [
    ...baseSearches.slice(1, 7),
    { ...baseSearches[7], name: "Local changed" },
    { id: "local-search", name: "Local addition", params: "local=1" },
  ];
  const remoteSearches = [
    ...baseSearches,
    { id: "remote-search-1", name: "Remote addition 1", params: "remote=1" },
    { id: "remote-search-2", name: "Remote addition 2", params: "remote=2" },
  ];
  const merged = mergeCustomerWorkspaceThreeWay(
    { favorites: [], recentProperties: [], savedSearches: baseSearches, favoriteMeta: {} },
    { favorites: [], recentProperties: [], savedSearches: localSearches, favoriteMeta: {} },
    { favorites: [], recentProperties: [], savedSearches: remoteSearches, favoriteMeta: {} },
  );
  assert.equal(merged.savedSearches.length, 10);
  assert.deepEqual(merged.savedSearches.slice(0, 2).map((item) => item.id), ["search-7", "local-search"]);
  assert.equal(merged.savedSearches[0]?.name, "Local changed");
  assert.ok(merged.savedSearches.some((item) => item.id === "remote-search-1"));
  assert.ok(merged.savedSearches.some((item) => item.id === "remote-search-2"));
  assert.ok(!merged.savedSearches.some((item) => item.id === "search-0"));
});

test("recent-properties cap prioritizes local additions and retains remote additions and deletions", () => {
  const baseRecent = Array.from({ length: 19 }, (_, index) => `recent-${index}`);
  const merged = mergeCustomerWorkspaceThreeWay(
    { favorites: [], recentProperties: baseRecent, savedSearches: [], favoriteMeta: {} },
    { favorites: [], recentProperties: [...baseRecent.slice(1), "local-recent"], savedSearches: [], favoriteMeta: {} },
    { favorites: [], recentProperties: [...baseRecent, "remote-recent"], savedSearches: [], favoriteMeta: {} },
  );
  assert.equal(merged.recentProperties.length, 20);
  assert.equal(merged.recentProperties[0], "local-recent");
  assert.ok(merged.recentProperties.includes("remote-recent"));
  assert.ok(!merged.recentProperties.includes("recent-0"));
});
