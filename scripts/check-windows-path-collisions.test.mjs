import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

const trackedPaths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const seen = new Map();
const collisions = [];

for (const path of trackedPaths) {
  const key = path.toLowerCase();
  const previous = seen.get(key);
  if (previous && previous !== path) collisions.push([previous, path]);
  else seen.set(key, path);
}

test("tracked paths are unique on case-insensitive filesystems", () => {
  assert.deepEqual(
    collisions,
    [],
    `Tracked paths collide on Windows/macOS case-insensitive filesystems:\n${collisions
      .map(([first, second]) => `- ${first}\n- ${second}`)
      .join("\n")}`,
  );
});
