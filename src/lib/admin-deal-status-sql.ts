export type AdminDealStatus = "prospect" | "negotiation" | "agreement" | "contracted" | "completed" | "cancelled";
export type AdminCommissionSettlementStatus = "pending" | "approved" | "paid" | "cancelled";

type SqlExecutor = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

const CONTRACTUAL_DEAL_STATUSES = ["contracted", "completed"] as const;

export async function updateAdminDealStatusWithSettlementGuard(
  tx: SqlExecutor,
  dealId: string,
  nextStatus: AdminDealStatus,
) {
  // Keep this as separate statements in one READ COMMITTED transaction. After
  // waiting for the row lock, the settlement query must get a fresh snapshot.
  const lockedDeal = await tx.query<{ id: string }>(
    "select id from admin_deals where id=$1 for update",
    [dealId],
  );
  if (!lockedDeal.length) return { kind: "missing" as const };

  const activeSettlements = await tx.query<{ id: string }>(
    "select id from admin_commission_settlements where deal_id=$1 and status<>'cancelled' limit 1",
    [dealId],
  );
  if (activeSettlements.length && !CONTRACTUAL_DEAL_STATUSES.includes(nextStatus as typeof CONTRACTUAL_DEAL_STATUSES[number])) {
    return { kind: "settlement_exists" as const };
  }

  const updated = await tx.query<{ id: string }>(
    "update admin_deals set status=$2,updated_at=current_timestamp where id=$1 returning id",
    [dealId, nextStatus],
  );
  return updated.length ? { kind: "updated" as const } : { kind: "missing" as const };
}

export async function updateCommissionSettlementStatusWithDealGuard(
  tx: SqlExecutor,
  settlementId: string,
  nextStatus: AdminCommissionSettlementStatus,
) {
  const reference = await tx.query<{ deal_id: string | null }>(
    "select deal_id from admin_commission_settlements where id=$1 limit 1",
    [settlementId],
  );
  if (!reference.length) return { kind: "missing" as const };
  const dealId = reference[0].deal_id;

  // Use the same deal → settlement lock order as deal status changes and
  // settlement creation. In particular, cancelled → pending is a reactivation
  // and must not race a deal downgrade.
  if (dealId) {
    const lockedDeal = await tx.query<{ status: string }>(
      "select status from admin_deals where id=$1 for update",
      [dealId],
    );
    if (nextStatus !== "cancelled" && (!lockedDeal.length || !CONTRACTUAL_DEAL_STATUSES.includes(lockedDeal[0].status as typeof CONTRACTUAL_DEAL_STATUSES[number]))) {
      return { kind: "deal_not_contractual" as const };
    }
  }

  const lockedSettlement = await tx.query<{ deal_id: string | null }>(
    "select deal_id from admin_commission_settlements where id=$1 for update",
    [settlementId],
  );
  if (!lockedSettlement.length) return { kind: "missing" as const };
  if (lockedSettlement[0].deal_id !== dealId) return { kind: "stale" as const };

  const updated = await tx.query<{ id: string }>(
    "update admin_commission_settlements set status=$2,paid_at=case when $2='paid' then coalesce(paid_at,current_timestamp) else null end,updated_at=current_timestamp where id=$1 and (status=$2 or (status='pending' and $2 in ('approved','cancelled')) or (status='approved' and $2 in ('paid','cancelled')) or (status='cancelled' and $2='pending')) returning id",
    [settlementId, nextStatus],
  );
  return updated.length ? { kind: "updated" as const } : { kind: "invalid_transition" as const };
}
