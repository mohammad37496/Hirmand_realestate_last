import assert from "node:assert/strict";
import test from "node:test";
import { stripPrivatePropertyDraftFields } from "./property-draft-storage.ts";

test("browser property drafts omit owner details, exact address, coordinates, and internal notes", () => {
  const input = {
    title: "آپارتمان نمونه",
    address: "نشانی دقیق خصوصی",
    latitude: 32.611518,
    longitude: 51.620826,
    ownerName: "مالک خصوصی",
    ownerPhone: "09120000000",
    ownerInfo: "شرایط محرمانه مالک",
    internalNote: "یادداشت داخلی",
    savedAt: "2026-10-18T10:00:00.000Z",
  };

  const safe = stripPrivatePropertyDraftFields(input);

  assert.equal(safe.title, input.title);
  assert.equal(safe.savedAt, input.savedAt);
  for (const key of [
    "address",
    "latitude",
    "longitude",
    "ownerName",
    "ownerPhone",
    "ownerInfo",
    "internalNote",
  ]) {
    assert.equal(Object.hasOwn(safe, key), false, `${key} must not be stored in a browser draft`);
  }
});

test("private fields are stripped from legacy browser drafts too", () => {
  const legacyDraft = {
    title: "پیش‌نویس قبلی",
    address: "legacy private address",
    latitude: 32.6,
    longitude: 51.6,
    internalNote: "legacy note",
  };

  const safe = stripPrivatePropertyDraftFields(legacyDraft);
  assert.deepEqual(safe, { title: "پیش‌نویس قبلی" });
});
