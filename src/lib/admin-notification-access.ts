import { hasAdminPermission, normalizeAdminRole } from "./admin-roles.ts";

export type AdminNotificationAccess = {
  canManageLeads: boolean;
  canManageProperties: boolean;
  canViewOther: boolean;
};

export function getAdminNotificationAccess(role: unknown): AdminNotificationAccess {
  const normalized = normalizeAdminRole(role);
  return {
    canManageLeads: hasAdminPermission(normalized, "lead.manage"),
    canManageProperties: hasAdminPermission(normalized, "property.manage"),
    canViewOther: hasAdminPermission(normalized, "reports.view"),
  };
}

export function adminNotificationVisibilityPredicate(leadPermission: string, propertyPermission: string, otherPermission: string) {
  return `
    (kind in ('lead', 'visit', 'message') and ${leadPermission}::boolean)
    or (kind = 'property' and ${propertyPermission}::boolean)
    or (kind not in ('lead', 'visit', 'message', 'property') and ${otherPermission}::boolean)
  `;
}
