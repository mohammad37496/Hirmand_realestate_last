import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("every Mobile Management API keeps its server-side security.manage 403 guard", () => {
  const endpoints = [
    {
      path: "../server/routes/api/admin/mobile-management/summary.get.ts",
      guard: "await requireSecurityAdmin(event)",
      before: "const sql = await getSql()",
    },
    {
      path: "../server/routes/api/admin/mobile-devices.get.ts",
      guard: 'hasAdminPermission(normalizeAdminRole(claims?.role), "security.manage")',
      before: "const sql = await getSql()",
    },
    {
      path: "../server/routes/api/admin/mobile-devices.post.ts",
      guard: "await requireSecurityAdmin(event)",
      before: "const body = (await readBody(event)",
    },
    {
      path: "../server/routes/api/admin/mobile-telemetry.get.ts",
      guard: "await requireSecurityAdmin(event)",
      before: "const sql = await getSql()",
    },
    {
      path: "../server/routes/api/admin/mobile-retention.post.ts",
      guard: 'hasAdminPermission(normalizeAdminRole(claims?.role), "security.manage")',
      before: "const sql = await getSql()",
    },
  ];

  for (const endpoint of endpoints) {
    const source = read(endpoint.path);
    assert.match(source, /statusCode:\s*403/, `${endpoint.path} must return HTTP 403 for denied roles`);
    assert.match(source, /hasAdminPermission\(normalizeAdminRole\(claims\?\.role\),\s*"security\.manage"\)/, `${endpoint.path} must use the canonical security.manage permission`);
    const guardIndex = source.indexOf(endpoint.guard);
    const protectedIndex = source.indexOf(endpoint.before);
    assert.notEqual(guardIndex, -1, `${endpoint.path} must execute its authorization guard`);
    assert.notEqual(protectedIndex, -1, `${endpoint.path} must contain the protected operation`);
    assert.ok(guardIndex < protectedIndex, `${endpoint.path} must authorize before protected data access`);
  }
});

test("Mobile Management client resolves the session role before mounting either page's data loaders", () => {
  const source = read("../src/components/hirmand/admin-mobile-management.tsx");
  assert.match(source, /hasAdminPermission\(normalizeAdminRole\(data\.role\),\s*"security\.manage"\)/);
  assert.match(source, /type AuthState = "checking" \| "authenticated" \| "unauthenticated" \| "forbidden"/);
  assert.equal([...source.matchAll(/useFleetData\(auth === "authenticated"\)/g)].length, 2);
  assert.equal([...source.matchAll(/if \(auth === "forbidden"\) return <AccessGate forbidden \/>/g)].length, 2);
});
