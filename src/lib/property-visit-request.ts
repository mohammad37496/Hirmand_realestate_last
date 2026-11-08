import type { Sql } from "./db";
import { publicPropertyVisibilitySql } from "./public-property-visibility.ts";

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
};

type PropertyVisitRequestResult =
  | { kind: "not_found" }
  | { kind: "conflict" }
  | { kind: "failed" }
  | {
      kind: "created";
      id: string;
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
    const propertyRows = await transactionSql.query<{
      id: string;
      title: string;
      property_type: string;
      neighborhood: string;
      contact_name: string;
    }>(
      `select id, title, property_type, neighborhood, contact_name
         from properties
        where id::text=$1 and ${publicPropertyVisibilitySql()}
          and availability_status not in ('sold','rented','unavailable')
        limit 1 for update`,
      [input.propertyId],
    );
    const property = propertyRows[0];
    if (!property) return { kind: "not_found" };

    const conflictRows = await transactionSql.query<{ id: string }>(
      "select id from leads where property_id::text=$1 and visit_status in ('requested','confirmed') and abs(extract(epoch from (visit_preferred_at - $2::timestamptz))) < 2700 limit 1",
      [property.id, input.visitAt],
    );
    if (conflictRows[0]) return { kind: "conflict" };

    const rows = await transactionSql.query<{ id: string }>(
      "insert into leads (id, name, phone, people_count, job, deal, property_type, neighborhood, consultant, note, source, follow_up_at, floor_preference, property_id, visit_preferred_at, visit_requested_at, visit_status, public_tracking_token) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'website',current_timestamp + interval '4 hours',$11,$12,$13,current_timestamp,'requested',$14) returning id",
      [
        crypto.randomUUID(),
        input.name,
        input.phone,
        input.peopleCount,
        input.job,
        "بازدید",
        property.property_type,
        property.neighborhood,
        property.contact_name || input.consultant,
        input.note,
        input.floorPreference,
        property.id,
        input.visitAt,
        input.trackingToken,
      ],
    );
    if (!rows[0]) return { kind: "failed" };
    return { kind: "created", id: rows[0].id, property };
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

  return sql.transaction(async (transactionSql) => {
    const leadRows = await transactionSql.query<{
      id: string;
      property_id: string | null;
      visit_status: string;
    }>(
      "select id, property_id, visit_status from leads where id=$1 limit 1 for update",
      [input.leadId],
    );
    const lead = leadRows[0];
    if (!lead) return { kind: "not_found" };
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
      "update leads set visit_preferred_at=$2, visit_status='requested', updated_at=current_timestamp where id=$1 returning id",
      [input.leadId, input.visitAt],
    );
    return updatedRows[0] ? { kind: "updated" } : { kind: "failed" };
  });
}

/** Cancel only a still-active public visit; the predicate is the concurrency guard. */
export async function cancelPropertyVisitRequest(
  sql: Sql,
  leadId: string,
): Promise<PropertyVisitCancellationResult> {
  const rows = await sql.query<{ id: string }>(
    "update leads set visit_status='cancelled', updated_at=current_timestamp where id=$1 and visit_status in ('requested','confirmed') returning id",
    [leadId],
  );
  return rows[0] ? { kind: "cancelled" } : { kind: "not_cancellable" };
}
