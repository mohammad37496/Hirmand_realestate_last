import { hasAdminPermission, type AdminPermission, type AdminRole } from "./admin-roles.ts";

const notificationPermissions = [
  "lead.manage",
  "property.manage",
  "property.publish",
  "deal.manage",
  "divar.import",
  "team.manage",
  "reports.view",
] as const satisfies readonly AdminPermission[];

export function getAdminNotificationPermissions(role: AdminRole): AdminPermission[] {
  return notificationPermissions.filter((permission) => hasAdminPermission(role, permission));
}

export function getAdminNotificationAccountKey(accountId: string | null, role: AdminRole) {
  return accountId?.trim() || `legacy:${role}`;
}
