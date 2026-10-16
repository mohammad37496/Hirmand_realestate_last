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

const divarWorkflow = await readFile(
  new URL("../.github/workflows/sync-divar-neighborhoods.yml", import.meta.url),
  "utf8",
);
const uploadRoute = await readFile(
  new URL("../src/lib/chunked-upload.server.ts", import.meta.url),
  "utf8",
);

test("Divar catalog automation requires review and explicitly dispatches verification", () => {
  assert.match(divarWorkflow, /pull-requests:\\s*write/);
  assert.match(divarWorkflow, /gh pr (?:create|edit)/);
  assert.match(divarWorkflow, /gh workflow run ci\\.yml --ref "\\$branch"/);
  assert.match(divarWorkflow, /gh workflow run verify\\.yml --ref "\\$branch"/);
  assert.doesNotMatch(divarWorkflow, /^\\s*git push\\s*$/m);
  assert.doesNotMatch(divarWorkflow, /git push origin HEAD:main/);
});

test("chunk upload writes are scoped to the session and serialized with completion", () => {
  assert.match(
    uploadRoute,
    /matchesUploadSessionScope\\(session, config\\.kind, config\\.pathPrefix\\)/,
  );
  assert.match(
    uploadRoute,
    /kind = \\$4[\\s\\S]*left\\(pathname, length\\(\\$5\\)\\) = \\$5[\\s\\S]*completion_state = 'pending'[\\s\\S]*for update[\\s\\S]*insert into media_upload_chunks/,
  );
  assert.match(
    uploadRoute,
    /where id = \\$1[\\s\\S]*and kind = \\$2[\\s\\S]*left\\(pathname, length\\(\\$3\\)\\) = \\$3[\\s\\S]*completion_state = 'pending'/,
  );
});
