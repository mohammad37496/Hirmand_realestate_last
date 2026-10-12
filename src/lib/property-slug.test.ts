import assert from "node:assert/strict";
import test from "node:test";
import { decodeSlugCandidates, isCanonicalSlug, legacyIdFragments } from "./property-slug.ts";

const PERSIAN_SLUG = "آپارتمان-شهرک-ولیعصر-345555d4";

test("decode chain resolves plain, encoded and double-encoded Persian slugs", () => {
  assert.deepEqual(decodeSlugCandidates(PERSIAN_SLUG), [PERSIAN_SLUG]);

  const encoded = encodeURIComponent(PERSIAN_SLUG);
  assert.deepEqual(decodeSlugCandidates(encoded), [encoded, PERSIAN_SLUG]);

  const doubleEncoded = encodeURIComponent(encoded);
  assert.deepEqual(decodeSlugCandidates(doubleEncoded), [doubleEncoded, encoded, PERSIAN_SLUG]);
});

test("a canonical slug is not redirected, in any of its encoded forms", () => {
  assert.equal(isCanonicalSlug(PERSIAN_SLUG, PERSIAN_SLUG), true);
  assert.equal(isCanonicalSlug(encodeURIComponent(PERSIAN_SLUG), PERSIAN_SLUG), true);
  assert.equal(isCanonicalSlug(encodeURIComponent(encodeURIComponent(PERSIAN_SLUG)), PERSIAN_SLUG), true);
});

test("an outdated title on the same file is redirected to the canonical slug", () => {
  // Legacy share kept the id fragment but an older title.
  assert.equal(isCanonicalSlug("آپارتمان-قدیمی-345555d4", PERSIAN_SLUG), false);
  // Bare id fragment: `/file/:id` promoted to a slug path.
  assert.equal(isCanonicalSlug("345555d4", PERSIAN_SLUG), false);
});

test("a missing canonical slug never produces an empty redirect target", () => {
  assert.equal(isCanonicalSlug("/properties/whatever", ""), true);
  assert.equal(isCanonicalSlug("/properties/whatever", "   "), true);
});

test("malformed escapes stop the chain instead of throwing", () => {
  assert.deepEqual(decodeSlugCandidates("%E0%A4%A"), ["%E0%A4%A"]);
  assert.equal(isCanonicalSlug("%E0%A4%A", PERSIAN_SLUG), false);
});

test("legacy id fragments come from the tail of the slug, case-insensitively", () => {
  assert.deepEqual(legacyIdFragments([PERSIAN_SLUG]), ["345555d4"]);
  assert.deepEqual(legacyIdFragments(["آپارتمان-345555D4"]), ["345555d4"]);
  assert.deepEqual(legacyIdFragments([encodeURIComponent(PERSIAN_SLUG)]), ["345555d4"]);
  // No fragment, or a fragment that is not 8 hex chars → nothing to match on.
  assert.deepEqual(legacyIdFragments(["آپارتمان-شهرک-ولیعصر"]), []);
  assert.deepEqual(legacyIdFragments(["آپارتمان-345555d"]), []);
  assert.deepEqual(legacyIdFragments(["آپارتمان-345555d4a"]), []);
  // Duplicates collapse so the SQL array stays small.
  assert.deepEqual(legacyIdFragments([PERSIAN_SLUG, encodeURIComponent(PERSIAN_SLUG)]), ["345555d4"]);
});
