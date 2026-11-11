import { z } from "zod";
import type { Sql } from "./db.ts";
import { updateCommissionSettlementStatusWithDealGuard, type AdminCommissionSettlementStatus } from "./admin-deal-status-sql.ts";

export const adminCommissionStatusSchema = z.enum(["pending", "approved", "paid", "cancelled"]);

export type AdminCommissionStatusUpdateResult =
  | { kind: "invalid_status" }
  | { kind: "not_found" }
  | { kind: "deal_required" }
  | { kind: "deal_not_contractual" }
  | { kind: "duplicate_active" }
  | { kind: "invalid_transition" }
  | { kind: "stale" }
  | { kind: "updated" };

/** Validate the requested state before issuing any settlement mutation. */
export async function updateAdminCommissionStatus(
  sql: Sql,
  id: string,
  value: unknown,
): Promise<AdminCommissionStatusUpdateResult> {
  const parsed = adminCommissionStatusSchema.safeParse(value);
  if (!parsed.success) return { kind: "invalid_status" };

  const result = await updateCommissionSettlementStatusWithDealGuard(sql, id, parsed.data as AdminCommissionSettlementStatus);
  return result.kind === "missing" ? { kind: "not_found" as const } : result;
}
