import test from "node:test";
import assert from "node:assert/strict";
import { findDivarCoordinates } from "./divar-coordinate-utils.ts";

test("keeps explicit latitude and longitude in the documented order", () => {
  assert.deepEqual(findDivarCoordinates({ latitude: 32.655, longitude: 51.668 }), {
    latitude: 32.655,
    longitude: 51.668,
  });
});

test("normalizes E6 values returned under generic coordinate keys", () => {
  assert.deepEqual(findDivarCoordinates({ lat: 32655000, lng: 51668000 }), {
    latitude: 32.655,
    longitude: 51.668,
  });
});

test("normalizes E7 values returned under generic coordinate keys", () => {
  assert.deepEqual(findDivarCoordinates({ latitude: 326550000, longitude: 516680000 }), {
    latitude: 32.655,
    longitude: 51.668,
  });
});

test("normalizes coordinates whose encoding is explicit in the key name", () => {
  assert.deepEqual(findDivarCoordinates({ latitude_e7: 326550000, longitude_e7: 516680000 }), {
    latitude: 32.655,
    longitude: 51.668,
  });
});

test("does not invent coordinates from arbitrary invalid values", () => {
  assert.equal(findDivarCoordinates({ latitude: 9123, longitude: 51668 }), null);
  assert.equal(findDivarCoordinates({ latitude: 999, longitude: 999 }), null);
  assert.equal(findDivarCoordinates({ latitude: "", longitude: 51.668 }), null);
});
