export type PropertyScheduleFields = {
  scheduledPublishAt: string | null;
  scheduledUnpublishAt: string | null;
};

/** Scheduled publication timestamps are internal administration metadata. */
export function mapPropertyScheduleFields(
  row: Record<string, unknown>,
  isAdmin: boolean,
): PropertyScheduleFields {
  if (!isAdmin) {
    return {
      scheduledPublishAt: null,
      scheduledUnpublishAt: null,
    };
  }

  return {
    scheduledPublishAt: row.publish_at ? new Date(String(row.publish_at)).toISOString() : null,
    scheduledUnpublishAt: row.unpublish_at ? new Date(String(row.unpublish_at)).toISOString() : null,
  };
}
