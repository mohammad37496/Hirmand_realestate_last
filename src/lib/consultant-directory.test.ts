import assert from "node:assert/strict";
import { test } from "node:test";
import { mergePublicConsultantDirectory } from "./consultant-directory.ts";

const bundled = [
  { id: "sheikh", isActive: true, name: "مدیر اول" },
  { id: "moradi", isActive: true, name: "مدیر دوم" },
];

test("an explicitly inactive core profile is not re-added from the bundled fallback", () => {
  const database = [
    { id: "sheikh", isActive: false, name: "مدیر اول غیرفعال" },
    { id: "other", isActive: true, name: "مشاور دیگر" },
  ];
  const result = mergePublicConsultantDirectory(database, bundled);
  assert.deepEqual(result.map((item) => item.id), ["other", "moradi"]);
});

test("an all-inactive database roster remains empty instead of restoring disabled profiles", () => {
  const database = bundled.map((item) => ({ ...item, isActive: false }));
  assert.deepEqual(mergePublicConsultantDirectory(database, bundled), []);
});

test("a missing database row still receives its bundled profile fallback", () => {
  const database = [{ id: "sheikh", isActive: true, name: "مدیر اول سفارشی" }];
  const result = mergePublicConsultantDirectory(database, bundled);
  assert.deepEqual(result.map((item) => item.id), ["sheikh", "moradi"]);
  assert.equal(result[0]?.name, "مدیر اول سفارشی");
});

test("profile identifiers are matched case-insensitively", () => {
  const database = [{ id: "SHEIKH", isActive: false, name: "مدیر اول" }];
  const result = mergePublicConsultantDirectory(database, bundled);
  assert.deepEqual(result.map((item) => item.id), ["moradi"]);
});

test("an empty database roster falls back to the bundled profiles", () => {
  assert.deepEqual(mergePublicConsultantDirectory([], bundled), bundled);
});
