import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesUploadSessionScope, uploadSessionScopePrefix } from "./upload-session-scope.ts";

test("matches a session only for its intended kind and directory", () => {
  assert.equal(matchesUploadSessionScope({ kind: "customer-property-media", pathname: "properties/customer-submissions/123-photo.webp" }, "customer-property-media", "properties/customer-submissions"), true);
});

test("rejects sessions from another upload kind or path", () => {
  const session = { kind: "audio", pathname: "music/123-track.mp3" };
  assert.equal(matchesUploadSessionScope(session, "customer-property-media", "properties/customer-submissions"), false);
  assert.equal(matchesUploadSessionScope(session, "audio", "properties/customer-submissions"), false);
});

test("requires a directory boundary rather than a string-prefix match", () => {
  assert.equal(matchesUploadSessionScope({ kind: "audio", pathname: "music-archive/123-track.mp3" }, "audio", "music"), false);
  assert.equal(matchesUploadSessionScope({ kind: "audio", pathname: "music/" }, "audio", "music"), false);
});

test("fails closed for missing or malformed session fields", () => {
  assert.equal(matchesUploadSessionScope(null, "audio", "music"), false);
  assert.equal(matchesUploadSessionScope({ kind: "audio" }, "audio", "music"), false);
  assert.equal(matchesUploadSessionScope({ kind: 3, pathname: "music/file.mp3" }, "audio", "music"), false);
});

test("normalizes trailing slashes in upload prefixes", () => {
  assert.equal(uploadSessionScopePrefix("music///"), "music/");
});
