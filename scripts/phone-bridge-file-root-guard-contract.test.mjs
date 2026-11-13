import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(path, "utf8");
const server = read("src/lib/admin-phone-bridge-remote.ts");
const service = read("android/app/src/main/java/ir/hirmand/phonebridge/remote/RemoteControlService.kt");
const activity = read("android/app/src/main/java/ir/hirmand/phonebridge/remote/RemoteFileManagerActivity.kt");
const guard = read("android/app/src/main/java/ir/hirmand/phonebridge/remote/RemoteFileUriGuard.kt");
const queue = read("src/lib/phone-bridge-remote-command-sql.ts");

test("server binds each download command to the indexed selected root", () => {
  assert.ok(server.includes("select root_uri from phone_bridge_file_entries where device_id=$1 and uri=$2 and is_directory=false"));
  assert.ok(server.includes("rootUri: downloadRootUri"));
  assert.ok(server.includes("expectedFile: { uri: data.uri, rootUri: downloadRootUri }"));
  assert.ok(queue.includes("input.expectedFile"));
  assert.ok(queue.includes("select root_uri from phone_bridge_file_entries where device_id=$1 and uri=$2 and is_directory=false"));
  const lock = queue.indexOf("select id from phone_bridge_devices where id=$1 for update");
  const fileCheck = queue.indexOf("select root_uri from phone_bridge_file_entries");
  const activeCheck = queue.indexOf("select id from phone_bridge_remote_commands");
  const insert = queue.indexOf("insert into phone_bridge_remote_commands");
  assert.ok(lock >= 0 && fileCheck > lock && activeCheck > fileCheck && insert > activeCheck);
  assert.ok(server.includes("if (!selectedRootUri)"));
});

test("Android forwards the selected root and validates its persisted SAF grant before opening a file", () => {
  assert.ok(service.includes('putExtra("root_uri", payload.optString("rootUri"))'));
  assert.ok(activity.includes("persistedUriPermissions"));
  assert.ok(activity.includes("RemoteFileUriGuard.isAllowed"));
  assert.ok(activity.includes("DocumentsContract.findDocumentPath"));
  const guardIndex = activity.indexOf("RemoteFileUriGuard.isAllowed");
  const openIndex = activity.indexOf("contentResolver.openInputStream(uri)");
  assert.ok(guardIndex >= 0 && openIndex > guardIndex, "root containment must be checked before reading file bytes");
  assert.ok(guard.includes("persistedReadTreeUris"));
  assert.ok(guard.includes("rawAuthority"));
  assert.ok(activity.includes("DocumentsContract.getDocumentId(uri)"));
  assert.ok(activity.includes("documentPath?.path"));
  assert.ok(guard.includes("rootDocumentId in path && path.lastOrNull() == requestedDocumentId"));
});
