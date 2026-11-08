import { z } from "zod";
import type { Sql } from "./db.ts";

export const adminCommissionStatusSchema = z.enum(["pending", "approved", "paid", "cancelled"]);

export type AdminCommissionStatusUpdateResult =
  | { kind: "invalid_status" }
  | { kind: "not_found" }
  | { kind: "updated" };

/** Validate the requested state before issuing any settlement mutation. */
export async function updateAdminCommissionStatus(
  sql: Pick<Sql, "query">,
  id: string,
  value: unknown,
): Promise<AdminCommissionStatusUpdateResult> {
  const parsed = adminCommissionStatusSchema.safeParse(value);
  if (!parsed.success) return { kind: "invalid_status" };

  const rows = await sql.query<{ id: string }>(
    "update admin_commission_settlements set status=$2,paid_at=case when $2='paid' then current_timestamp else paid_at end,updated_at=current_timestamp where id=$1 returning id",
    [id, parsed.data],
  );
  return rows.length === 1 ? { kind: "updated" } : { kind: "not_found" };
}
