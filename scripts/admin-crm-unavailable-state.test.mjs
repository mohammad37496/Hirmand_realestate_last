import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("message-template API distinguishes an unconfigured database from an available template list", () => {
  const route = read("server/routes/api/admin-message-templates.post.ts");
  assert.match(route, /dbSource === "unconfigured"\) return \{ available: false, templates: \[\] \}/);
  assert.match(route, /available: true,\s*templates: rows\.map/);
});

test("message-template UI keeps API errors visible and disables writes until templates are available", () => {
  const ui = read("src/components/hirmand/admin-lead-message-templates.tsx");
  assert.match(ui, /setLoadError\(message\)/);
  assert.match(ui, /loadError \? <AdminErrorBanner/);
  assert.match(ui, /available === false && !loadError/);
  assert.match(ui, /disabled=\{saving \|\| available !== true\}/);
  assert.match(ui, /loadError && !templates\.length \? null/);
});
