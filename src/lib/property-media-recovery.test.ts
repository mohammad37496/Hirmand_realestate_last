import assert from "node:assert/strict";
import test from "node:test";
import {
  clearMediaFailure,
  nextUnfailedMediaIndex,
  recordMediaFailure,
} from "./property-media-recovery.ts";

test("gallery recovery records the exhausted active image", () => {
  const images = ["first.webp", "second.webp", "third.webp"];
  const failed = new Set<number>();

  assert.equal(recordMediaFailure(images, failed, 0), true);
  assert.deepEqual([...failed], [0]);
});

test("duplicate exhaustion notifications do not skip a healthy next image", () => {
  const images = ["first.webp", "second.webp", "third.webp"];
  const failed = new Set<number>();

  assert.equal(recordMediaFailure(images, failed, 0), true);
  assert.equal(recordMediaFailure(images, failed, 0), false);
  assert.deepEqual([...failed], [0]);
});

test("a successful later load clears the failure so the image can be retried", () => {
  const images = ["first.webp", "second.webp", "third.webp"];
  const failed = new Set<number>();

  assert.equal(recordMediaFailure(images, failed, 0), true);
  clearMediaFailure(failed, 0);
  assert.equal(recordMediaFailure(images, failed, 0), true);
});

test("empty and out-of-range entries are not recorded as failed", () => {
  const images = ["first.webp", "", "third.webp"];
  const failed = new Set<number>();
  assert.equal(recordMediaFailure(images, failed, 1), false);
  assert.equal(recordMediaFailure(images, failed, -1), false);
  assert.equal(recordMediaFailure(images, failed, 3), false);
  assert.deepEqual([...failed], []);
});

test("gallery recovery advances to the next healthy image and wraps around", () => {
  const images = ["first.webp", "second.webp", "", "fourth.webp"];
  const failed = new Set<number>([0, 1]);

  assert.equal(nextUnfailedMediaIndex(images, failed, 1), 3);
  assert.equal(nextUnfailedMediaIndex(images, new Set([0, 3]), 3), 1);
});

test("gallery recovery returns no next image when every usable image failed", () => {
  const images = ["first.webp", "", "third.webp"];
  const failed = new Set<number>([0, 2]);

  assert.equal(nextUnfailedMediaIndex(images, failed, 2), null);
  assert.equal(nextUnfailedMediaIndex(images, failed, -1), null);
});
