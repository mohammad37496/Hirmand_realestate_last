import { randomUUID } from "node:crypto";
import type { Sql } from "./db.ts";
import { updatePendingCustomerPropertySubmissionReview } from "./customer-property-submission-review.ts";
import { resubmitCustomerPropertySubmission } from "./customer-property-submission-resubmit.ts";
import {
  refreshCustomerSubmissionLeadAfterResubmit,
  transitionCustomerSubmissionLeadStatus,
} from "./customer-submission-lead-status.ts";

type ResubmitAndSyncInput = {
  id: string;
  expectedUpdatedAt: string;
  ownerName: string;
  ownerPhone: string;
  propertyData: string;
  previousReviewNote: string;
  trackingToken: string;
  leadId: string | null;
  deal: string;
  propertyType: string;
  neighborhood: string;
  leadNote: string;
};

/** Keep the resubmission CAS, linked CRM lead, and owner-visible event in one transaction. */
export async function resubmitCustomerPropertySubmissionWithLeadSync(
  sql: Sql,
  input: ResubmitAndSyncInput,
): Promise<boolean> {
  if (typeof sql.transaction !== "function") {
    throw new Error("Database transaction support is required for customer resubmission.");
  }

  return sql.transaction(async (tx) => {
    const resubmitted = await resubmitCustomerPropertySubmission(tx, input);
    if (!resubmitted) return false;

    if (input.leadId) {
      const refreshedLead = await refreshCustomerSubmissionLeadAfterResubmit(tx, {
        leadId: input.leadId,
        ownerName: input.ownerName,
        ownerPhone: input.ownerPhone,
        deal: input.deal,
        propertyType: input.propertyType,
        neighborhood: input.neighborhood,
        leadNote: input.leadNote,
      });
      if (refreshedLead) {
        const activityType = refreshedLead.statusChanged ? "status" : "note";
        await tx.query(
          "insert into lead_activities (lead_id,activity_type,title,note,metadata) values ($1,$2,$3,$4,$5::jsonb)",
          [
            input.leadId,
            activityType,
            "اصلاح و ارسال مجدد ملک توسط مشتری",
            input.previousReviewNote || "مشتری اطلاعات ملک را اصلاح و دوباره برای بررسی ارسال کرد.",
            JSON.stringify({ submissionId: input.id, trackingToken: input.trackingToken }),
          ],
        );
      }
    }

    await tx.query(
      "insert into customer_property_submission_events (id,submission_id,action,note,metadata) values ($1,$2,'resubmit',$3,$4::jsonb)",
      [randomUUID(), input.id, "مشتری اطلاعات ملک را اصلاح و دوباره برای بررسی ارسال کرد.", JSON.stringify({ trackingToken: input.trackingToken })],
    );

    return true;
  });
}

/** Reject a batch as one unit, including each linked CRM lead and both timelines. */
export async function bulkRejectPendingCustomerPropertySubmissions(
  sql: Sql,
  input: { ids: string[]; reviewNote: string },
): Promise<number> {
  if (typeof sql.transaction !== "function") {
    throw new Error("Database transaction support is required for bulk rejection.");
  }

  return sql.transaction(async (tx) => {
    const targets = await tx.query<{ id: string; lead_id: string | null; updated_at_text: string }>(
      `select id,lead_id,updated_at::text as updated_at_text
         from customer_property_submissions
        where id = any($1::text[]) and status='pending'
        order by id
        for update`,
      [input.ids],
    );
    if (!targets.length) return 0;

    const leadIds = Array.from(new Set(targets.map((target) => target.lead_id).filter((id): id is string => Boolean(id)))).sort();
    if (leadIds.length) {
      await tx.query("select id from leads where id = any($1::text[]) order by id for update", [leadIds]);
    }

    for (const target of targets) {
      const updated = await updatePendingCustomerPropertySubmissionReview(tx, {
        action: "reject",
        id: target.id,
        expectedUpdatedAt: target.updated_at_text,
        reviewNote: input.reviewNote,
      });
      if (!updated) throw new Error("A locked pending submission changed before bulk rejection.");

      if (target.lead_id) {
        const statusChanged = await transitionCustomerSubmissionLeadStatus(tx, target.lead_id, "closed");
        if (statusChanged) {
          await tx.query(
            "insert into lead_activities (lead_id,activity_type,title,note,metadata) values ($1,'status',$2,$3,$4::jsonb)",
            [target.lead_id, "ثبت ملک رد شد", input.reviewNote || "درخواست ثبت ملک توسط کارشناس رد شد.", JSON.stringify({ submissionId: target.id, bulk: true })],
          );
        }
      }

      await tx.query(
        "insert into customer_property_submission_events (id,submission_id,action,note,metadata) values ($1,$2,'reject',$3,$4::jsonb)",
        [randomUUID(), target.id, input.reviewNote || "درخواست ثبت ملک رد شد.", JSON.stringify({ bulk: true })],
      );
    }

    return targets.length;
  });
}
