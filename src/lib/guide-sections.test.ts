import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGuideSections } from "./guide-sections.ts";
import { serializeJsonLd } from "./json-ld.ts";

test("legacy guide bodies without sections remain valid and use the points fallback", () => {
  assert.deepEqual(normalizeGuideSections(undefined), []);
  assert.deepEqual(normalizeGuideSections({ points: ["old content"] }), []);
});

test("long-form guide sections trim headings and paragraphs while preserving paragraph order", () => {
  assert.deepEqual(normalizeGuideSections([
    { heading: "  بررسی مدارک  ", paragraphs: ["  پاراگراف اول  ", "", "پاراگراف دوم"] },
  ]), [{ heading: "بررسی مدارک", paragraphs: ["پاراگراف اول", "پاراگراف دوم"] }]);
});

test("malformed and empty sections are ignored and persisted content is bounded", () => {
  const input = [
    null,
    { heading: "", paragraphs: ["بدون عنوان"] },
    { heading: "عنوان بدون متن", paragraphs: [" "] },
    { heading: "بخش معتبر", paragraphs: Array.from({ length: 10 }, (_, index) => `پاراگراف ${index + 1}`) },
    ...Array.from({ length: 14 }, (_, index) => ({ heading: `بخش ${index + 2}`, paragraphs: ["متن"] })),
  ];
  const sections = normalizeGuideSections(input);
  assert.equal(sections.length, 12);
  assert.equal(sections[0]?.paragraphs.length, 8);
  assert.equal(sections[0]?.paragraphs[7], "پاراگراف 8");
});

test("JSON-LD escapes script-breaking text and round-trips editor-controlled values", () => {
  const value = {
    headline: "</script><script>globalThis.compromised = true</script>",
    description: "<b>safe text</b> & more",
    nested: ["line\u2028separator", "paragraph\u2029separator"],
  };
  const serialized = serializeJsonLd(value);
  assert.doesNotMatch(serialized, /[<>&\u2028\u2029]/);
  assert.match(serialized, /\\u003c\/script/);
  assert.deepEqual(JSON.parse(serialized), value);
});
