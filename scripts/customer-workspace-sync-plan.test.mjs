import assert from "node:assert/strict";
import test from "node:test";
import { chooseCustomerWorkspaceSync } from "../src/lib/customer-workspace-sync-plan.mjs";

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
  assert.deepEqual(result.workspace.favorites, ["remote-a", "shared", "local-a"]);
  assert.deepEqual(result.workspace.savedSearches.map((item) => item.id), ["remote-search", "local-search"]);
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
