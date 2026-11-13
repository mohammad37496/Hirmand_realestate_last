import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const activity = readFileSync("android/app/src/main/java/ir/hirmand/phonebridge/remote/RemoteFileManagerActivity.kt", "utf8");
const traversal = readFileSync("android/app/src/main/java/ir/hirmand/phonebridge/remote/RemoteFileTreeTraversal.kt", "utf8");

test("Android SAF cursor reads are bounded before materializing child rows", () => {
  assert.match(activity, /RemoteFileTreeTraversal\.readAtMost\(maxDocuments, c::moveToNext\)/);
  assert.doesNotMatch(activity, /while\s*\(c\.moveToNext\(\)\s*&&\s*size\s*<\s*maxDocuments\)/);
  assert.match(traversal, /while \(values\.size < maxRows && hasNext\(\)\)/);
  assert.match(activity, /bounded\.hasMore/);
});
