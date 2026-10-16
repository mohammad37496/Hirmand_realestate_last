import test from "node:test";
import assert from "node:assert/strict";
import {
  fitCoordinateBounds,
  isPointInsideBounds,
  isValidMapCoordinate,
  parseCoordinateBounds,
} from "./map-geometry.ts";

test("parses URL bounds in west,south,east,north order", () => {
  assert.deepEqual(parseCoordinateBounds("51.61,32.62,51.65,32.66"), [51.61, 32.62, 51.65, 32.66]);
});

test("rejects incomplete, blank, reversed, non-finite, and out-of-range bounds", () => {
  for (const raw of [
    "",
    "51.61,,51.65,32.66",
    "51.61,32.62,51.65",
    "51.65,32.62,51.61,32.66",
    "51.61,32.66,51.65,32.62",
    "181,32,182,33",
    "51,91,52,92",
    "51,32,NaN,33",
    "Infinity,32,52,33",
  ]) {
    assert.equal(parseCoordinateBounds(raw), null, raw);
  }
});

test("validates coordinate pairs by latitude/longitude ranges", () => {
  assert.equal(isValidMapCoordinate(32.65, 51.66), true);
  assert.equal(isValidMapCoordinate("32.65", "51.66"), true);
  assert.equal(isValidMapCoordinate(null, 51.66), false);
  assert.equal(isValidMapCoordinate("", 51.66), false);
  assert.equal(isValidMapCoordinate(91, 51.66), false);
  assert.equal(isValidMapCoordinate(32.65, 181), false);
  assert.equal(isValidMapCoordinate(Number.NaN, 51.66), false);
});

test("point checks use (latitude, longitude) and include boundary points", () => {
  const bounds = [51.61, 32.62, 51.65, 32.66];
  assert.equal(isPointInsideBounds(32.64, 51.63, bounds), true);
  assert.equal(isPointInsideBounds(32.62, 51.61, bounds), true);
  assert.equal(isPointInsideBounds(32.67, 51.63, bounds), false);
  assert.equal(isPointInsideBounds(32.64, 51.66, bounds), false);
  assert.equal(isPointInsideBounds(999, 999, bounds), false);
  assert.equal(isPointInsideBounds(32.64, 51.63, [51.65, 32.62, 51.61, 32.66]), false);
});

test("fit view centers the bounds and chooses a bounded zoom", () => {
  const bounds = [51.61, 32.62, 51.65, 32.66];
  const view = fitCoordinateBounds(bounds, 640, 700);
  assert.ok(view);
  assert.ok(Math.abs(view.longitude - 51.63) < 1e-9);
  assert.ok(view.latitude >= 32.62 && view.latitude <= 32.66);
  assert.ok(view.zoom >= 2 && view.zoom <= 18);
  assert.equal(fitCoordinateBounds([51, 32, 51, 33], 640, 700), null);
});

test("small screens still return a valid fit without invalid dimensions", () => {
  const view = fitCoordinateBounds([51.61, 32.62, 51.65, 32.66], 0, 0);
  assert.ok(view);
  assert.ok(Number.isFinite(view.latitude) && Number.isFinite(view.longitude));
});
