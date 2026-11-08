/**
 * Save a complete customer workspace snapshot only if its observed revision is
 * still current. PostgreSQL's single statement is the compare-and-swap boundary.
 * @param {{ query: (text: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>> }} sql
 * @param {string} userId
 * @param {{ favorites: unknown, favoriteMeta: unknown, savedSearches: unknown, recentProperties: unknown }} workspace
 * @param {string | null} expectedRevision
 * @returns {Promise<{ success: true, revision: string } | { success: false, conflict: true }>}
 */
export async function saveCustomerWorkspaceWithRevision(sql, userId, workspace, expectedRevision) {
  const values = [
    userId,
    JSON.stringify(workspace.favorites),
    JSON.stringify(workspace.favoriteMeta),
    JSON.stringify(workspace.savedSearches),
    JSON.stringify(workspace.recentProperties),
  ];
  const rows = expectedRevision === null
    ? await sql.query(
      `insert into customer_workspace(user_id,favorites,favorite_meta,saved_searches,recent_properties,updated_at)
       values($1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,current_timestamp)
       on conflict(user_id) do nothing returning revision::text as revision`,
      values,
    )
    : await sql.query(
      `update customer_workspace
       set favorites=$2::jsonb,favorite_meta=$3::jsonb,saved_searches=$4::jsonb,
           recent_properties=$5::jsonb,updated_at=current_timestamp,revision=revision+1
       where user_id=$1 and revision=$6::bigint
       returning revision::text as revision`,
      [...values, expectedRevision],
    );
  const row = rows[0];
  if (!row) return { success: false, conflict: true };
  return { success: true, revision: String(row.revision) };
}
