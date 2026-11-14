import type { Sql } from "./db";
import { publicPropertyVisibilitySql } from "./public-property-visibility.ts";
import type { PublicLeadActivity, PublicLeadFollowUp } from "./public-lead-intake.ts";
import { recordPublicLeadIntake, resolvePropertyLeadConsultant } from "./public-lead-intake.ts";

type PropertyVisitRequestInput = {
  propertyId: string;
  visitAt: string;
  trackingToken: string;
  name: string;
  phone: string;
  peopleCount: number | null;
  job: string;
  floorPreference: string;
  consultant: string;
  note: string;
  intake?: {
    activity: PublicLeadActivity | ((property: { id: string; title: string; property_type: string; neighborhood: string; contact_name: string; consultant_name?: string | null }) => PublicLeadActivity);
    followUp: PublicLeadFollowUp | ((property: { id: string; title: string; property_type: string; neighborhood: string; contact_name: string; consultant_name?: string | null }) => PublicLeadFollowUp);
  };
};

type PropertyVisitRequestResult =
  | { kind: "not_found" }
  | { kind: "conflict" }
  | { kind: "failed" }
  | {
      kind: "duplicate";
      id: string;
      trackingToken: string;
      property: { id: string; title: string; property_type: string; neighborhood: string; contact_name: string };
    }
  | {
      kind: "created";
      id: string;
      trackingToken: string;
      property: { id: string; title: string; property_type: string; neighborhood: string; contact_name: string };
    };

type PropertyVisitRescheduleResult =
  | { kind: "not_found" }
  | { kind: "not_reschedulable" }
  | { kind: "conflict" }
  | { kind: "failed" }
  | { kind: "updated" };

type PropertyVisitCancellationResult =
  | { kind: "cancelled" }
  | { kind: "not_cancellable" };

/** Check and create a visit request atomically while locking the property row. */
export async function createPropertyVisitRequest(
  sql: Sql,
  input: PropertyVisitRequestInput,
): Promise<PropertyVisitRequestResult> {
  if (typeof sql.transaction !== "function") {
    throw new Error("Database transaction support is required for property visit requests.");
  }

  return sql.transaction(async (transactionSql) => {
    const candidateRows = await transactionSql.query<{
      id: string;
      title: string;
      property_type: string;
      neighborhood: string;
      contact_name: string;
    }>(
      `select p.id, p.title, p.property_type, p.neighborhood, p.contact_name
         from properties p
        where p.id::text=$1 and ${publicPropertyVisibilitySql("p")}
          and p.availability_status not in ('sold','rented','unavailable')
        limit 1`,
      [input.propertyId],
    );
    if (!candidateRows[0]) return { kind: "not_found" };
    const consultant = await resolvePropertyLeadConsultant(
      transactionSql,
      candidateRows[0].id,
      candidateRows[0].contact_name || input.consultant,
    );
    // The resolver locks the consultant first, then the property. Re-read the
    // public/availability predicates while holding the property lock.
    const lockedRows = await transactionSql.query<{
      id: string; title: string; property_type: string; neighborhood: string; contact_name: string;
    }>(
      `select p.id,p.title,p.property_type,p.neighborhood,p.contact_name
         from properties p
        where p.id::text=$1 and ${publicPropertyVisibilitySql("p")}
          and p.availability_status not in ('sold','rented','unavailable')
        limit 1`,
      [candidateRows[0].id],
    );
    const lockedProperty = lockedRows[0];
    if (!lockedProperty) return { kind: "not_found" };
    const property = { ...lockedProperty, consultant_id: consultant.id, consultant_name: consultant.name };

    const duplicateRows = await transactionSql.query<{ id: string; public_tracking_token: string | null }>(
      "select id, public_tracking_token from leads where property_id::text=$1 and phone=$2 and visit_status in ('requested','confirmed') and visit_preferred_at=$3::timestamptz order by created_at desc limit 1",
      [property.id, input.phone, input.visitAt],
    );
    if (duplicateRows[0]) {
      const trackingToken = duplicateRows[0].public_tracking_token || input.trackingToken;
      if (!duplicateRows[0].public_tracking_token) {
        await transactionSql.query(
          "update leads set public_tracking_token=$2 where id=$1",
          [duplicateRows[0].id, trackingToken],
        );
      }
      return { kind: "duplicate", id: duplicateRows[0].id, trackingToken, property };
    }

    const conflictRows = await transactionSql.query<{ id: string }>(
      "select id from leads where property_id::text=$1 and visit_status in ('requested','confirmed') and abs(extract(epoch from (visit_preferred_at - $2::timestamptz))) < 2700 limit 1",
      [property.id, input.visitAt],
    );
    if (conflictRows[0]) return { kind: "conflict" };

    const rows = await transactionSql.query<{ id: string }>(
      "insert into leads (id, name, phone, people_count, job, deal, property_type, neighborhood, consultant, note, source, follow_up_at, floor_preference, property_id, visit_preferred_at, visit_requested_at, visit_status, public_tracking_token, consultant_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'website',current_timestamp + interval '4 hours',$11,$12,$13,current_timestamp,'requested',$14,$15) returning id",
      [
        crypto.randomUUID(),
        input.name,
        input.phone,
        input.peopleCount,
        input.job,
        "بازدید",
        property.property_type,
        property.neighborhood,
        property.consultant_name || property.contact_name || input.consultant,
        input.note,
        input.floorPreference,
        property.id,
        input.visitAt,
        input.trackingToken,
        consultant.id,
      ],
    );
    if (!rows[0]) return { kind: "failed" };
    if (input.intake) {
      const activity = typeof input.intake.activity === "function"
        ? input.intake.activity(property)
        : input.intake.activity;
      const followUp = typeof input.intake.followUp === "function"
        ? input.intake.followUp(property)
        : input.intake.followUp;
      await recordPublicLeadIntake(transactionSql, rows[0].id, activity, followUp);
    }
    return { kind: "created", id: rows[0].id, trackingToken: input.trackingToken, property };
  });
}

