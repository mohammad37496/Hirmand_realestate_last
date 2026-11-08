import type { Sql } from "./db";

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
  | { kind: "deal_not_found" }
  | { kind: "failed" };

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
  const transaction = requireTransaction(sql);
  return transaction(async (tx) => {
    if (input.dealId) {
      const deals = await tx.query<{ id: string }>(
        "select id from admin_deals where id=$1 limit 1 for key share",
        [input.dealId],
      );
      if (!deals[0]) return { kind: "deal_not_found" };
    }

    const rows = await tx.query<{ id: string }>(
      "insert into admin_commission_settlements(id,consultant,deal_id,commission_amount,consultant_share,office_share,status,note,created_by) values($1,$2,$3,$4,$5,$6,'pending',$7,$8) returning id",
      [input.id, input.consultant, input.dealId, input.commission, input.consultantShare, input.officeShare, input.note, input.createdBy],
    );
    return rows[0] ? { kind: "created", id: String(rows[0].id) } : { kind: "failed" };
  });
}
