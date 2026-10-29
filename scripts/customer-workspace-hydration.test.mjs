import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("src/components/hirmand/customer-workspace-sync.tsx", "utf8");

test("customer workspace auth UI waits until after the first hydration render", () => {
  assert.match(source, /const\s+\[mounted,\s*setMounted\]\s*=\s*useState\(false\)/);
  assert.match(source, /useEffect\(\(\)\s*=>\s*\{\s*setMounted\(true\);\s*\},\s*\[\]\)/);
  assert.match(source, /if\s*\(!mounted\s*\|\|\s*isPending\s*\|\|\s*!authEnabled\)\s*return\s+null/);
});
