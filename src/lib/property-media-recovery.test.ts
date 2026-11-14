import assert from "node:assert/strict";
import test from "node:test";
import {
  clearMediaFailure,
  nextUnfailedMediaIndex,
  recordMediaFailure,
} from "./property-media-recovery.ts";

test("gallery recovery advances to the next unfailed image in order", () => {
  const images = ["first.webp", "second.webp", "third.webp"];
  const failed = new Set<number>();

  assert.deepEqual(recordMediaFailure(images, failed, 0), {
    status: "advanced",
    nextIndex: 1,
  });
  assert.deepEqual([...failed], [0]);
});

test("duplicate exhaustion notifications do not skip a healthy next image", () => {
  const images = ["first.webp", "second.webp", "third.webp"];
  const failed = new Set<number>();

  assert.equal(recordMediaFailure(images, failed, 0).status, "advanced");
  assert.deepEqual(recordMediaFailure(images, failed, 0), { status: "ignored" });
  assert.deepEqual([...failed], [0]);
  assert.equal(nextUnfailedMediaIndex(images, failed, 0), 1);
});

test("a successful later load clears the failure so the image can be retried", () => {
  const images = ["first.webp", "second.webp", "third.webp"];
  const failed = new Set<number>();

  assert.equal(recordMediaFailure(images, failed, 0).status, "advanced");
  clearMediaFailure(failed, 0);
  assert.deepEqual(recordMediaFailure(images, failed, 0), {
    status: "advanced",
    nextIndex: 1,
  });
});

test("gallery recovery skips failed and empty entries, wraps once, and stops when exhausted", () => {
  assert.equal(
    nextUnfailedMediaIndex(["first.webp", "", "third.webp"], new Set([0]), 0),
    2,
  );
  assert.equal(nextUnfailedMediaIndex(["first.webp", "second.webp"], new Set([0, 1]), 0), null);
  assert.equal(nextUnfailedMediaIndex(["only.webp"], new Set(), 0), null);
});
