import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const compare = readFileSync(new URL("../src/routes/compare.tsx", import.meta.url), "utf8");

test("property comparison renders every feature row once", () => {
  const tableBody = compare.slice(compare.indexOf("<tbody>"), compare.indexOf("</tbody>"));
  const labels = [...tableBody.matchAll(/<th>([^<]+)<\/th>/g)].map((match) => match[1].trim());
  assert.ok(labels.length > 10, "comparison should retain its full feature table");
  assert.equal(new Set(labels).size, labels.length, `comparison feature labels must be unique: ${labels.join(", ")}`);
  assert.ok(labels.includes("کاغذ دیواری"));
  assert.ok(labels.includes("انباری"));
});
