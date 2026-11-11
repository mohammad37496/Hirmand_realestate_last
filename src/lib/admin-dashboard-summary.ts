type CountRow = Record<string, unknown> | undefined;

function hasNonNegativeCounts(row: CountRow, keys: readonly string[]) {
  return Boolean(row) && keys.every((key) => {
    const raw = row?.[key];
    if (raw == null || raw === "") return false;
    const value = Number(raw);
    return Number.isSafeInteger(value) && value >= 0;
  });
}

function hasNonNegativeValues(row: CountRow, keys: readonly string[]) {
  return Boolean(row) && keys.every((key) => {
    const raw = row?.[key];
    if (raw == null || raw === "") return false;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0;
  });
}

export function hasCompleteAdminDashboardSummaryRows(input: {
  propertyStats: CountRow[];
  leadStats: CountRow[];
  musicStats: CountRow[];
  followUps: CountRow[];
  consultantStats: CountRow[];
  leadSla: CountRow[];
}) {
  return hasNonNegativeCounts(input.propertyStats[0], [
    "total", "published", "draft", "archived", "featured", "without_images", "new_last7", "incomplete",
  ])
    && hasNonNegativeCounts(input.leadStats[0], [
      "total", "new", "contacted", "follow_up", "visited", "contract", "closed", "spam", "today", "last7", "last30",
    ])
    && hasNonNegativeCounts(input.musicStats[0], ["total", "active"])
    && hasNonNegativeValues(input.musicStats[0], ["size_bytes"])
    && hasNonNegativeCounts(input.followUps[0], ["due", "next7"])
    && hasNonNegativeCounts(input.consultantStats[0], ["total", "active", "consultants_with_files", "consultants_with_leads"])
    && hasNonNegativeCounts(input.leadSla[0], ["overdue", "new_over_4h"]);
}
