import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { adminNotificationVisibilityPredicate, getAdminNotificationAccess } from "./admin-notification-access.ts";

test("notification visibility follows lead, property and report permissions", () => {
  assert.deepEqual(getAdminNotificationAccess("owner"), {
    canManageLeads: true,
    canManageProperties: true,
    canViewOther: true,
  });
  assert.deepEqual(getAdminNotificationAccess("sales"), {
    canManageLeads: true,
    canManageProperties: true,
    canViewOther: true,
  });
  assert.deepEqual(getAdminNotificationAccess("content"), {
    canManageLeads: false,
    canManageProperties: true,
    canViewOther: true,
  });
  assert.deepEqual(getAdminNotificationAccess("staff"), {
    canManageLeads: true,
    canManageProperties: false,
    canViewOther: false,
  });
  assert.deepEqual(getAdminNotificationAccess("viewer"), {
    canManageLeads: false,
    canManageProperties: false,
    canViewOther: true,
  });
});

test("notification queries and read-state mutations respect the role visibility filter", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table admin_notifications (id int primary key, kind text not null, read_at timestamptz);
      insert into admin_notifications (id, kind) values
        (1, 'lead'), (2, 'visit'), (3, 'message'), (4, 'property'), (5, 'system');
    `);
    const visibility = adminNotificationVisibilityPredicate("$1", "$2", "$3");
    const content = getAdminNotificationAccess("content");
    const contentRows = await db.query<{ kind: string }>(
      `select kind from admin_notifications where ${visibility} order by id`,
      [content.canManageLeads, content.canManageProperties, content.canViewOther],
    );
    assert.deepEqual(contentRows.rows.map((row) => row.kind), ["property", "system"]);

    const staff = getAdminNotificationAccess("staff");
    const staffRows = await db.query<{ kind: string }>(
      `select kind from admin_notifications where ${visibility} order by id`,
      [staff.canManageLeads, staff.canManageProperties, staff.canViewOther],
    );
    assert.deepEqual(staffRows.rows.map((row) => row.kind), ["lead", "visit", "message"]);

    const denied = await db.query<{ id: number }>(
      `update admin_notifications set read_at=current_timestamp where id=$1 and (${adminNotificationVisibilityPredicate("$2", "$3", "$4")}) returning id`,
      [1, content.canManageLeads, content.canManageProperties, content.canViewOther],
    );
    assert.deepEqual(denied.rows, []);
    const allowed = await db.query<{ id: number }>(
      `update admin_notifications set read_at=current_timestamp where id=$1 and (${adminNotificationVisibilityPredicate("$2", "$3", "$4")}) returning id`,
      [4, content.canManageLeads, content.canManageProperties, content.canViewOther],
    );
    assert.deepEqual(allowed.rows.map((row) => row.id), [4]);
  } finally {
    await db.close();
  }
});

test("unavailable notification storage is explicit and read-state writes fail closed", () => {
  const server = readFileSync(new URL("./admin-notifications.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../components/hirmand/admin-notification-center.tsx", import.meta.url), "utf8");

  assert.match(server, /available:\s*false/);
  assert.match(server, /available:\s*true/);
  assert.equal((server.match(/if \(dbSource === "unconfigured"\)\s*\{\s*throw new Error/g) ?? []).length, 2);
  assert.match(server, /adminNotificationVisibilityPredicate/);
  assert.match(ui, /result\.available !== true/);
  assert.match(ui, /if \(!result\.success\) throw new Error/);
  assert.match(ui, /setUnread\(null\)/);
  assert.match(ui, /unread === null/);
});
