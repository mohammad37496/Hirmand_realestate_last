import type { Sql } from "./db.ts";

type LeadStatusTransition = "contacted" | "closed";

/** Advance a CRM lead from its initial state only; submission review must not rewind an active pipeline. */
export async function transitionCustomerSubmissionLeadStatus(
  sql: Pick<Sql, "query">,
  leadId: string,
  nextStatus: LeadStatusTransition,
): Promise<boolean> {
  const rows = await sql.query<{ id: string }>(
    "update leads set status=$2, updated_at=current_timestamp where id=$1 and status='new' returning id",
    [leadId, nextStatus],
  );
  return rows.length === 1;
}

type ResubmittedLeadInput = {
  leadId: string;
  ownerName: string;
  ownerPhone: string;
  deal: string;
  propertyType: string;
  neighborhood: string;
  leadNote: string;
};

/** Refresh owner details while preserving progressed CRM status and its scheduled follow-up. */
export async function refreshCustomerSubmissionLeadAfterResubmit(
  sql: Pick<Sql, "query">,
  input: ResubmittedLeadInput,
): Promise<{ statusChanged: boolean } | null> {
  const leads = await sql.query<{ status: string }>(
    "select status from leads where id=$1 for update",
    [input.leadId],
  );
  if (!leads[0]) return null;

  const currentStatus = leads[0].status;
  const canReturnToNew = currentStatus === "new" || currentStatus === "closed";
  const nextStatus = canReturnToNew ? "new" : currentStatus;

  await sql.query(
    `update leads
        set status=$2,
            updated_at=current_timestamp,
            follow_up_at=case when $3 then current_timestamp + interval '2 hours' else follow_up_at end,
            name=$4,
            phone=$5,
            job='مالک',
            deal=$6,
            property_type=$7,
            neighborhood=$8,
            note=$9
      where id=$1`,
    [input.leadId, nextStatus, canReturnToNew, input.ownerName, input.ownerPhone, input.deal, input.propertyType, input.neighborhood, input.leadNote],
  );

  return { statusChanged: currentStatus === "closed" };
}
