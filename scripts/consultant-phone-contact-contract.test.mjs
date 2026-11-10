import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("public phone actions use validated Iranian E.164 numbers", () => {
  const detail = read("../src/components/hirmand/property-detail-view.tsx");
  const profile = read("../src/routes/consultants.$id.tsx");
  const directory = read("../src/routes/consultants.index.tsx");
  const homepage = read("../src/components/hirmand/site-page.tsx");
  const callMenu = read("../src/components/hirmand/call-menu.tsx");
  const header = read("../src/components/hirmand/header.tsx");
  const inquiry = read("../src/components/hirmand/inquiry-form.tsx");
  const areas = `${read("../src/routes/areas.index.tsx")}\n${read("../src/routes/areas.$slug.tsx")}`;

  assert.match(detail, /toIranianE164Phone\(property\.contactPhone\)/);
  assert.match(detail, /href=\{`tel:\$\{propertyTel\}`\}/);
  assert.doesNotMatch(detail, /tel:\$\{property\.contactPhone\}/);
  assert.match(detail, /toIranianWhatsAppNumber\(phone\)/);
  assert.match(profile, /toIranianE164Phone\(person\.phone\)/);
  assert.doesNotMatch(profile, /tel:\$\{person\.phone\}/);
  assert.match(directory, /toIranianE164Phone\(person\.phone\)/);
  assert.doesNotMatch(directory, /tel:\$\{person\.phone\}/);
  assert.match(homepage, /toIranianE164Phone\(person\.phone\)/);
  assert.doesNotMatch(homepage, /tel:\$\{person\.phone\}/);
  assert.match(callMenu, /toIranianE164Phone\(person\.phone\)/);
  assert.match(header, /toIranianE164Phone\(person\.phone\)/);
  assert.match(inquiry, /selectedPhoneTel/);
  assert.match(areas, /siteMobileTel/);
});

test("fallback WhatsApp and JSON-LD telephone values share the validated phone normalizer", () => {
  const consultants = read("../src/lib/consultants.ts");
  const site = read("../src/lib/site.ts");
  const seo = read("../src/lib/seo.ts");

  assert.match(consultants, /toIranianWhatsAppNumber\(person\.phone\)/);
  assert.doesNotMatch(consultants, /person\.phone\.replace\(\/\^0\//);
  assert.match(site, /toIranianE164Phone\(person\.phone\)/);
  assert.match(seo, /toIranianE164Phone\(property\.contactPhone\)/);
  assert.match(seo, /sellerTelephone/);
  assert.doesNotMatch(seo, /property\.contactPhone\.replace\(\/\^0\//);
});

test("admin CRM and submission phone actions validate Iranian numbers before building tel or WhatsApp links", () => {
  const adminFiles = [
    "admin-agenda.tsx",
    "admin-customer-property-submissions.tsx",
    "admin-dashboard.tsx",
    "admin-lead-manager.tsx",
    "admin-lead-message-templates.tsx",
    "admin-matching-manager.tsx",
    "admin-owner-manager.tsx",
    "admin-sales-control-center.tsx",
  ].map((name) => [name, read(`../src/components/hirmand/${name}`)]);

  for (const [name, source] of adminFiles) {
    assert.match(source, /toIranianE164Phone/, `${name} must use the validated E.164 normalizer`);
    assert.doesNotMatch(source, /href=\{\s*["']tel:/, `${name} must not concatenate raw phone values into tel links`);
  }

  const messageTemplates = adminFiles.find(([name]) => name === "admin-lead-message-templates.tsx")[1];
  assert.match(messageTemplates, /toIranianWhatsAppNumber\(lead\.phone\)/);
  assert.doesNotMatch(messageTemplates, /normalizePhone\(lead\.phone\)/);
});
