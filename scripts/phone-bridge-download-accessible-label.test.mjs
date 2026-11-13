import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync("src/components/hirmand/admin-phone-bridge-file-manager.tsx", "utf8");

test("download button accessible name includes the action and the file name", () => {
  const button = component.match(/<button\b(?=[^>]*onClick=\{\(\) => void downloadFile\(entry\)\})[\s\S]*?<\/button>/)?.[0];
  assert.ok(button, "expected the file download button");
  assert.match(button, /aria-label=\{"دریافت " \+ entry\.name\}/);
  assert.match(button, />[\s\S]*دریافت/);
});