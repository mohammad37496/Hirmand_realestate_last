import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesUploadSessionScope, uploadSessionScopePrefix } from "./upload-session-scope.ts";

test("matches only the configured upload kind and directory", () => {
  assert.equal(
    matchesUploadSessionScope(
      { kind: "customer-property-media", pathname: "properties/customer-submissions/123-photo.webp" },
      "customer-property-media",
      "properties/customer-submissions",
    ),
    true,
  );
  assert.equal(matchesUploadSessionScope({ kind: "audio", pathname: "music/track.mp3" }, "media", "properties/uploads"), false);
});

test("rejects directory-prefix collisions and empty directory paths", () => {
  assert.equal(matchesUploadSessionScope({ kind: "audio", pathname: "music-archive/track.mp3" }, "audio", "music"), false);
  assert.equal(matchesUploadSessionScope({ kind: "audio", pathname: "music/" }, "audio", "music"), false);
  assert.equal(matchesUploadSessionScope(null, "audio", "music"), false);
  assert.equal(matchesUploadSessionScope({ kind: "audio" }, "audio", "music"), false);
  assert.equal(uploadSessionScopePrefix("music///"), "music/");
});
