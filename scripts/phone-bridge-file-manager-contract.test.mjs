import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const admin = read("src/components/hirmand/_admin_impl.tsx");
const component = read("src/components/hirmand/admin-phone-bridge-file-manager.tsx");
const remote = read("src/lib/admin-phone-bridge-remote.ts");
const downloadRoute = read("server/routes/api/admin/phone-bridge/files/[id].get.ts");

test("Phone Bridge file manager is mounted only through the security.manage admin navigation", () => {
  assert.match(admin, /view: "phoneBridge"[\s\S]*?label: "فایل‌های دستگاه"/);
  assert.match(admin, /item\.view !== "phoneBridge" \|\| hasAdminPermission\(adminRole, "security\.manage"\)/);
  assert.match(admin, /view === "phoneBridge"[\s\S]*?<AdminPhoneBridgeFileManager \/>/);
  assert.ok(admin.includes('hasAdminPermission(adminRole, "security.manage") ? ('));
});

test("file manager can select a folder, browse paginated tree entries and download an approved file", () => {
  assert.match(component, /operation: "pick_folder"/);
  assert.match(component, /listPhoneBridgeFileEntries/);
  assert.match(component, /offset: targetPage \* PAGE_SIZE/);
  assert.match(component, /operation: "download", uri: entry\.uri/);
  assert.match(component, /\/api\/admin\/phone-bridge\/files\//);
  assert.match(component, /getPhoneBridgeRemoteCommand/);
  assert.match(component, /overflowX: "auto"/);
  assert.ok(component.includes("entriesRequestId.current"));
});

test("file-list server function enforces remote-control authorization and returns count plus offset pagination", () => {
  assert.match(remote, /export const listPhoneBridgeFileEntries/);
  assert.match(remote, /await requireRemoteControlAdmin\(\)/);
  assert.match(remote, /offset: z\.number\(\)\.int\(\)\.min\(0\)/);
  assert.match(remote, /count\(\*\)::int as total_count/);
  assert.match(remote, /order by relative_path asc,is_directory desc,id asc/);
  assert.ok(remote.includes('operation: data.operation'));
  assert.match(downloadRoute, /hasAdminPermission\(normalizeAdminRole\(claims\?\.role\), "security\.manage"\)/);
  assert.match(downloadRoute, /cache-control", "private, no-store"/);
  assert.match(remote, /totalCount: Number\(countRows\[0\]/);
});