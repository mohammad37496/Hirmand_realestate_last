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
