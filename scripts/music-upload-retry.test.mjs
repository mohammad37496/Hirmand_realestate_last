import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [manager, client, protocol, route, library] = await Promise.all([
  readFile(new URL("src/components/hirmand/admin-music-manager.tsx", root), "utf8"),
  readFile(new URL("src/lib/media-upload-client.ts", root), "utf8"),
  readFile(new URL("src/lib/chunked-upload.server.ts", root), "utf8"),
  readFile(new URL("server/routes/api/music-upload.post.ts", root), "utf8"),
  readFile(new URL("src/lib/music-library.server.ts", root), "utf8"),
]);

test("batch failures retain only failed files, stable IDs, metadata, and selection order", () => {
  assert.match(manager, /const failedFiles: File\[\] = \[\]/);
  assert.match(manager, /const failedUploadIds: string\[\] = \[\]/);
  assert.match(manager, /const failedMetadata: Array<\{ title: string; artist: string \}> = \[\]/);
  assert.match(manager, /failedFiles\.push\(originalFile\)/);
  assert.match(manager, /failedUploadIds\.push\(idsToUpload\[index\]!\)/);
  assert.match(manager, /failedMetadata\.push\(\{ title: trackTitle, artist: trackArtist \}\)/);
  assert.match(manager, /setSelectedFiles\(failedFiles\)/);
  assert.match(manager, /setSelectedUploadIds\(failedUploadIds\)/);
  assert.match(manager, /setSelectedMetadata\(failedMetadata\)/);
  assert.match(manager, /for \(let index = 0; index < filesToUpload\.length; index \+= 1\)/);
  assert.match(manager, /failedFiles\.push\(originalFile\)/);
  assert.match(manager, /setTracks\(\(prev\) => \{/);
});

test("individual retry sends the matching file, metadata and stable id, then removes only that row", () => {
  assert.match(manager, /const originalFile = selectedFiles\[index\]/);
  assert.match(manager, /const parsed = selectedMetadata\[index\]/);
  assert.match(manager, /uploadId: selectedUploadIds\[index\]/);
  assert.match(manager, /selectedFiles\.filter\(\(_, itemIndex\) => itemIndex !== index\)/);
  assert.match(manager, /selectedUploadIds\.filter\(\(_, itemIndex\) => itemIndex !== index\)/);
  assert.match(manager, /selectedMetadata\.filter\(\(_, itemIndex\) => itemIndex !== index\)/);
  assert.match(manager, /if \(!originalFile \|\| busyRef\.current\) return/);
  assert.match(manager, /if \(busyRef\.current\) return/);
  assert.match(manager, /تلاش مجدد همین فایل/);
});

test("retryable uploads retain the same server session instead of aborting it on errors", () => {
  assert.match(client, /uploadId\?: string/);
  assert.match(client, /\.\.\.\(options\.uploadId \? \{ uploadId: options\.uploadId \} : \{\}\)/);
  assert.match(client, /if \(!options\.retryCompletion\) \{/);
  assert.match(protocol, /const requestedUploadId = typeof payload\.uploadId === "string"/);
  assert.match(protocol, /این شناسه قبلاً برای فایل دیگری استفاده شده است/);
  assert.match(protocol, /completion_state = 'completing'/);
  assert.match(protocol, /completion_state in \('completing', 'assembled'\)/);
  assert.match(protocol, /completed: true/);
  assert.match(protocol, /config\.recoverCompleted/);
  assert.match(route, /recoverCompleted: async/);
  assert.match(route, /findMusicTrackById\(uploadId\)/);
  assert.match(client, /if \(begin\.completed && begin\.response/);
  assert.match(client, /begin\.uploadId !== options\.uploadId/);
  assert.match(client, /let index = begin\.assembled \? totalChunks : 0/);
  assert.match(client, /AbortSignal\.timeout\(45_000\)/);
  assert.match(client, /options\.retryCompletion \? 5 : 1/);
  assert.match(client, /if \(!options\.retryCompletion\) \{/);
});

test("music finalization uses the upload session ID as an idempotency key", () => {
  assert.match(route, /id: String\(session\.id\)/);
  assert.match(library, /on conflict \(id\) do update set id = music_tracks\.id/);
  assert.match(route, /recoverCompleted: async/);
  assert.match(route, /track\.sizeBytes !== sizeBytes/);
});

test("finalization errors remain visible and the same upload ID is retried after ambiguous network responses", () => {
  assert.match(client, /پاسخ نهایی آپلود دریافت نشد؛ همان فایل را دوباره تلاش کنید/);
  assert.match(client, /if \(signal\?\.aborted \|\| attempt \+ 1 >= maxCompletionAttempts\)/);
  assert.match(client, /signal: uploadRequestSignal\(signal\)/);
  assert.match(client, /AbortSignal\.timeout\(45_000\)/);
  assert.match(protocol, /completion_result is not null/);
  assert.match(protocol, /set completion_result = \$2::jsonb/);
});

test("retry queue displays a separate error and action for every failed file", () => {
  assert.match(manager, /failedUploadMessages\.map\(\(message, index\)/);
  assert.match(manager, /className="admin-music-retry-one"/);
  assert.match(manager, /setRetryingIndex\(index\)/);
  assert.match(manager, /className="admin-music-batch-item"/);
  assert.match(manager, /پیش‌نمایش قابل ویرایش عنوان و هنرمند/);
  assert.match(manager, /indexedDB\.open\(MUSIC_UPLOAD_QUEUE_DB, 1\)/);
  assert.match(manager, /new File\(\[item\.file\]/);
  assert.match(manager, /persistMusicUploadQueue\(failedFiles, failedUploadIds, failedMetadata, failures\)/);
});
