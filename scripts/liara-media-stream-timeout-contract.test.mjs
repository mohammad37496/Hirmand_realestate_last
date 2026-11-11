import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const musicRoute = readFileSync("server/routes/api/music/file/[id].get.ts", "utf8");

test("Liara-backed music streaming applies the shared upstream idle timeout", () => {
  assert.match(musicRoute, /withLiaraStreamIdleTimeout\(upstream\.body,\s*LIARA_MEDIA_STREAM_IDLE_TIMEOUT_MS\)/);
});
