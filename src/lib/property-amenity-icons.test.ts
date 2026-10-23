import assert from "node:assert/strict";
import test from "node:test";
import {
  PROPERTY_COOLING_OPTIONS,
  PROPERTY_HEATING_OPTIONS,
  PROPERTY_OTHER_AMENITY_OPTIONS,
  type PropertyCoolingSystem,
  type PropertyHeatingSystem,
  type PropertyOtherAmenity,
} from "./property-options.ts";
import {
  getPropertyFeatureIcon,
  PROPERTY_COOLING_SYSTEM_ICONS,
  PROPERTY_HEATING_SYSTEM_ICONS,
  PROPERTY_OTHER_AMENITY_ICONS,
} from "./property-amenity-icons.ts";
import { ArrowUpDown, CarFront, Sparkles } from "lucide-react";

test("every persisted additional-amenity key and label resolves to its mapped icon", () => {
  assert.equal(
    Object.keys(PROPERTY_OTHER_AMENITY_ICONS).length,
    PROPERTY_OTHER_AMENITY_OPTIONS.length,
  );

  for (const option of PROPERTY_OTHER_AMENITY_OPTIONS) {
    const expected = PROPERTY_OTHER_AMENITY_ICONS[option.value as PropertyOtherAmenity];
    assert.equal(getPropertyFeatureIcon(option.value), expected, option.value);
    assert.equal(getPropertyFeatureIcon(option.label), expected, option.label);
  }
});

test("stored cooling and heating keys, labels, and namespaced values resolve to their category icons", () => {
  for (const option of PROPERTY_COOLING_OPTIONS) {
    const expected = PROPERTY_COOLING_SYSTEM_ICONS[option.value as PropertyCoolingSystem];
    assert.equal(getPropertyFeatureIcon(option.value), expected, `cooling: ${option.value}`);
    assert.equal(getPropertyFeatureIcon(option.label), expected, option.label);
    assert.equal(getPropertyFeatureIcon(`cooling:${option.value}`), expected, option.value);
  }

  for (const option of PROPERTY_HEATING_OPTIONS) {
    const expected = PROPERTY_HEATING_SYSTEM_ICONS[option.value as PropertyHeatingSystem];
    assert.equal(getPropertyFeatureIcon(option.value), expected, `heating: ${option.value}`);
    assert.equal(getPropertyFeatureIcon(option.label), expected, option.label);
    assert.equal(getPropertyFeatureIcon(`heating:${option.value}`), expected, option.value);
  }
});

test("legacy free-text property features use semantic icons where possible", () => {
  assert.equal(getPropertyFeatureIcon("پارکینگ"), CarFront);
  assert.equal(getPropertyFeatureIcon("آسانسور"), ArrowUpDown);
  assert.equal(getPropertyFeatureIcon("ویژگی خاص واردشده توسط مشاور"), Sparkles);
});
