import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { mapPropertyScheduleFields } from "./property-schedule-fields.ts";

const propertiesSource = await readFile(new URL("./properties.ts", import.meta.url), "utf8");

test("public property mapping never exposes scheduled publication timestamps", () => {
  const fields = mapPropertyScheduleFields({
    publish_at: "2026-12-01T09:00:00.000Z",
    unpublish_at: "2026-12-31T18:00:00.000Z",
  }, false);

  assert.deepEqual(fields, {
    scheduledPublishAt: null,
    scheduledUnpublishAt: null,
  });
});

test("admin property mapping retains scheduled publication timestamps", () => {
  const fields = mapPropertyScheduleFields({
    publish_at: "2026-12-01T09:00:00.000Z",
    unpublish_at: "2026-12-31T18:00:00.000Z",
  }, true);

  assert.deepEqual(fields, {
    scheduledPublishAt: "2026-12-01T09:00:00.000Z",
    scheduledUnpublishAt: "2026-12-31T18:00:00.000Z",
  });
});

test("public detail and list server functions use the non-admin property mapper", () => {
  const publicFunctions = [
    "listPublishedProperties",
    "listAreaPublishedProperties",
    "listPublishedPropertiesByContact",
    "listPublishedPropertiesByConsultant",
    "getPublishedPropertyByFileCode",
    "getPublishedPropertyById",
    "getPublishedProperty",
    "listPublishedPropertiesBySlugs",
    "listRelatedProperties",
    "matchPublishedPropertiesByBudget",
  ];

  for (const name of publicFunctions) {
    const start = propertiesSource.indexOf(`export const ${name} =`);
    assert.notEqual(start, -1, `missing public property function ${name}`);
    const nextExport = propertiesSource.indexOf("\nexport const ", start + 1);
    const implementation = propertiesSource.slice(start, nextExport === -1 ? undefined : nextExport);
    if (name === "listPublishedProperties" || name === "listAreaPublishedProperties") {
      assert.match(implementation, /loadPublishedProperties\(data\)/, `${name} should use the shared published-property mapper`);
    } else {
      assert.match(implementation, /mapProperty\(/, `${name} should map its response through mapProperty`);
    }
    assert.doesNotMatch(implementation, /mapProperty\([^)]*,\s*\{\s*admin:\s*true/, `${name} must not use admin mapping`);
  }

  const loaderStart = propertiesSource.indexOf("async function loadPublishedProperties(");
  const loaderEnd = propertiesSource.indexOf("\nexport const listPublishedProperties", loaderStart);
  assert.notEqual(loaderStart, -1, "missing shared published-property loader");
  assert.notEqual(loaderEnd, -1, "missing shared loader boundary");
  const loader = propertiesSource.slice(loaderStart, loaderEnd);
  assert.match(loader, /mapProperty\(row\)/, "shared published-property loader must use the public mapper");
  assert.doesNotMatch(loader, /mapProperty\([^)]*,\s*\{\s*admin:\s*true/, "shared loader must not use admin mapping");
});

test("admin property list and trash functions retain the admin mapping opt-in", () => {
  for (const name of ["listAdminProperties", "listAdminTrashProperties"]) {
    const start = propertiesSource.indexOf(`export const ${name} =`);
    assert.notEqual(start, -1, `missing admin property function ${name}`);
    const nextExport = propertiesSource.indexOf("\nexport const ", start + 1);
    const implementation = propertiesSource.slice(start, nextExport === -1 ? undefined : nextExport);
    assert.match(implementation, /mapProperty\(row,\s*\{\s*admin:\s*true\s*\}\)/, `${name} must retain admin schedule fields`);
  }
});

test("the shared property mapper delegates schedule fields using its admin guard", () => {
  const mapperStart = propertiesSource.indexOf("function mapProperty(");
  const mapperEnd = propertiesSource.indexOf("\nconst LIST_COLUMNS", mapperStart);
  assert.notEqual(mapperStart, -1);
  assert.notEqual(mapperEnd, -1);
  const mapper = propertiesSource.slice(mapperStart, mapperEnd);
  assert.match(mapper, /\.\.\.mapPropertyScheduleFields\(row, isAdmin\)/);
});
