import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ffmpegDownloader = await readFile(
  new URL("./ensure-ffmpeg.mjs", import.meta.url),
  "utf8",
);
const deployEnv = await readFile(
  new URL("./validate-deploy-env.mjs", import.meta.url),
  "utf8",
);

test("FFmpeg download has a finite timeout and an actionable timeout error", () => {
  assert.match(ffmpegDownloader, /AbortSignal\.timeout\(timeoutMs\)/);
  assert.match(ffmpegDownloader, /FFmpeg download timed out after/);
});

test("npm build does not repeat fallback image downloads", () => {
  assert.match(deployEnv, /npm_lifecycle_event !== "build"/);
});
