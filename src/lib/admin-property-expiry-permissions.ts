import type { AdminPermission } from "./admin-roles.ts";

/** Return the minimum role permission needed for each property-expiry action. */
export function getPropertyExpiryActionPermission(action: string): AdminPermission | null {
  switch (action) {
    case "list":
    case "createTasks":
      return "property.manage";
    case "archiveExpired":
    case "extend":
      return "property.publish";
    default:
      return null;
  }
}
