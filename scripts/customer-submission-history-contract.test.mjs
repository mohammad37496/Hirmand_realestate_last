import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("submission history query failures are shown as errors, not as a successful empty timeline", async () => {
  const route = await readFile(new URL("../server/routes/api/admin-customer-property-submissions.post.ts", import.meta.url), "utf8");
  const helper = await readFile(new URL("../src/lib/customer-submission-history.ts", import.meta.url), "utf8");
  const component = await readFile(new URL("../src/components/hirmand/admin-customer-property-submissions.tsx", import.meta.url), "utf8");

  assert.match(route, /loadCustomerSubmissionHistory\(sql, body\.id\)/);
  const historyBranch = route.split('if (action === "history")')[1]?.split('if (action === "set_priority")')[0] ?? "";
  assert.match(historyBranch, /loadCustomerSubmissionHistory\(sql, body\.id\)/);
  assert.doesNotMatch(historyBranch, /\.catch\(/);
  assert.doesNotMatch(helper, /\.catch\(/);
  assert.match(component, /setHistoryError\(message\)/);
  assert.match(component, /historyError \?/);
  assert.match(component, /role="alert"/);
  assert.doesNotMatch(component, /setHistoryEvents\(\[\]\);\s*toast\.error/);
});