/** Check and move an existing visit while holding the same property lock as new requests. */
export async function reschedulePropertyVisitRequest(
  sql: Sql,
  input: { leadId: string; visitAt: string },
): Promise<PropertyVisitRescheduleResult> {
  if (typeof sql.transaction !== "function") {
    throw new Error("Database transaction support is required for property visit rescheduling.");
  }

  return sql.transaction((transactionSql) => reschedulePropertyVisitRequestInTransaction(transactionSql, input));
}

/** Reschedule within a caller-owned transaction that already resolved the public tracking alias. */
export async function reschedulePropertyVisitRequestInTransaction(
  transactionSql: Pick<Sql, "query">,
  input: { leadId: string; visitAt: string },
): Promise<PropertyVisitRescheduleResult> {
    const leadRows = await transactionSql.query<{
      id: string;
      property_id: string | null;
      visit_status: string;
      status: string;
      merged_into_lead_id: string | null;
    }>(
      "select id, property_id, visit_status, status, merged_into_lead_id from leads where id=$1 limit 1 for update",
      [input.leadId],
    );
    const lead = leadRows[0];
    if (!lead) return { kind: "not_found" };
    if (lead.merged_into_lead_id || lead.status === "closed" || lead.status === "spam") {
      return { kind: "not_reschedulable" };
    }
    if (lead.visit_status !== "requested" && lead.visit_status !== "confirmed") {
      return { kind: "not_reschedulable" };
    }
    if (!lead.property_id) return { kind: "not_found" };

    const propertyRows = await transactionSql.query<{ id: string }>(
      "select id from properties where id::text=$1 limit 1 for update",
      [lead.property_id],
    );
    const property = propertyRows[0];
    if (!property) return { kind: "not_found" };

    const conflictRows = await transactionSql.query<{ id: string }>(
      "select id from leads where property_id::text=$1 and id<>$2 and visit_status in ('requested','confirmed') and abs(extract(epoch from (visit_preferred_at - $3::timestamptz))) < 2700 limit 1",
      [property.id, input.leadId, input.visitAt],
    );
    if (conflictRows[0]) return { kind: "conflict" };

    const updatedRows = await transactionSql.query<{ id: string }>(
      "update leads set visit_preferred_at=$2, visit_status='requested', updated_at=current_timestamp where id=$1 and merged_into_lead_id is null and status not in ('closed','spam') and visit_status in ('requested','confirmed') returning id",
      [input.leadId, input.visitAt],
    );
    return updatedRows[0] ? { kind: "updated" } : { kind: "failed" };
}

/** Cancel only a still-active public visit; the predicate is the concurrency guard. */
export async function cancelPropertyVisitRequest(
  sql: Pick<Sql, "query">,
  leadId: string,
): Promise<PropertyVisitCancellationResult> {
  const rows = await sql.query<{ id: string }>(
    "update leads set visit_status='cancelled', updated_at=current_timestamp where id=$1 and merged_into_lead_id is null and status not in ('closed','spam') and visit_status in ('requested','confirmed') returning id",
    [leadId],
  );
  return rows[0] ? { kind: "cancelled" } : { kind: "not_cancellable" };
}
