import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const properties = fs.readFileSync(new URL("../src/lib/properties.ts", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../src/routes/properties.$slug.tsx", import.meta.url), "utf8");

test("related properties keep the same transaction and rank matching, photo-backed listings first", () => {
  const relatedHandler = properties.slice(
    properties.indexOf("export const listRelatedProperties"),
    properties.indexOf("export const ", properties.indexOf("export const listRelatedProperties") + 1),
  );

  assert.match(relatedHandler, /transactionType:\s*z\.enum\(\["buy", "sell", "rent", "mortgage"\]\)/);
  assert.match(relatedHandler, /and transaction_type = \$3/);
  assert.match(relatedHandler, /and \(neighborhood = \$2 or property_type = \$4\)/);
  assert.match(relatedHandler, /jsonb_array_elements_text\([\s\S]*jsonb_typeof\(coalesce\(images, '\[\]'::jsonb\)\)/);
  assert.ok(relatedHandler.includes("media.url not like '/images/type-%'"));
  assert.ok(relatedHandler.includes("media.url not like '/images/fallback/%'"));
  assert.match(route, /transactionType:\s*property\.transactionType/);
});
