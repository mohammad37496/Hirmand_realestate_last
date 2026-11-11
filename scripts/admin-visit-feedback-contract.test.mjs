import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("admin visit feedback fails closed and never renders a failed load as an empty result", async () => {
  const route = await readFile(new URL("../server/routes/api/admin-visit-feedback.post.ts", import.meta.url), "utf8");
  const component = await readFile(new URL("../src/components/hirmand/admin-visit-feedback.tsx", import.meta.url), "utf8");

  assert.match(route, /if \(dbSource === "unconfigured"\) \{\s*throw createError\(\{ statusCode: 503/);
  assert.doesNotMatch(route, /return \{ total: 0, average: 0, interested: 0, recent: \[\] \}/);
  assert.doesNotMatch(route, /\.catch\(/);
  assert.match(component, /const \[loadError, setLoadError\] = useState<string \| null>\(null\)/);
  assert.match(component, /setLoadError\(message\)/);
  assert.match(component, /role="alert"/);
  assert.match(component, /بارگذاری بازخوردها ناموفق بود/);
  assert.match(component, /onClick=\{\(\) => void load\(\)\}/);
  assert.match(component, /!loading && !loadError && data && !data\.recent\.length/);
  assert.match(component, /\{data \? \(/);
});
