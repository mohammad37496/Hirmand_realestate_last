import assert from "node:assert/strict";
import test from "node:test";
import { subscribeToFavoriteMetaWorkspaceSync, subscribeToFavoriteWorkspaceSync } from "../src/lib/favorites-workspace-sync.mjs";
import { clearWorkspaceForSignedOutUser, resetWorkspaceForAccountSwitch } from "../src/lib/customer-workspace-account-switch.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const favoritesSource = readFileSync(fileURLToPath(new URL("../src/routes/favorites.tsx", import.meta.url)), "utf8");

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("FavoritesPage wires workspace sync to the visible properties state", () => {
  assert.match(favoritesSource, /subscribeToFavoriteWorkspaceSync\(/);
  assert.match(favoritesSource, /readSlugs:\s*readFavorites/);
  assert.match(favoritesSource, /setProperties\(snapshot\.rows\)/);
  assert.match(favoritesSource, /favoriteRequestId !== favoriteLoadVersion\.current/);
  assert.match(favoritesSource, /onError:\s*\(\)\s*=>\s*\{[\s\S]*?toast\.error\(/);
  assert.doesNotMatch(favoritesSource, /onLoading:\s*setLoading/);
  assert.match(favoritesSource, /initialSlugs:\s*readRecent\(\)/);
  assert.match(favoritesSource, /setRecentProperties\(snapshot\.rows\)/);
  assert.match(favoritesSource, /recentRequestId !== recentLoadVersion\.current/);
  assert.match(favoritesSource, /subscribeToFavoriteMetaWorkspaceSync\(/);
  assert.match(favoritesSource, /readMeta:\s*readFavoriteMeta/);
  assert.match(favoritesSource, /onLoaded:\s*setFavoriteMeta/);
});

test("a mounted favorites view replaces account A metadata when account B syncs without reloading", () => {
  const target = new EventTarget();
  let storedMeta = {
    "account-a-property": { tag: "پیگیری", note: "یادداشت محرمانه حساب الف" },
    "shared-property": { note: "یادداشت حساب الف" },
  };
  let mountedMeta = structuredClone(storedMeta);
  const stop = subscribeToFavoriteMetaWorkspaceSync({
    target,
    readMeta: () => structuredClone(storedMeta),
    onLoaded: (meta) => { mountedMeta = meta; },
  });

  storedMeta = {
    "account-b-property": { tag: "بازدید", note: "یادداشت حساب ب" },
    "shared-property": { note: "یادداشت حساب ب" },
  };
  target.dispatchEvent(new Event("hirmand:workspace-synced"));

  assert.deepEqual(mountedMeta, storedMeta, "mounted metadata must be replaced by the new account snapshot");
  assert.equal(mountedMeta["account-a-property"], undefined, "account A-only annotations must disappear");
  assert.equal(mountedMeta["shared-property"].note, "یادداشت حساب ب", "same-property metadata must not retain account A's note");

  stop();
});

test("account switch clears mounted account A metadata before the new account fetch resolves", async () => {
  const target = new EventTarget();
  const values = new Map([
    ["hirmand-workspace-owner-v1", "account-a"],
    ["hirmand-favorite-properties", '["account-a-property"]'],
    ["hirmand-recent-properties", '["account-a-recent"]'],
    ["hirmand-saved-searches", '[{"id":"account-a-search"}]'],
    ["hirmand-favorite-meta-v1", JSON.stringify({ "account-a-property": { note: "یادداشت حساب الف" } })],
    ["hirmand-workspace-pending-v1", "pending-a"],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  let mountedMeta = JSON.parse(values.get("hirmand-favorite-meta-v1"));
  const stop = subscribeToFavoriteMetaWorkspaceSync({
    target,
    readMeta: () => JSON.parse(values.get("hirmand-favorite-meta-v1") ?? "{}"),
    onLoaded: (meta) => { mountedMeta = meta; },
  });
  let resolveAccountB;
  const accountBFetch = new Promise((resolve) => { resolveAccountB = resolve; });

  assert.equal(resetWorkspaceForAccountSwitch({ storage, target, userId: "account-b" }), true);
  await tick();
  assert.deepEqual(mountedMeta, {}, "the mounted page must immediately discard all account A annotations");
  assert.equal(values.get("hirmand-workspace-owner-v1"), "account-b");
  assert.equal(values.has("hirmand-favorite-properties"), false);
  assert.equal(values.has("hirmand-recent-properties"), false);
  assert.equal(values.has("hirmand-saved-searches"), false);
  assert.equal(values.has("hirmand-workspace-pending-v1"), false);

  resolveAccountB({ favoriteMeta: { "account-b-property": { note: "یادداشت حساب ب" } } });
  const remote = await accountBFetch;
  values.set("hirmand-favorite-meta-v1", JSON.stringify(remote.favoriteMeta));
  target.dispatchEvent(new Event("hirmand:workspace-synced"));
  assert.deepEqual(mountedMeta, { "account-b-property": { note: "یادداشت حساب ب" } });
  assert.equal(mountedMeta["account-a-property"], undefined);
  stop();
});

test("first sign-in without an owner marker preserves the guest workspace for merge", () => {
  const target = new EventTarget();
  const values = new Map([
    ["hirmand-favorite-properties", '["guest-favorite"]'],
    ["hirmand-favorite-meta-v1", JSON.stringify({ "guest-favorite": { note: "guest note" } })],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  assert.equal(resetWorkspaceForAccountSwitch({ storage, target, userId: "first-account" }), false);
  assert.equal(values.get("hirmand-favorite-properties"), '["guest-favorite"]');
  assert.equal(values.has("hirmand-favorite-meta-v1"), true);
});

test("sign-out clears the previous account workspace and refreshes mounted views without reload", async () => {
  const target = new EventTarget();
  const values = new Map([
    ["hirmand-workspace-owner-v1", "account-a"],
    ["hirmand-favorite-properties", '["account-a-property"]'],
    ["hirmand-recent-properties", '["account-a-recent"]'],
    ["hirmand-saved-searches", '[{"id":"account-a-search"}]'],
    ["hirmand-favorite-meta-v1", JSON.stringify({ "account-a-property": { note: "یادداشت حساب الف" } })],
    ["hirmand-workspace-pending-v1", "pending-a"],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
  };
  let mountedMeta = JSON.parse(values.get("hirmand-favorite-meta-v1"));
  const stop = subscribeToFavoriteMetaWorkspaceSync({
    target,
    readMeta: () => JSON.parse(values.get("hirmand-favorite-meta-v1") ?? "{}"),
    onLoaded: (meta) => { mountedMeta = meta; },
  });

  assert.equal(clearWorkspaceForSignedOutUser({ storage, target }), true);
  await tick();
  assert.deepEqual(mountedMeta, {}, "the mounted favorites view must clear account A metadata on sign-out");
  for (const key of [
    "hirmand-workspace-owner-v1",
    "hirmand-favorite-properties",
    "hirmand-recent-properties",
    "hirmand-saved-searches",
    "hirmand-favorite-meta-v1",
    "hirmand-workspace-pending-v1",
  ]) {
    assert.equal(values.has(key), false, `${key} must be cleared on sign-out`);
  }
  stop();
});

test("a mounted favorites view refreshes after remote sync without reloading", async () => {
  const target = new EventTarget();
  let storedSlugs = ["old-favorite"];
  let visibleProperties = [{ slug: "old-favorite" }];
  const fetches = [];
  const stop = subscribeToFavoriteWorkspaceSync({
    target,
    initialSlugs: storedSlugs,
    readSlugs: () => storedSlugs,
    load: async (slugs) => {
      fetches.push([...slugs]);
      return slugs.map((slug) => ({ slug }));
    },
    onLoaded: (rows) => { visibleProperties = rows; },
  });

  storedSlugs = ["remote-favorite", "another-remote-favorite"];
  target.dispatchEvent(new Event("hirmand:workspace-synced"));
  await tick();

  assert.deepEqual(visibleProperties, [
    { slug: "remote-favorite" },
    { slug: "another-remote-favorite" },
  ]);
  assert.deepEqual(fetches, [["remote-favorite", "another-remote-favorite"]]);

  target.dispatchEvent(new Event("hirmand:workspace-synced"));
  await tick();
  assert.equal(fetches.length, 1, "an unchanged favorite list must not trigger another property fetch");

  stop();
  storedSlugs = ["after-unmount"];
  target.dispatchEvent(new Event("hirmand:workspace-synced"));
  await tick();
  assert.equal(fetches.length, 1, "the listener must be removed when the view unmounts");
});

test("a newer sync result wins when an earlier property fetch finishes late", async () => {
  const target = new EventTarget();
  let storedSlugs = ["initial"];
  let visibleProperties = [{ slug: "initial" }];
  const pending = new Map();
  const stop = subscribeToFavoriteWorkspaceSync({
    target,
    initialSlugs: storedSlugs,
    readSlugs: () => storedSlugs,
    load: (slugs) => new Promise((resolve) => pending.set(slugs[0], resolve)),
    onLoaded: (rows) => { visibleProperties = rows; },
  });

  storedSlugs = ["first-remote"];
  target.dispatchEvent(new Event("hirmand:workspace-synced"));
  storedSlugs = ["second-remote"];
  target.dispatchEvent(new Event("hirmand:workspace-synced"));
  pending.get("second-remote")([{ slug: "second-remote" }]);
  await tick();
  pending.get("first-remote")([{ slug: "first-remote" }]);
  await tick();

  assert.deepEqual(visibleProperties, [{ slug: "second-remote" }]);
  stop();
});

test("a failed favorites refresh retries on the next identical sync and keeps old rows until success", async () => {
  const target = new EventTarget();
  let storedSlugs = ["initial"];
  let visibleProperties = [{ slug: "initial" }];
  const fetches = [];
  const errors = [];
  let attempt = 0;
  const stop = subscribeToFavoriteWorkspaceSync({
    target,
    initialSlugs: storedSlugs,
    readSlugs: () => storedSlugs,
    load: async (slugs) => {
      fetches.push([...slugs]);
      attempt += 1;
      if (attempt === 1) throw new Error("temporary fetch failure");
      return slugs.map((slug) => ({ slug }));
    },
    onLoaded: (rows) => { visibleProperties = rows; },
    onError: (error) => errors.push(error.message),
  });

  storedSlugs = ["remote-favorite"];
  target.dispatchEvent(new Event("hirmand:workspace-synced"));
  await tick();
  assert.deepEqual(visibleProperties, [{ slug: "initial" }], "failed fetch must not clear existing visible properties");
  assert.deepEqual(errors, ["temporary fetch failure"]);

  target.dispatchEvent(new Event("hirmand:workspace-synced"));
  await tick();
  assert.deepEqual(fetches, [["remote-favorite"], ["remote-favorite"]]);
  assert.deepEqual(visibleProperties, [{ slug: "remote-favorite" }]);

  stop();
});

test("mounted recent history refreshes after workspace sync without reloading", async () => {
  const target = new EventTarget();
  let storedSlugs = ["old-recent"];
  let visibleProperties = [{ slug: "old-recent" }];
  const stop = subscribeToFavoriteWorkspaceSync({
    target,
    initialSlugs: storedSlugs,
    readSlugs: () => storedSlugs,
    load: async (slugs) => slugs.map((slug) => ({ slug })),
    onLoaded: (rows) => { visibleProperties = rows; },
  });

  storedSlugs = ["remote-recent", "another-remote-recent"];
  target.dispatchEvent(new Event("hirmand:workspace-synced"));
  await tick();

  assert.deepEqual(visibleProperties, [
    { slug: "remote-recent" },
    { slug: "another-remote-recent" },
  ]);
  stop();
});

test("a failed recent-history refresh retries on the next identical sync", async () => {
  const target = new EventTarget();
  let storedSlugs = ["initial-recent"];
  let visibleProperties = [{ slug: "initial-recent" }];
  let attempt = 0;
  const fetches = [];
  const stop = subscribeToFavoriteWorkspaceSync({
    target,
    initialSlugs: storedSlugs,
    readSlugs: () => storedSlugs,
    load: async (slugs) => {
      fetches.push([...slugs]);
      attempt += 1;
      if (attempt === 1) throw new Error("temporary history failure");
      return slugs.map((slug) => ({ slug }));
    },
    onLoaded: (rows) => { visibleProperties = rows; },
  });

  storedSlugs = ["remote-recent"];
  target.dispatchEvent(new Event("hirmand:workspace-synced"));
  await tick();
  assert.deepEqual(visibleProperties, [{ slug: "initial-recent" }]);

  target.dispatchEvent(new Event("hirmand:workspace-synced"));
  await tick();
  assert.deepEqual(fetches, [["remote-recent"], ["remote-recent"]]);
  assert.deepEqual(visibleProperties, [{ slug: "remote-recent" }]);
  stop();
});
