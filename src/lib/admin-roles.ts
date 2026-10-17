export type AdminRole = "owner" | "manager" | "sales" | "content" | "staff" | "viewer";

export type AdminPermission =
  | "property.manage"
  | "property.create"
  | "property.publish"
  | "divar.import"
  | "lead.manage"
  | "finance.manage"
  | "content.manage"
  | "area.manage"
  | "settings.manage"
  | "backup.manage"
  | "security.manage"
  | "accounts.manage"
  | "reports.view"
  | "deal.manage"
  | "commission.manage";

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  owner: "مالک سیستم",
  manager: "مدیر اجرایی",
  sales: "فروش و CRM",
  content: "محتوا و فایل‌ها",
  staff: "کارمند",
  viewer: "مشاهده‌گر",
};

export const ADMIN_ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  owner: [
    "property.manage",
    "property.create",
    "property.publish",
    "divar.import",
    "lead.manage",
    "finance.manage",
    "content.manage",
    "area.manage",
    "settings.manage",
    "backup.manage",
    "security.manage",
    "accounts.manage",
    "reports.view",
    "deal.manage",
    "commission.manage",
  ],
  manager: [
    "property.manage",
    "property.create",
    "property.publish",
    "divar.import",
    "lead.manage",
    "finance.manage",
    "content.manage",
    "area.manage",
    "settings.manage",
    "backup.manage",
    "security.manage",
    "reports.view",
    "deal.manage",
    "commission.manage",
  ],
  sales: [
    "property.manage",
    "property.create",
    "divar.import",
    "area.manage",
    "lead.manage",
    "reports.view",
    "deal.manage",
    "commission.manage",
  ],
  content: ["property.manage", "property.create", "content.manage", "area.manage", "reports.view"],
  // Employees can draft listings and maintain neighborhood editorial content, but cannot access system controls.
  staff: ["property.create", "lead.manage", "divar.import", "area.manage"],
  viewer: ["reports.view"],
};

export function normalizeAdminRole(value: unknown): AdminRole {
  switch (value) {
    case "owner":
    case "manager":
    case "sales":
    case "content":
    case "staff":
    case "viewer":
      return value;
    case "admin":
      return "owner";
    default:
      return "viewer";
  }
}

export function hasAdminPermission(role: AdminRole, permission: AdminPermission) {
  return ADMIN_ROLE_PERMISSIONS[role].includes(permission);
}
