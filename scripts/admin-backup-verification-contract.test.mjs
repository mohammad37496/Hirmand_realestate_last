import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [route, component, helper] = await Promise.all([
  readFile(new URL("../server/routes/api/admin-backup.get.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/components/hirmand/admin-backup-manager.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/admin-backup-verification.ts", import.meta.url), "utf8"),
]);

test("backup verification delegates to fail-closed table checks and does not swallow export-log failures", () => {
  assert.match(route, /verifyAdminBackupTables\(sql\)/);
  assert.match(route, /createAdminBackupExport\(sql\)/);
  assert.doesNotMatch(route, /to_regclass[\s\S]{0,180}\.catch\(\(\)\s*=>\s*\[\]\)/);
  assert.doesNotMatch(route, /admin_backup_log[\s\S]{0,160}\.catch\(\(\)\s*=>\s*\{\}\)/);
  assert.match(helper, /"healthy"\s*\|\s*"degraded"\s*\|\s*"error"\s*\|\s*"timeout"/);
  assert.match(helper, /lastSuccessfulAt:\s*status === "healthy" \? checkedAt : null/);
  assert.match(helper, /count:\s*null/);
  assert.match(helper, /set transaction isolation level repeatable read/i);
  assert.match(helper, /await recordAdminBackupExport\(transactionSql, tableCounts\)/);
});

test("backup UI distinguishes failed history/verification from genuine empty history and supports retry", () => {
  assert.match(component, /historyError/);
  assert.match(component, /verificationError/);
  assert.match(component, /verification\?\.lastSuccessfulAt/);
  assert.match(component, /role="alert"/);
  assert.match(component, /!history\.length/);
  assert.match(component, /historyError \?/);
  assert.match(component, /item\.status === "timeout"/);
  assert.match(component, /data\.status === "error"/);
  assert.match(component, /تلاش دوباره/);
});
