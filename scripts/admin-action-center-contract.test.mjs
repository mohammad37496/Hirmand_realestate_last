import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(
  new URL("../src/components/hirmand/admin-action-center.tsx", import.meta.url),
  "utf8",
);

test("admin action-center query failures do not masquerade as an empty queue", () => {
  const loadStart = component.indexOf("const load = useCallback(async () => {");
  const loadEnd = component.indexOf("  }, []);", loadStart);
  const load = component.slice(loadStart, loadEnd);

  assert.match(component, /const \[loadError, setLoadError\] = useState\(""\)/);
  assert.match(load, /setLoadError\(""\)/);
  assert.match(load, /!result\.summary \|\| !Array\.isArray\(result\.items\)/);
  assert.match(load, /setLoadError\("بارگذاری مرکز اقدام امروز ناموفق بود/);
  assert.doesNotMatch(load, /setItems\(\[\]\)/);
  assert.match(component, /className="admin-empty admin-action-center-error" role="alert"/);
  assert.match(component, /onClick=\{\(\) => void load\(\)\}/);
  assert.match(component, /items\.length === 0 && loadError \? null/);
});
