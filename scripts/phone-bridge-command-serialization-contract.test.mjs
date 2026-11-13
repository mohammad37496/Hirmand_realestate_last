import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const remote = readFileSync(resolve(process.cwd(), "src/lib/admin-phone-bridge-remote.ts"), "utf8");
const queue = readFileSync(resolve(process.cwd(), "src/lib/phone-bridge-remote-command-sql.ts"), "utf8");

test("admin Phone Bridge commands use the transactional queue helper", () => {
  assert.match(remote, /import \{ queuePhoneBridgeRemoteCommand \} from "@\/lib\/phone-bridge-remote-command-sql"/);
  assert.match(remote, /await queuePhoneBridgeRemoteCommand\(sql,\s*\{/);
  assert.doesNotMatch(remote, /select id from phone_bridge_remote_commands where device_id=\$1 and status in \('queued','running'\)/);
  assert.doesNotMatch(remote, /insert into phone_bridge_remote_commands/);
});

test("the queue locks the device row before checking and inserting active commands", () => {
  const transaction = queue.indexOf("await sql.transaction(async (tx) => {");
  const deviceLock = queue.indexOf("select id from phone_bridge_devices where id=$1 for update");
  const activeCheck = queue.indexOf("select id from phone_bridge_remote_commands where device_id=$1");
  const insert = queue.indexOf("insert into phone_bridge_remote_commands");
  assert.ok(transaction >= 0 && deviceLock > transaction);
  assert.ok(activeCheck > deviceLock);
  assert.ok(insert > activeCheck);
  assert.ok(queue.includes("requires transaction support"));
});
