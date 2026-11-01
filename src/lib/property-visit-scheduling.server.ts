type VisitSchedulingSql = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

export type VisitLeadSnapshot = {
  id?: string;
  property_id: string | null;
  visit_preferred_at: string | null;
  visit_status: string | null;
};

export type PropertyVisitSlotResult =
  | { kind: "property_missing" }
  | { kind: "conflict"; leadId: string }
  | {
      kind: "available";
      property: {
        id: string;
        title: string;
        property_type: string;
        neighborhood: string;
        contact_name: string;
      };
    };

export type PropertyVisitProperty = {
  id: string;
  title: string;
  property_type: string;
  neighborhood: string;
  contact_name: string;
};

export async function lockPropertyVisitSchedule(
  tx: VisitSchedulingSql,
  propertyId: string,
  requirePublicAvailability = false,
): Promise<PropertyVisitProperty | null> {
  const availability = requirePublicAvailability
    ? "and status='published' and availability_status not in ('sold','rented','unavailable')"
    : "";
  const rows = await tx.query<{
    id: string;
    title: string | null;
    property_type: string | null;
    neighborhood: string | null;
    contact_name: string | null;
  }>(
    `select id,title,property_type,neighborhood,contact_name from properties where id::text=$1 ${availability} for update`,
    [propertyId],
  );
  const property = rows[0];
  if (!property) return null;
  return {
    id: String(property.id),
    title: String(property.title ?? ""),
    property_type: String(property.property_type ?? ""),
    neighborhood: String(property.neighborhood ?? ""),
    contact_name: String(property.contact_name ?? ""),
  };
}

export async function checkPropertyVisitSlot(
  tx: VisitSchedulingSql,
  input: {
    propertyId: string;
    visitAt: string;
    excludeLeadIds?: string[];
    requirePublicAvailability?: boolean;
  },
): Promise<PropertyVisitSlotResult> {
  const property = await lockPropertyVisitSchedule(
    tx,
    input.propertyId,
    input.requirePublicAvailability === true,
  );
  if (!property) return { kind: "property_missing" };

  const exclusions = [...new Set(input.excludeLeadIds ?? [])].filter(Boolean);
  const conflicts = await tx.query<{ id: string }>(
    `select id from leads
     where property_id::text=$1
       and visit_status in ('requested','confirmed')
       and abs(extract(epoch from (visit_preferred_at - $2::timestamptz))) < 2700
       and not (id = any($3::text[]))
     limit 1`,
    [input.propertyId, input.visitAt, exclusions],
  );
  if (conflicts[0]) return { kind: "conflict", leadId: String(conflicts[0].id) };
  return { kind: "available", property };
}

export type LeadVisitMergePlan =
  | { kind: "no_active_visit" }
  | { kind: "keep_canonical"; propertyId: string; visitAt: string }
  | { kind: "move_duplicate"; propertyId: string; visitAt: string }
  | { kind: "conflicting_visits" };

function isActiveVisit(lead: VisitLeadSnapshot): boolean {
  return lead.visit_status === "requested" || lead.visit_status === "confirmed";
}

export function planLeadVisitMerge(
  canonical: VisitLeadSnapshot,
  duplicate: VisitLeadSnapshot,
): LeadVisitMergePlan {
  const canonicalActive = isActiveVisit(canonical);
  const duplicateActive = isActiveVisit(duplicate);
  if (!canonicalActive && !duplicateActive) return { kind: "no_active_visit" };

  const canonicalProperty = canonical.property_id?.trim() ?? "";
  const duplicateProperty = duplicate.property_id?.trim() ?? "";
  const canonicalTime = canonical.visit_preferred_at;
  const duplicateTime = duplicate.visit_preferred_at;
  if (canonicalActive && (!canonicalProperty || !canonicalTime || !Number.isFinite(Date.parse(canonicalTime)))) {
    return { kind: "conflicting_visits" };
  }
  if (duplicateActive && (!duplicateProperty || !duplicateTime || !Number.isFinite(Date.parse(duplicateTime)))) {
    return { kind: "conflicting_visits" };
  }

  if (canonicalActive && duplicateActive) {
    if (canonicalProperty !== duplicateProperty) return { kind: "conflicting_visits" };
    if (Math.abs(Date.parse(canonicalTime!) - Date.parse(duplicateTime!)) >= 45 * 60 * 1000) {
      return { kind: "conflicting_visits" };
    }
    return { kind: "keep_canonical", propertyId: canonicalProperty, visitAt: canonicalTime! };
  }

  if (canonicalActive) {
    return { kind: "keep_canonical", propertyId: canonicalProperty, visitAt: canonicalTime! };
  }

  if (String(canonical.visit_status ?? "none") !== "none") {
    return { kind: "conflicting_visits" };
  }
  if (canonicalProperty && canonicalProperty !== duplicateProperty) return { kind: "conflicting_visits" };
  return { kind: "move_duplicate", propertyId: duplicateProperty, visitAt: duplicateTime! };
}

export async function reschedulePropertyVisit(
  tx: VisitSchedulingSql,
  input: { leadId: string; trackingToken: string; propertyId: string; expectedVisitAt: string; visitAt: string },
): Promise<"rescheduled" | "property_missing" | "conflict" | "stale"> {
  const slot = await checkPropertyVisitSlot(tx, {
    propertyId: input.propertyId,
    visitAt: input.visitAt,
    excludeLeadIds: [input.leadId],
  });
  if (slot.kind === "property_missing") return "property_missing";
  if (slot.kind === "conflict") return "conflict";

  const updated = await tx.query<{ id: string }>(
    `update leads
     set visit_preferred_at=$3, visit_status='requested', updated_at=current_timestamp
     where id=$1 and public_tracking_token=$2 and property_id::text=$4
       and visit_status in ('requested','confirmed') and visit_preferred_at=$5::timestamptz
     returning id`,
    [input.leadId, input.trackingToken, input.visitAt, input.propertyId, input.expectedVisitAt],
  );
  return updated[0] ? "rescheduled" : "stale";
}

export async function cancelPropertyVisit(
  tx: VisitSchedulingSql,
  input: { leadId: string; trackingToken: string; propertyId: string; expectedVisitAt: string },
): Promise<"cancelled" | "stale"> {
  const updated = await tx.query<{ id: string }>(
    `update leads set visit_status='cancelled', updated_at=current_timestamp
     where id=$1 and public_tracking_token=$2 and property_id::text=$3
       and visit_preferred_at=$4::timestamptz and visit_status in ('requested','confirmed')
     returning id`,
    [input.leadId, input.trackingToken, input.propertyId, input.expectedVisitAt],
  );
  return updated[0] ? "cancelled" : "stale";
}
