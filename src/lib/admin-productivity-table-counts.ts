export type AdminProductivityTableCounts = {
  properties: number;
  leads: number;
  consultants: number;
  media: number;
  tasks: number;
};

type CountRow = { count: number | string | null };
type QueryRows = (statement: string) => Promise<CountRow[]>;

/** A failed table probe must fail the summary, not masquerade as a zero count. */
export async function loadAdminProductivityTableCounts(query: QueryRows): Promise<AdminProductivityTableCounts> {
  const [properties, leads, consultants, media, tasks] = await Promise.all([
    query("select count(*)::int as count from properties"),
    query("select count(*)::int as count from leads"),
    query("select count(*)::int as count from consultants"),
    query("select count(*)::int as count from media_objects"),
    query("select count(*)::int as count from admin_tasks"),
  ]);

  return {
    properties: Number(properties[0]?.count) || 0,
    leads: Number(leads[0]?.count) || 0,
    consultants: Number(consultants[0]?.count) || 0,
    media: Number(media[0]?.count) || 0,
    tasks: Number(tasks[0]?.count) || 0,
  };
}
