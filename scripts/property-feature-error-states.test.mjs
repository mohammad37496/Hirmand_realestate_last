import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const openHouse = readFileSync(new URL("../src/components/hirmand/property-open-house.tsx", import.meta.url), "utf8");
const questions = readFileSync(new URL("../src/components/hirmand/property-questions.tsx", import.meta.url), "utf8");
const manifest = readFileSync(new URL("../package.json", import.meta.url), "utf8");

test("open-house load failures remain visible and can be retried", () => {
  assert.ok(openHouse.includes("loadError,setLoadError"));
  assert.ok(openHouse.includes("setLoadError(\"\")"));
  assert.ok(openHouse.includes("loadError&&!events.length?"));
  assert.ok(openHouse.includes("onClick={()=>void load()}"));
  assert.ok(openHouse.includes('role="status"'));
  assert.ok(openHouse.includes("aria-busy={loading}"));
});

test("question-list load failures remain visible and can be retried", () => {
  assert.ok(questions.includes("loadError,setLoadError"));
  assert.ok(questions.includes("loadError&&!questions.length?"));
  assert.ok(questions.includes("onClick={()=>void load()}"));
  assert.ok(questions.includes("aria-busy={loading}"));
});

test("question submission remains available while the question list API is unavailable", () => {
  assert.ok(questions.includes('className="property-public-questions-form"'));
  assert.ok(!questions.includes("!loading&&!loadError?"));
  assert.ok(questions.indexOf('className="property-public-questions-form"') > questions.indexOf("loadError&&!questions.length?"));
});

test("property feature error-state tests run in the normal test suite", () => {
  assert.ok(manifest.includes("scripts/property-feature-error-states.test.mjs"));
});
