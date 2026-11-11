import type { Sql } from "./db";

export type AdminDealStatus = "prospect" | "negotiation" | "agreement" | "contracted" | "completed" | "cancelled";
export type AdminCommissionSettlementStatus = "pending" | "approved" | "paid" | "cancelled";

type SqlExecutor = Pick<Sql, "query">;

const CONTRACTUAL_DEAL_STATUSES = ["contracted", "completed"] as const;

function requireTransaction(sql: Sql) {
  if (typeof sql.transaction !== "function") {
    throw new Error("Database transaction support is required for deal and settlement status changes.");
  }
  return sql.transaction;
}

/** Deal changes lock the deal before checking linked active settlements. */
export async function updateAdminDealStatusWithSettlementGuard(
  sql: Sql,
  dealId: string,
  nextStatus: AdminDealStatus,
) {
  const transaction = requireTransaction(sql);
  return transaction(async (tx: SqlExecutor) => {
    const lockedDeal = await tx.query<{ id: string }>(
      "select id from admin_deals where id=$1 for update",
      [dealId],
    );
    if (!lockedDeal[0]) return { kind: "missing" as const };

    // A separate READ COMMITTED statement sees settlement commits that happened
    // while this transaction waited for the deal row lock.
    const activeSettlements = await tx.query<{ id: string }>(
      "select id from admin_commission_settlements where deal_id=$1 and status<>'cancelled' limit 1",
      [dealId],
    );
    if (activeSettlements[0] && !CONTRACTUAL_DEAL_STATUSES.includes(nextStatus as typeof CONTRACTUAL_DEAL_STATUSES[number])) {
      return { kind: "settlement_exists" as const };
    }

    const updated = await tx.query<{ id: string }>(
      "update admin_deals set status=$2,updated_at=current_timestamp where id=$1 returning id",
      [dealId, nextStatus],
    );
    return updated[0] ? { kind: "updated" as const } : { kind: "missing" as const };
  });
}

/**
 * Settlement changes use the same deal → settlement lock order as deal changes,
 * settlement creation and deletion. Cancelled → pending is therefore safe
 * against a concurrent deal downgrade.
 */
export async function updateCommissionSettlementStatusWithDealGuard(
  sql: Sql,
  settlementId: string,
  nextStatus: AdminCommissionSettlementStatus,
) {
  const transaction = requireTransaction(sql);
  return transaction(async (tx: SqlExecutor) => {
    // Read the immutable link first without locking the settlement. Locking it
    // before the deal would invert the global lock order.
    const reference = await tx.query<{ deal_id: string | null }>(
      "select deal_id from admin_commission_settlements where id=$1 limit 1",
      [settlementId],
    );
    if (!reference[0]) return { kind: "missing" as const };
    const dealId = reference[0].deal_id;

    // Legacy rows without a deal link may be cancelled for cleanup, but they
    // must never be reactivated, approved or paid as a real commission.
    if (!dealId && nextStatus !== "cancelled") return { kind: "deal_required" as const };

    if (dealId) {
      const lockedDeal = await tx.query<{ status: string }>(
        "select status from admin_deals where id=$1 for update",
        [dealId],
      );
      if (nextStatus !== "cancelled" && (!lockedDeal[0] || !CONTRACTUAL_DEAL_STATUSES.includes(lockedDeal[0].status as typeof CONTRACTUAL_DEAL_STATUSES[number]))) {
        return { kind: "deal_not_contractual" as const };
      }
    }

    const lockedSettlement = await tx.query<{ deal_id: string | null }>(
      "select deal_id from admin_commission_settlements where id=$1 for update",
      [settlementId],
    );
    if (!lockedSettlement[0]) return { kind: "missing" as const };
    if (lockedSettlement[0].deal_id !== dealId) return { kind: "stale" as const };

    if (dealId && nextStatus !== "cancelled") {
      const activeSettlement = await tx.query<{ id: string }>(
        "select id from admin_commission_settlements where deal_id=$1 and id<>$2 and status<>'cancelled' limit 1",
        [dealId, settlementId],
      );
      if (activeSettlement[0]) return { kind: "duplicate_active" as const };
    }

    const updated = await tx.query<{ id: string }>(
      "update admin_commission_settlements set status=$2,paid_at=case when $2='paid' then coalesce(paid_at,current_timestamp) else null end,updated_at=current_timestamp where id=$1 and (status=$2 or (status='pending' and $2 in ('approved','cancelled')) or (status='approved' and $2 in ('paid','cancelled')) or (status='cancelled' and $2='pending')) returning id",
      [settlementId, nextStatus],
    );
    return updated[0] ? { kind: "updated" as const } : { kind: "invalid_transition" as const };
  });
}
