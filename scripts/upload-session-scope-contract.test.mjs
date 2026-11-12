import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [protocol, propertyRoute, areaRoute, customerRoute, mediaProxyRoute, customerForm, adminReview, databaseMediaRoute, uploadSmoke, mediaStore, mediaAccess] = await Promise.all([
  readFile(new URL("src/lib/chunked-upload.server.ts", root), "utf8"),
  readFile(new URL("server/routes/api/upload.post.ts", root), "utf8"),
  readFile(new URL("server/routes/api/area-upload.post.ts", root), "utf8"),
  readFile(new URL("server/routes/api/customer-property-upload.post.ts", root), "utf8"),
  readFile(new URL("server/routes/api/media-proxy.get.ts", root), "utf8"),
  readFile(new URL("src/routes/submit-property.tsx", root), "utf8"),
  readFile(new URL("server/routes/api/admin-customer-property-submissions.post.ts", root), "utf8"),
  readFile(new URL("server/routes/api/media/[id].get.ts", root), "utf8"),
  readFile(new URL("scripts/upload-e2e-smoke.mjs", root), "utf8"),
  readFile(new URL("src/lib/media-store.server.ts", root), "utf8"),
  readFile(new URL("src/lib/liara-media-access.server.ts", root), "utf8"),
]);

test("property and area upload routes cannot exchange media session IDs", () => {
  assert.match(propertyRoute, /kind:\s*"media"[\s\S]*?pathPrefix:\s*"properties\/uploads"/);
  assert.match(areaRoute, /kind:\s*"media"[\s\S]*?pathPrefix:\s*"areas\/uploads"/);
  assert.match(protocol, /matchesUploadSessionScope\(session,\s*config\.kind,\s*config\.pathPrefix\)/);
  assert.match(protocol, /const sessionPathPrefix = uploadSessionScopePrefix\(config\.pathPrefix\)/);
});

test("chunk writes are scoped and serialized against finalization", () => {
  assert.match(protocol, /where id = \$1\s+and kind = \$4\s+and left\(pathname, length\(\$5\)\) = \$5\s+and completion_state = 'pending'\s+for update/);
  assert.match(protocol, /insert into media_upload_chunks[\s\S]*?select id, \$2, \$3 from upload_session/);
  assert.match(protocol, /if \(!savedChunk\[0\]\)/);
});

test("completion receipts and claims require both session kind and route prefix", () => {
  assert.match(protocol, /select completion_result, stored_storage[\s\S]*?where id = \$1 and kind = \$2\s+and left\(pathname, length\(\$3\)\) = \$3\s+and completion_result is not null/);
  assert.match(protocol, /where id = \$1\s+and kind = \$2\s+and left\(pathname, length\(\$3\)\) = \$3\s+and \(/);
});

test("completion cleanup, retry-state updates and abort remain route-scoped", () => {
  assert.ok((protocol.match(/left\(pathname, length\(\$\d+\)\) = \$\d+/g) ?? []).length >= 7);
  assert.match(protocol, /delete from media_upload_sessions where id = \$1 and kind = \$2 and left\(pathname, length\(\$3\)\) = \$3 and completion_state = 'pending'/);
  assert.match(customerRoute, /kind:\s*"customer-property-media"[\s\S]*?pathPrefix:\s*"properties\/customer-submissions"/);
});

test("customer media previews use the full upload session ID and publishing strips that private capability", () => {
  assert.match(customerForm, /withMediaUploadCapability\(url,\s*result\.uploadId\)/);
  assert.match(mediaProxyRoute, /uploadId\?:\s*string/);
  assert.match(mediaProxyRoute, /hasCompletedCustomerUploadMedia\([\s\S]*?query\.uploadId/);
  assert.match(adminReview, /map\(stripMediaUploadCapability\)/);
  assert.match(mediaProxyRoute, /if \(!isAllowedLiaraMediaKey\(liaraKey\)\)[\s\S]*?throw createError\([\s\S]*?statusCode:\s*404[\s\S]*?\);[\s\S]*?const response = await getLiaraObject/);
});

test("database media endpoint gates private upload prefixes and preserves public producers", () => {
  assert.match(databaseMediaRoute, /databaseMediaVisibility\(meta\.pathname\)/);
  assert.match(databaseMediaRoute, /visibility === "unknown"[\s\S]*?statusCode:\s*404/);
  assert.match(databaseMediaRoute, /hasAdminPermission\(claims\.role,\s*"property\.manage"\)/);
  assert.match(databaseMediaRoute, /hasRejectedCustomerSubmissionMedia\([\s\S]*?query\.trackingToken/);
  assert.match(databaseMediaRoute, /hasCompletedCustomerUploadMedia\([\s\S]*?query\.uploadId/);
  assert.match(databaseMediaRoute, /query\.type === "video" \? "\?type=video"/);
  assert.match(databaseMediaRoute, /isPublishedPropertyMedia\((?:sql|mediaSql),\s*rawUrl\)/);
  assert.match(databaseMediaRoute, /liaraMediaCacheControl\(meta\.pathname,\s*publishedReference\)/);
  assert.match(databaseMediaRoute, /createRangeNotSatisfiableResponse\(`bytes \*\/\$\{size\}`\)/);
  assert.match(databaseMediaRoute, /status:\s*range\s*\?\s*206\s*:\s*200/);
  assert.match(databaseMediaRoute, /"cross-origin-resource-policy": "same-origin"/);
  assert.match(databaseMediaRoute, /setHeader\(event, "Cross-Origin-Resource-Policy", "same-origin"\)/);
  assert.match(databaseMediaRoute, /headers\.vary = "Range"/);
});

test("successful image responses from the Liara/Divar proxy are same-origin isolated", () => {
  assert.equal((mediaProxyRoute.match(/"cross-origin-resource-policy": "same-origin"/g) ?? []).length, 2);
});

test("admin upload smoke fetches unpublished media with its session and checks private cache headers", () => {
  assert.match(uploadSmoke, /const anonymousResponse = await fetch\(new URL\(sameOriginPath, baseUrl\)\)/);
  assert.match(uploadSmoke, /anonymousResponse\.status !== 404/);
  assert.match(uploadSmoke, /if \(!sameOriginPath\)[\s\S]*?private property media must use the same-origin media endpoint/);
  assert.match(uploadSmoke, /mediaResponse = await call\(sameOriginPath\)/);
  assert.doesNotMatch(uploadSmoke, /await fetch\(mediaUrl\)/);
  assert.match(uploadSmoke, /mediaResponse\.status !== 200/);
  assert.match(uploadSmoke, /mediaResponse\.headers\.get\("cache-control"\) !== "private, no-store"/);
  assert.match(uploadSmoke, /mediaResponse\.headers\.get\("cross-origin-resource-policy"\) !== "same-origin"/);
  assert.match(uploadSmoke, /const isLiaraUrl =/);
  assert.match(uploadSmoke, /\/api\/media-proxy\?url=/);
});

test("private media paths cannot fall back to public Vercel Blob URLs", () => {
  assert.match(mediaAccess, /shouldUseLegacyBlobFallback\(pathname: string, blobAvailable: boolean\): boolean[\s\S]*?blobAvailable && databaseMediaVisibility\(pathname\) === "public"/);
  assert.match(mediaStore, /if \(shouldUseLegacyBlobFallback\(input\.pathname, blobConfigured\(\)\)\)/);
  assert.match(mediaStore, /else if \(shouldUseLegacyBlobFallback\(pathname, blobConfigured\(\)\)\)/);
});
