import type { Sql } from "./db";

export type PublicLeadTrackingTarget = {
  leadId: string;
  trackingToken: string;
};

/** Resolve a legacy tracking token to the final lead while preserving the requested token. */
export async function resolvePublicLeadTrackingTarget(
  sql: Pick<Sql, "query">,
  trackingToken: string,
): Promise<PublicLeadTrackingTarget | null> {
  const rows = await sql.query<{
    id: string;
    public_tracking_token: string;
    merged_into_lead_id: string | null;
  }>(
    `with recursive lead_chain as (
      select id, merged_into_lead_id, public_tracking_token,
             array[id]::text[] as visited_ids, 0 as depth
      from leads
      where public_tracking_token = upper($1)
      union all
      select parent.id, parent.merged_into_lead_id, chain.public_tracking_token,
             chain.visited_ids || parent.id, chain.depth + 1
      from leads parent
      join lead_chain chain on parent.id = chain.merged_into_lead_id
      where chain.depth < 32 and not parent.id = any(chain.visited_ids)
    )
    select id, public_tracking_token, merged_into_lead_id
    from lead_chain
    order by depth desc
    limit 1`,
    [trackingToken],
  );

  const row = rows[0];
  // A non-null pointer here means a dangling reference, cycle, or chain deeper
  // than the supported bound. Never return an intermediate/closed alias.
  if (!row || row.merged_into_lead_id) return null;
  return {
    leadId: String(row.id),
    trackingToken: String(row.public_tracking_token),
  };
}

async function resolveLockedPublicLeadTrackingTarget(
  sql: Pick<Sql, "query">,
  trackingToken: string,
  lockClause: "for share" | "for update",
): Promise<PublicLeadTrackingTarget | null> {
  const originals = await sql.query<{
    id: string;
    public_tracking_token: string;
    merged_into_lead_id: string | null;
  }>(
    `select id, public_tracking_token, merged_into_lead_id
     from leads
     where public_tracking_token = upper($1)
     limit 1
     ${lockClause}`,
    [trackingToken],
  );
  const original = originals[0];
  if (!original) return null;

  const visited = new Set([String(original.id)]);
  let current = original;
  for (let depth = 0; depth < 32; depth += 1) {
    const nextId = current.merged_into_lead_id;
    if (!nextId) {
      return {
        leadId: String(current.id),
        trackingToken: String(original.public_tracking_token),
      };
    }
    if (visited.has(nextId)) return null;

    const parents = await sql.query<{
      id: string;
      public_tracking_token: string;
      merged_into_lead_id: string | null;
    }>(
      `select id, public_tracking_token, merged_into_lead_id from leads where id=$1 limit 1 ${lockClause}`,
      [nextId],
    );
    if (!parents[0]) return null;
    current = parents[0];
    visited.add(String(current.id));
  }

  return null;
}

/** Resolve and lock the alias chain for a write inside an existing transaction. */
export function lockPublicLeadTrackingTarget(
  sql: Pick<Sql, "query">,
  trackingToken: string,
): Promise<PublicLeadTrackingTarget | null> {
  return resolveLockedPublicLeadTrackingTarget(sql, trackingToken, "for update");
}

/** Resolve and share-lock the alias chain for a consistent read inside a transaction. */
export function sharePublicLeadTrackingTarget(
  sql: Pick<Sql, "query">,
  trackingToken: string,
): Promise<PublicLeadTrackingTarget | null> {
  return resolveLockedPublicLeadTrackingTarget(sql, trackingToken, "for share");
}
