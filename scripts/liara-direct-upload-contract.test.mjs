import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [storage, protocol, client, propertyRoute, customerRoute, areaRoute, musicRoute, health, migration, docs] = await Promise.all([
  readFile(new URL("src/lib/liara-object-storage.server.ts", root), "utf8"),
  readFile(new URL("src/lib/chunked-upload.server.ts", root), "utf8"),
  readFile(new URL("src/lib/media-upload-client.ts", root), "utf8"),
  readFile(new URL("server/routes/api/upload.post.ts", root), "utf8"),
  readFile(new URL("server/routes/api/customer-property-upload.post.ts", root), "utf8"),
  readFile(new URL("server/routes/api/area-upload.post.ts", root), "utf8"),
  readFile(new URL("server/routes/api/music-upload.post.ts", root), "utf8"),
  readFile(new URL("src/lib/admin-media-health.ts", root), "utf8"),
  readFile(new URL("migrations/0107_liara_direct_upload_sessions.sql", root), "utf8"),
  readFile(new URL("docs/liara-direct-upload.md", root), "utf8"),
]);
const mediaStore = await readFile(new URL("src/lib/media-store.server.ts", root), "utf8");

test("presigned Liara PUT is server-only, short-lived and binds Content-Type", () => {
  assert.match(storage, /LIARA_DIRECT_UPLOAD_ENABLED\?\.trim\(\)\.toLowerCase\(\) === "true"/);
  assert.match(storage, /expiresInSeconds < 60 \|\| expiresInSeconds > 900/);
  assert.match(storage, /const signedHeaders = "content-length;content-type;host"/);
  assert.match(storage, /"UNSIGNED-PAYLOAD"/);
  assert.match(storage, /X-Amz-Signature/);
  assert.doesNotMatch(storage, /process\.env\.LIARA_SECRET_KEY[\s\S]{0,300}export const/);
});

test("direct uploads still require the scoped DB session and server-side object verification", () => {
  assert.match(protocol, /matchesUploadSessionScope\(session, config\.kind, config\.pathPrefix\)/);
  assert.match(protocol, /createLiaraPresignedPutUrl/);
  assert.match(protocol, /headLiaraObject\(input\.key\)/);
  assert.match(protocol, /copyLiaraObject\(stagingKey, key\)/);
  assert.match(protocol, /const stagingKey = String\(session\.object_key/);
  assert.match(protocol, /set created_at = current_timestamp,[\s\S]*direct_upload_expires_at = case/);
  assert.match(protocol, /completion_started_at = current_timestamp,[\s\S]*created_at = current_timestamp/);
  assert.match(protocol, /completion_state <> 'expired'[\s\S]*returning id/);
  assert.match(mediaStore, /set completion_state = 'expired'[\s\S]*greatest\(created_at, coalesce\(direct_upload_expires_at, created_at\)\)/);
  assert.match(health, /greatest\(\$\{createdAt\}, coalesce\(\$\{column\("direct_upload_expires_at"\)\}, \$\{createdAt\}\)\)/);
  assert.match(protocol, /contentMatchesDeclaredType\(probe, input\.contentType\)/);
  assert.match(protocol, /stored_url = \$2,[\s\S]*?stored_storage = 'object-store'/);
  assert.match(protocol, /deleteLiaraObject\(String\(session\.pathname\)\)/);
  assert.match(protocol, /String\(session\.upload_mode \?\? "chunked"\) === "direct"/);
});

test("aborting a direct upload retires the session and defers staging deletion until its signed URL is stale", () => {
  const abortStart = protocol.indexOf('if (action === "abort")');
  assert.notEqual(abortStart, -1);
  const abortHandler = protocol.slice(abortStart);
  assert.match(abortHandler, /update media_upload_sessions[\s\S]*set completion_state = 'expired'[\s\S]*upload_mode = 'direct'[\s\S]*completion_state = 'pending'[\s\S]*returning id/i);
  assert.match(abortHandler, /upload_mode <> 'direct'[\s\S]*completion_state = 'pending'/);
  assert.doesNotMatch(abortHandler, /deleteLiaraObject/);
});

test("direct PUT is browser-side with progress, while completion uses the normal server receipt", () => {
  assert.match(client, /xhr\.open\("PUT", input\.url, true\)/);
  assert.match(client, /xhr\.upload\.onprogress/);
  assert.match(client, /action: "complete", uploadId/);
  assert.match(client, /LIARA|CORS|فضای ابری/);
});

test("only transform-free photos and music are opted into direct uploads; property videos remain chunked", () => {
  assert.match(propertyRoute, /directUpload: \(\{ contentType \}\) => contentType\.startsWith\("image\/"\)/);
  assert.match(customerRoute, /directUpload: \(\{ contentType \}\) => contentType\.startsWith\("image\/"\)/);
  assert.match(areaRoute, /directUpload: \(\{ contentType \}\) => contentType\.startsWith\("image\/"\)/);
  assert.match(musicRoute, /directUpload: \(\{ contentType \}\) => contentType\.startsWith\("audio\/"\)/);
  assert.match(propertyRoute, /applyPropertyVideoWatermark/);
  assert.match(customerRoute, /applyPropertyVideoWatermark/);
});

test("storage health reports bounded Liara inventory and PostgreSQL database sizes", () => {
  assert.match(storage, /listLiaraObjectInventory\(maxPages = 10\)/);
  assert.match(storage, /complete, pagesScanned/);
  assert.match(storage, /AbortSignal\.timeout\(5_000\)/);
  assert.match(storage, /readBoundedLiaraResponseText\(response, 4 \* 1024 \* 1024\)/);
  assert.match(health, /pg_database_size\(current_database\(\)\)/);
  assert.match(health, /liaraInventoryComplete/);
  assert.match(health, /postgresSizeError: postgresSize\.error/);
  assert.match(health, /\.catch\(\(error\) => \(\{/);
  assert.match(health, /expiresAt: Date\.now\(\) \+ 5 \* 60_000/);
});

test("migration and rollout docs keep direct upload opt-in and require explicit bucket CORS", () => {
  assert.match(migration, /upload_mode text not null default 'chunked'/);
  assert.match(migration, /direct_upload_expires_at/);
  assert.match(migration, /object_key text/);
  assert.match(docs, /LIARA_DIRECT_UPLOAD_ENABLED=true/);
  assert.match(docs, /Keep the bucket private/);
  assert.match(docs, /Keep `staging\/` outside every public media route/);
  assert.match(docs, /Allowed methods: `PUT`\./);
  assert.match(docs, /Allowed request headers: `Content-Type`/);
  assert.match(docs, /No exposed response headers are required/);
  assert.match(docs, /Property videos deliberately retain the existing server-side/);
});
