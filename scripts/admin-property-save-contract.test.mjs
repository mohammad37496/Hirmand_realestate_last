import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const requirePattern = (code, pattern, message) => assert.ok(pattern.test(code), message);

test("new properties default to draft while updates preserve status when omitted", () => {
  const code = read("src/lib/properties.ts");
  requirePattern(code, /status: z\.enum\(\["draft", "published", "archived"\]\)\.optional\(\)/, "status must remain optional so updates can preserve their current status");
  requirePattern(code, /resolvePropertySaveStatus\(data\.status, existing\?\.status\)/, "new records should default to draft while updates preserve their status");
  requirePattern(code, /requestedStatus = data\.status \?\? "draft"/, "staff-created records should default to draft");
  requirePattern(code, /description: z\.string\(\)\.trim\(\)\.max\(5000\)/, "draft descriptions must not have a global minimum length");
  requirePattern(code, /isPropertyDescriptionValidForStatus\(data\.status \?\? "draft", data\.description\)/, "description length must depend on save status");
  requirePattern(code, /areaM2: z\.number\(\)\.int\(\)\.min\(1\)/, "a supplied property area must be positive");
});

test("save boundary rejects stale records, checks exact duplicates, and revalidates critical published edits", () => {
  const code = read("src/lib/properties.ts");
  requirePattern(code, /if \(data\.id && !existing\)/, "stale or trashed property IDs must be rejected");
  requirePattern(code, /EXACT_PROPERTY_DUPLICATE_SQL/, "the server must check exact duplicates");
  requirePattern(code, /propertyDuplicateKeyChanged\(existing, \{ \.\.\.data, status: saveStatus \}\)/, "duplicate checks must cover changed identity fields");
  requirePattern(code, /publicationCriticalFieldsChanged\(existing, data\)/, "published edits must revalidate critical fields");
  const resolvedStatus = code.indexOf("const saveStatus = resolvePropertySaveStatus(data.status, existing?.status)");
  const publicationPermission = code.indexOf('if (saveStatus === "published")', resolvedStatus);
  assert.ok(resolvedStatus >= 0 && publicationPermission > resolvedStatus, "publication permission must be checked against the resolved persisted status");
});

test("consultant picker uses phone as the primary identity when a phone is present", () => {
  const code = read("src/components/hirmand/admin-consultant-picker.tsx");
  assert.match(code, /const active = phoneNorm\s*\?\s*normalizePhone\(person\.phone\) === phoneNorm\s*:/);
  assert.match(code, /phoneNorm\s*\?\s*consultants\.find\(\(p\) => normalizePhone\(p\.phone\) === phoneNorm\)/);
});
