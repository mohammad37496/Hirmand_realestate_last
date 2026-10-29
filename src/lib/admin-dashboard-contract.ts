type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasNumericFields(value: unknown, fields: string[]): boolean {
  return isRecord(value) && fields.every((field) => typeof value[field] === "number" && Number.isFinite(value[field]));
}

/** Prevent malformed API responses from crashing dashboard rendering and exports. */
export function isAdminDashboardPayload(value: unknown): boolean {
  if (!isRecord(value)) return false;

  return (
    hasNumericFields(value.properties, ["total", "published", "draft", "archived", "featured", "withoutImages", "newLast7", "incomplete"]) &&
    hasNumericFields(value.consultants, ["total", "active", "withFiles", "withLeads"]) &&
    hasNumericFields(value.leads, ["total", "new", "contacted", "follow_up", "visited", "contract", "closed", "spam", "today", "last7", "last30"]) &&
    Array.isArray(value.propertyTypes) &&
    Array.isArray(value.leadDays) &&
    hasNumericFields(value.music, ["total", "active", "sizeBytes"]) &&
    hasNumericFields(value.visitors, ["today", "last7", "last30", "pageviewsToday", "pageviewsLast7", "pageviewsLast30", "activeNow"]) &&
    Array.isArray(value.visitorDays) &&
    Array.isArray(value.topPages) &&
    Array.isArray(value.topProperties) &&
    Array.isArray(value.eventStats) &&
    Array.isArray(value.visitorSources) &&
    Array.isArray(value.consultantPerformance) &&
    hasNumericFields(value.leadSla, ["overdue", "newOver4Hours"]) &&
    hasNumericFields(value.followUps, ["due", "next7"]) &&
    Array.isArray(value.recentLeads)
  );
}
