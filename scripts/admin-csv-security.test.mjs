import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("admin CSV exports use the shared spreadsheet-safe cell encoder", () => {
  const cases = [
    ["src/components/hirmand/admin-dashboard.tsx", /import \{ csvCell \} from "@\/lib\/csv"/, /row\.map\(csvCell\)/],
    ["src/components/hirmand/admin-management-report.tsx", /import \{ csvCell \} from "@\/lib\/csv"/, /row\.map\(csvCell\)/],
    ["src/components/hirmand/admin-attendance-manager.tsx", /import \{ csvCell \} from "@\/lib\/csv"/, /row\.map\(csvCell\)/],
    ["src/components/hirmand/admin-partner-manager.tsx", /import \{ csvCell \} from "@\/lib\/csv"/, /csvCell\(value\)/],
    ["src/lib/divar-status.ts", /import \{ csvCell \} from "\.\/csv\.ts"/, /map\(csvCell\)/],
    ["server/routes/api/admin-customer-property-submissions.post.ts", /import \{ csvCell \} from "@\/lib\/csv"/, /map\(csvCell\)/],
    ["server/routes/api/leads-admin.post.ts", /import \{ csvCell \} from "@\/lib\/csv"/, /map\(csvCell\)/],
  ];

  for (const [path, importPattern, usagePattern] of cases) {
    const source = read(path);
    assert.match(source, importPattern, `${path} must import the shared CSV encoder`);
    assert.match(source, usagePattern, `${path} must use the shared CSV encoder`);
  }
});

test("admin CSV exports do not reintroduce local quote-only encoders", () => {
  const paths = [
    "src/components/hirmand/admin-dashboard.tsx",
    "src/components/hirmand/admin-management-report.tsx",
    "src/components/hirmand/admin-attendance-manager.tsx",
    "src/components/hirmand/admin-partner-manager.tsx",
    "src/lib/divar-status.ts",
    "server/routes/api/admin-customer-property-submissions.post.ts",
    "server/routes/api/leads-admin.post.ts",
  ];
  for (const path of paths) {
    assert.doesNotMatch(read(path), /function csvEscape\s*\(|const csvEscape\s*=|const csvCell\s*=\s*\(/, `${path} must not define a weaker local CSV encoder`);
  }
});
