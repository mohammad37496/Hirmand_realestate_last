import type { Sql } from "./db";
import { compareDecimalStrings } from "./decimal-money.ts";

export type DeleteAdminDealResult =
  | { kind: "deleted" }
  | { kind: "not_found" }
  | { kind: "settlements_exist" };

export type CreateAdminCommissionSettlementInput = {
  id: string;
  consultant: string;
  dealId: string | null;
  commission: string;
  consultantShare: string;
  officeShare: string;
  note: string;
  createdBy: string;
};

export type CreateAdminCommissionSettlementResult =
  | { kind: "created"; id: string }
  | { kind: "deal_required" }
  | { kind: "deal_not_found" }
  | { kind: "deal_not_contractual" }
  | { kind: "consultant_mismatch" }
  | { kind: "commission_mismatch" }
  | { kind: "duplicate_active" }
  | { kind: "failed" };

export type DeleteAdminCommissionSettlementResult =
  | { kind: "deleted" }
  | { kind: "not_found" }
  | { kind: "not_deletable" }
  | { kind: "stale" };

function requireTransaction(sql: Sql) {
  if (typeof sql.transaction !== "function") {
    throw new Error("Database transaction support is required for deal and settlement lifecycle operations.");
  }
  return sql.transaction;
}

/** A deal row lock serializes deletion against creation of a linked settlement. */
export async function deleteAdminDeal(sql: Sql, dealId: string): Promise<DeleteAdminDealResult> {
  const transaction = requireTransaction(sql);
  return transaction(async (tx) => {
    const deals = await tx.query<{ id: string }>(
      "select id from admin_deals where id=$1 limit 1 for update",
      [dealId],
    );
    if (!deals[0]) return { kind: "not_found" };

    const settlements = await tx.query<{ id: string }>(
      "select id from admin_commission_settlements where deal_id=$1 limit 1",
      [dealId],
    );
    if (settlements[0]) return { kind: "settlements_exist" };

    await tx.query("delete from admin_deal_documents where deal_id=$1", [dealId]);
    const deleted = await tx.query<{ id: string }>(
      "delete from admin_deals where id=$1 returning id",
      [dealId],
    );
    return deleted[0] ? { kind: "deleted" } : { kind: "not_found" };
  });
}

/** Lock a linked deal before inserting its settlement so a concurrent delete cannot orphan it. */
export async function createAdminCommissionSettlement(
  sql: Sql,
  input: CreateAdminCommissionSettlementInput,
): Promise<CreateAdminCommissionSettlementResult> {
  const dealId = input.dealId;
  if (!dealId) return { kind: "deal_required" };
  const transaction = requireTransaction(sql);
  return transaction(async (tx) => {
    const deals = await tx.query<{ id: string; status: string; consultant: string; commission: string | null }>(
      "select id,status,consultant,commission::text as commission from admin_deals where id=$1 for update",
      [dealId],
    );
    const deal = deals[0];
    if (!deal) return { kind: "deal_not_found" };
    if (deal.status !== "contracted" && deal.status !== "completed") {
      return { kind: "deal_not_contractual" };
    }
    if (String(deal.consultant ?? "").trim() !== input.consultant.trim()) {
      return { kind: "consultant_mismatch" };
    }
    const dealCommission = deal.commission == null ? "" : String(deal.commission);
    if (!/^\d{1,20}(?:\.\d+)?$/.test(input.commission) || !/^-?\d+(?:\.\d+)?$/.test(dealCommission) || compareDecimalStrings(dealCommission, input.commission) !== 0) {
      return { kind: "commission_mismatch" };
    }

    // Every linked settlement creator and status/deal mutator locks the deal
    // first. This serializes concurrent creates and gives this read a fresh
    // READ COMMITTED snapshot after any previous creator commits.
    const existing = await tx.query<{ id: string }>(
      "select id from admin_commission_settlements where deal_id=$1 and status<>'cancelled' limit 1",
      [dealId],
    );
    if (existing[0]) return { kind: "duplicate_active" };

    const rows = await tx.query<{ id: string }>(
      "insert into admin_commission_settlements(id,consultant,deal_id,commission_amount,consultant_share,office_share,status,note,created_by) values($1,$2,$3,$4,$5,$6,'pending',$7,$8) returning id",
      [input.id, input.consultant, dealId, input.commission, input.consultantShare, input.officeShare, input.note, input.createdBy],
    );
    return rows[0] ? { kind: "created", id: String(rows[0].id) } : { kind: "failed" };
  });
}

/** Delete only unsettled or cancelled rows, preserving approved/paid accounting history. */
export async function deleteAdminCommissionSettlement(
  sql: Sql,
  settlementId: string,
): Promise<DeleteAdminCommissionSettlementResult> {
  const transaction = requireTransaction(sql);
  return transaction(async (tx) => {
    const reference = await tx.query<{ deal_id: string | null }>(
      "select deal_id from admin_commission_settlements where id=$1 limit 1",
      [settlementId],
    );
    if (!reference[0]) return { kind: "not_found" };
    const dealId = reference[0].deal_id;

    // Match deal-status, settlement-status and create lock ordering.
    if (dealId) {
      await tx.query("select id from admin_deals where id=$1 for update", [dealId]);
    }
    const locked = await tx.query<{ deal_id: string | null; status: string }>(
      "select deal_id,status from admin_commission_settlements where id=$1 for update",
      [settlementId],
    );
    if (!locked[0]) return { kind: "not_found" };
    if (locked[0].deal_id !== dealId) return { kind: "stale" };
    if (locked[0].status !== "pending" && locked[0].status !== "cancelled") {
      return { kind: "not_deletable" };
    }

    const deleted = await tx.query<{ id: string }>(
      "delete from admin_commission_settlements where id=$1 returning id",
      [settlementId],
    );
    return deleted[0] ? { kind: "deleted" } : { kind: "not_found" };
  });
}
