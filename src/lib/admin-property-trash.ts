export type TrashedPropertyRow = {
  id: string;
  title: string | null;
  images: unknown;
  floor_plan_url: string | null;
};

type QueryRows = (statement: string, params: unknown[]) => Promise<TrashedPropertyRow[]>;

/** Delete only a row still in trash and return media references from the row actually deleted. */
export async function deleteTrashedProperty(query: QueryRows, propertyId: string): Promise<TrashedPropertyRow | null> {
  const rows = await query(
    "delete from properties where id = $1 and deleted_at is not null returning id, title, images, floor_plan_url",
    [propertyId],
  );
  return rows[0] ?? null;
}
