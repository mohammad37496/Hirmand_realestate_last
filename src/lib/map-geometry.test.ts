import assert from "node:assert/strict";
import { test } from "node:test";
import {
  coordinateBoundsCenter,
  isValidCoordinateBounds,
  isValidGeoPoint,
  parseCoordinateBounds,
  pointWithinBounds,
  zoomForCoordinateBounds,
} from "./map-geometry.ts";

test("coordinates and bounds use WGS84 longitude/latitude order consistently", () => {
  const bounds = [51.6, 32.5, 51.8, 32.7];
  assert.equal(isValidCoordinateBounds(bounds), true);
  assert.equal(isValidGeoPoint(32.6, 51.7), true);
  assert.equal(pointWithinBounds(32.6, 51.7, bounds), true);
  assert.equal(pointWithinBounds(32.8, 51.7, bounds), false);
  assert.equal(pointWithinBounds(32.6, 51.9, bounds), false);
  assert.equal(pointWithinBounds(32.5, 51.6, bounds), true, "box edges are inclusive");
});

test("URL bounds parser rejects missing, blank, malformed, out-of-range, and reversed bounds", () => {
  for (const input of [
    null,
    undefined,
    "",
    " ",
    "1,2,3",
    "1,,3,4",
    "east,2,3,4",
    "181,0,182,1",
    "-181,0,-180,1",
    "0,91,1,92",
    "0,-91,1,-90",
    "51.8,32.5,51.6,32.7",
    "51.6,32.7,51.8,32.5",
    "NaN,0,1,1",
    "Infinity,0,1,1",
  ]) {
    assert.equal(parseCoordinateBounds(input), undefined, String(input));
  }
});

test("parser returns a normalized W,S,E,N tuple and permits valid zero coordinates", () => {
  assert.deepEqual(parseCoordinateBounds(" 51.6, 32.5,51.8, 32.7 "), [51.6, 32.5, 51.8, 32.7]);
  assert.deepEqual(parseCoordinateBounds("0,-1,1,0"), [0, -1, 1, 0]);
});

test("point validation rejects null, strings, NaN, Infinity, and out-of-range coordinates", () => {
  for (const [latitude, longitude] of [
    [null, 51],
    [32, null],
    ["32", 51],
    [32, "51"],
    [NaN, 51],
    [32, Infinity],
    [-90.00001, 51],
    [32, 180.00001],
  ] as const) {
    assert.equal(isValidGeoPoint(latitude, longitude), false);
    assert.equal(pointWithinBounds(latitude, longitude, [-180, -90, 180, 90]), false);
  }
});

test("bounds center uses projected latitude and geographic longitude", () => {
  const center = coordinateBoundsCenter([51, 32, 53, 34]);
  assert.ok(center);
  assert.equal(center.longitude, 52);
  assert.ok(center.latitude > 32.99 && center.latitude < 33.01);
  assert.equal(coordinateBoundsCenter([53, 32, 51, 34]), undefined);
});

test("zoom fitting reconstructs a saved viewport and rejects invalid dimensions", () => {
  // These bounds correspond to a 920x640 Web-Mercator viewport at zoom 14.
  const world = 256 * 2 ** 14;
  const centerX = ((51.668 + 180) / 360) * world;
  const centerY = (0.5 - Math.log((1 + Math.sin(32.655 * Math.PI / 180)) / (1 - Math.sin(32.655 * Math.PI / 180))) / (4 * Math.PI)) * world;
  const inverse = (x: number, y: number) => {
    const n = Math.PI - (2 * Math.PI * y) / world;
    return { longitude: (x / world) * 360 - 180, latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)) };
  };
  const nw = inverse(centerX - 920 / 2, centerY - 640 / 2);
  const se = inverse(centerX + 920 / 2, centerY + 640 / 2);
  const bounds = [nw.longitude, se.latitude, se.longitude, nw.latitude];
  assert.equal(zoomForCoordinateBounds(bounds, 920, 640), 14);
  assert.ok((zoomForCoordinateBounds([51.6, 32.5, 51.8, 32.7], 600, 400, 48) ?? 0) >= 10);
  assert.equal(zoomForCoordinateBounds([51.8, 32.5, 51.6, 32.7], 600, 400), undefined);
  assert.equal(zoomForCoordinateBounds([51.6, 32.5, 51.8, 32.7], 0, 0), undefined);
});
