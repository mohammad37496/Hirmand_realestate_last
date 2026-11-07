import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [manager, client, protocol, route, library, queue] = await Promise.all([
  readFile(new URL("src/components/hirmand/admin-music-manager.tsx", root), "utf8"),
  readFile(new URL("src/lib/media-upload-client.ts", root), "utf8"),
  readFile(new URL("src/lib/chunked-upload.server.ts", root), "utf8"),
  readFile(new URL("server/routes/api/music-upload.post.ts", root), "utf8"),
  readFile(new URL("src/lib/music-library.server.ts", root), "utf8"),
  readFile(new URL("src/lib/music-upload-queue.ts", root), "utf8"),
]);

test("music manager persists the exact file, metadata and stable ID before upload", () => {
  const persistIndex = manager.indexOf("await persistMusicUploadQueue(queueItem)");
  const uploadIndex = manager.indexOf("await uploadInChunks({", persistIndex);
  assert.ok(persistIndex >= 0 && uploadIndex > persistIndex);
  assert.match(manager, /uploadId:\s*stableUploadId/);
  assert.match(manager, /retryCompletion:\s*true/);
  assert.match(manager, /retryChunks:\s*true/);
  assert.match(manager, /preserveSessionOnError:\s*true/);
  assert.match(manager, /setRetryPending\(true\)/);
  assert.match(manager, /تلاش مجدد همین فایل/);
  assert.match(manager, /setTracks\(\(prev\) => prev\.some\(\(item\) => item\.id === track\.id\)/);
});

test("music upload queue restores a File with its stable ID and metadata", () => {
  assert.match(queue, /indexedDB\.open\(MUSIC_UPLOAD_QUEUE_DB, 1\)/);
  assert.match(queue, /file:\s*item\.file/);
  assert.match(queue, /uploadId:\s*item\.uploadId/);
  assert.match(queue, /title:\s*item\.title/);
  assert.match(queue, /artist:\s*item\.artist/);
  assert.match(queue, /new File\(\[record\.file\], record\.name/);
  assert.match(queue, /return false/);
  assert.match(manager, /ذخیرهٔ صف در حافظهٔ مرورگر/);
});

test("client reuses the stable ID, short-circuits completed receipts and skips assembled chunks", () => {
  assert.match(client, /\.\.\.\(options\.uploadId \? \{ uploadId: options\.uploadId \} : \{\}\)/);
  assert.match(client, /begin\.uploadId !== options\.uploadId/);
  assert.match(client, /if \(begin\.completed\)/);
  assert.match(client, /begin\.assembled \|\| begin\.completing \? totalChunks : 0/);
  assert.match(client, /options\.retryChunks \? 3 : 1/);
  assert.match(client, /preserveSessionOnError/);
  assert.match(client, /if \(!options\.preserveSessionOnError\)/);
});

test("server binds a stable ID to one audio session and can recover a pruned receipt", () => {
  assert.match(protocol, /allowClientUploadId\?: boolean/);
  assert.match(protocol, /requestedUploadId/);
  assert.match(protocol, /شناسه قبلاً برای فایل دیگری استفاده شده است/);
  assert.match(protocol, /completion_result/);
  assert.match(protocol, /assembled:\s*Boolean\(existing\.stored_url\)/);
  assert.match(protocol, /completing:\s*String\(existing\.completion_state/);
  assert.match(protocol, /config\.recoverCompleted/);
  assert.match(route, /allowClientUploadId:\s*true/);
  assert.match(route, /recoverCompleted:\s*async/);
  assert.match(route, /findMusicTrackById\(uploadId\)/);
});

test("music finalization uses the session ID as an idempotency key", () => {
  assert.match(route, /id:\s*String\(session\.id\)/);
  assert.match(library, /export async function findMusicTrackById/);
  assert.match(library, /on conflict \(id\) do update set id = music_tracks\.id/);
  assert.match(library, /شناسهٔ آپلود قبلاً برای آهنگ دیگری ثبت شده است/);
});
