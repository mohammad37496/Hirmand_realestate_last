import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../src/components/hirmand/properties-map.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/properties-divar-redesign.css", import.meta.url), "utf8");

test("cluster popups expose previous and next member controls with touch-sized targets", () => {
  assert.match(component, /className="pf-map-cluster-navigation"/);
  assert.match(component, /aria-label="فایل قبلی در خوشه"/);
  assert.match(component, /aria-label="فایل بعدی در خوشه"/);
  assert.match(component, /adjacentClusterPropertyId\(selectedMapMarker\.items, selectedPropertyId, -1\)/);
  assert.match(component, /adjacentClusterPropertyId\(selectedMapMarker\.items, selectedPropertyId, 1\)/);
  assert.match(styles, /\.pf-map-cluster-navigation button\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s);
});
