import type { AdminPermission } from "./admin-roles.ts";

/** The approval action publishes a real listing and therefore needs publish access. */
export function getCustomerPropertySubmissionActionPermission(action: string): AdminPermission | null {
  switch (action) {
    case "list":
    case "reject":
    case "update":
    case "set_priority":
    case "history":
    case "bulk_set_priority":
    case "bulk_reject":
    case "export":
    case "assign_consultant":
      return "property.manage";
    case "approve":
      return "property.publish";
    default:
      return null;
  }
}
