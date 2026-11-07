import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [protocol, propertyRoute, areaRoute, customerRoute] = await Promise.all([
  readFile(new URL("src/lib/chunked-upload.server.ts", root), "utf8"),
  readFile(new URL("server/routes/api/upload.post.ts", root), "utf8"),
  readFile(new URL("server/routes/api/area-upload.post.ts", root), "utf8"),
  readFile(new URL("server/routes/api/customer-property-upload.post.ts", root), "utf8"),
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
