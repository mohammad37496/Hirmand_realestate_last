import assert from "node:assert/strict";
import { test } from "node:test";
import {
  boundsEqual,
  fitBoundsToView,
  isValidWgs84Point,
  normalizeCoordinateBounds,
  parseCoordinateBounds,
  pointWithinBounds,
  project,
  unproject,
  viewportBoundsFromView,
} from "./map-geometry.ts";

test("map bbox follows the explicit west,south,east,north longitude/latitude order", () => {
  assert.deepEqual(
    parseCoordinateBounds("51.65,32.60,51.72,32.68"),
    [51.65, 32.6, 51.72, 32.68],
  );
  const view = fitBoundsToView([51.65, 32.6, 51.72, 32.68], 900, 600);
  assert.ok(view);
  assert.ok(Math.abs(view.latitude - 32.64) < 0.01);
  assert.ok(Math.abs(view.longitude - 51.685) < 1e-6);
});

test("invalid, reversed, incomplete and non-finite bounding boxes fail closed", () => {
  for (const invalid of [
    null,
    "",
    "51.6,32.6,51.7",
    "51.7,32.6,51.6,32.7",
    "51.6,32.8,51.7,32.7",
    "181,32,182,33",
    "51,91,52,92",
    "51,32,NaN,33",
    "51,,52,33",
  ]) assert.equal(parseCoordinateBounds(invalid), undefined, String(invalid));
  assert.equal(normalizeCoordinateBounds([51, 32, 51, 33]), undefined);
  assert.equal(fitBoundsToView([51, 32, 52, 33], 0, 400), null);
});

test("fit-to-bounds and viewport conversion preserve the full requested area on desktop and mobile", () => {
  const bounds = [51.6557426, 32.7353516, 51.6666031, 32.7431221] as const;
  for (const [width, height] of [[1280, 700], [430, 440], [375, 380]]) {
    const view = fitBoundsToView(bounds, width, height);
    assert.ok(view, `expected a fit for ${width}x${height}`);
    const visible = viewportBoundsFromView(view, width, height);
    assert.ok(visible);
    assert.ok(visible[0] <= bounds[0] + 1e-7, `west edge cropped at ${width}px`);
    assert.ok(visible[1] <= bounds[1] + 1e-7, `south edge cropped at ${width}px`);
    assert.ok(visible[2] >= bounds[2] - 1e-7, `east edge cropped at ${width}px`);
    assert.ok(visible[3] >= bounds[3] - 1e-7, `north edge cropped at ${width}px`);
    assert.ok(view.zoom >= 10 && view.zoom <= 18);
  }
});

test("project/unproject round-trip keeps the latitude and longitude axes separate", () => {
  const point = { latitude: 32.613102, longitude: 51.5545082 };
  const restored = unproject(project(point.latitude, point.longitude, 14), 14);
  assert.ok(Math.abs(restored.latitude - point.latitude) < 1e-8);
  assert.ok(Math.abs(restored.longitude - point.longitude) < 1e-8);
});

test("WGS84 point validation rejects nulls, infinities, NaN and out-of-range coordinates", () => {
  assert.equal(isValidWgs84Point(32.6, 51.6), true);
  assert.equal(isValidWgs84Point("32.6", "51.6"), true);
  assert.equal(isValidWgs84Point(null, 51.6), false);
  assert.equal(isValidWgs84Point("", 51.6), false);
  assert.equal(isValidWgs84Point(Number.NaN, 51.6), false);
  assert.equal(isValidWgs84Point(91, 51.6), false);
  assert.equal(isValidWgs84Point(32.6, 181), false);
});

test("spatial membership uses inclusive edges and rejects null or invalid points/bounds", () => {
  const bounds = [51.6, 32.6, 51.7, 32.7];
  assert.equal(pointWithinBounds(32.6, 51.6, bounds), true);
  assert.equal(pointWithinBounds(32.7, 51.7, bounds), true);
  assert.equal(pointWithinBounds(32.70001, 51.65, bounds), false);
  assert.equal(pointWithinBounds(null, 51.65, bounds), false);
  assert.equal(pointWithinBounds(32.65, 51.65, [51.7, 32.6, 51.6, 32.7]), false);
});

test("bounds equality tolerates URL rounding but not a different viewport", () => {
  assert.equal(boundsEqual([51.6, 32.6, 51.7, 32.7], [51.60000001, 32.6, 51.7, 32.7]), true);
  assert.equal(boundsEqual([51.6, 32.6, 51.7, 32.7], [51.61, 32.6, 51.7, 32.7]), false);
  assert.equal(boundsEqual(undefined, undefined), true);
  assert.equal(boundsEqual(undefined, [51.6, 32.6, 51.7, 32.7]), false);
});
