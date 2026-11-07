import assert from "node:assert/strict";
import { test } from "node:test";
import {
  matchesUploadSessionScope,
  uploadSessionScopePrefix,
} from "./upload-session-scope.ts";

test("accepts a session only for its exact kind and storage directory", () => {
  assert.equal(
    matchesUploadSessionScope(
      { kind: "media", pathname: "properties/uploads/123-photo.webp" },
      "media",
      "properties/uploads",
    ),
    true,
  );
  assert.equal(
    matchesUploadSessionScope(
      { kind: "media", pathname: "areas/uploads/123-photo.webp" },
      "media",
      "areas/uploads",
    ),
    true,
  );
});

test("rejects a same-kind session issued to a different upload route", () => {
  const propertySession = {
    kind: "media",
    pathname: "properties/uploads/123-photo.webp",
  };
  assert.equal(
    matchesUploadSessionScope(propertySession, "media", "areas/uploads"),
    false,
  );
  assert.equal(
    matchesUploadSessionScope(propertySession, "customer-property-media", "properties/uploads"),
    false,
  );
});

test("requires a directory boundary and a non-empty object key", () => {
  assert.equal(
    matchesUploadSessionScope(
      { kind: "media", pathname: "properties/uploads-archive/photo.webp" },
      "media",
      "properties/uploads",
    ),
    false,
  );
  assert.equal(
    matchesUploadSessionScope(
      { kind: "media", pathname: "properties/uploads/" },
      "media",
      "properties/uploads",
    ),
    false,
  );
});

test("fails closed for missing or malformed session records", () => {
  assert.equal(matchesUploadSessionScope(null, "media", "properties/uploads"), false);
  assert.equal(matchesUploadSessionScope(undefined, "media", "properties/uploads"), false);
  assert.equal(
    matchesUploadSessionScope({ kind: "media" }, "media", "properties/uploads"),
    false,
  );
  assert.equal(
    matchesUploadSessionScope({ kind: 3, pathname: "properties/uploads/photo.webp" }, "media", "properties/uploads"),
    false,
  );
});

test("normalizes trailing slashes without weakening the path boundary", () => {
  assert.equal(uploadSessionScopePrefix("music///"), "music/");
  assert.equal(
    matchesUploadSessionScope(
      { kind: "audio", pathname: "music/song.mp3" },
      "audio",
      "music///",
    ),
    true,
  );
});
