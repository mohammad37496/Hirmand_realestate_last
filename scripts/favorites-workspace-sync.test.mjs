import assert from "node:assert/strict";
import test from "node:test";
import { subscribeToFavoriteWorkspaceSync } from "../src/lib/favorites-workspace-sync.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const favoritesSource = readFileSync(fileURLToPath(new URL("../src/routes/favorites.tsx", import.meta.url)), "utf8");

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("FavoritesPage wires workspace sync to the visible properties state", () => {
  assert.match(favoritesSource, /subscribeToFavoriteWorkspaceSync\(/);
  assert.match(favoritesSource, /readSlugs:\s*readFavorites/);
  assert.match(favoritesSource, /setProperties\(snapshot\.rows\)/);
  assert.match(favoritesSource, /favoriteRequestId !== favoriteLoadVersion\.current/);
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
