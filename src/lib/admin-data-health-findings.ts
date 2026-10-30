type FindingIdRow = { id: number | string };
type QueryRows = (statement: string, params: unknown[]) => Promise<FindingIdRow[]>;

/** Resolve only an existing open finding and report whether a row changed. */
export async function resolveAdminDataHealthFinding(query: QueryRows, findingId: number): Promise<number | null> {
  const rows = await query(
    "update admin_data_health_findings set resolved_at=current_timestamp where id=$1 and resolved_at is null returning id",
    [findingId],
  );
  return rows[0] ? Number(rows[0].id) : null;
}
