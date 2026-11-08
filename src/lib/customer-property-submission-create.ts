import type { Sql } from "./db.ts";

export type InitialCustomerPropertySubmissionInput = {
  leadId: string;
  submissionId: string;
  trackingToken: string;
  ownerName: string;
  ownerPhone: string;
  deal: string;
  propertyType: string;
  neighborhood: string;
  leadNote: string;
  propertyData: string;
  mediaCount: number;
  possibleDuplicate: boolean;
};

/** Persist the initial owner submission and all required timeline records atomically. */
export async function createInitialCustomerPropertySubmission(
  sql: Sql,
  input: InitialCustomerPropertySubmissionInput,
): Promise<{ kind: "created" } | { kind: "duplicate"; trackingToken: string }> {
  if (typeof sql.transaction !== "function") {
    throw new Error(
      "Database transaction support is required for customer property submissions.",
    );
  }

  return sql.transaction(async (transactionSql) => {
    await transactionSql.query(
      "select pg_advisory_xact_lock(hashtext($1))",
      ["customer-property:" + input.ownerPhone],
    );
    const existing = await transactionSql.query<{
      public_tracking_token: string | null;
    }>(
      "select public_tracking_token from customer_property_submissions where owner_phone=$1 and created_at > current_timestamp - interval '30 minutes' and status='pending' limit 1",
      [input.ownerPhone],
    );
    if (existing[0]) {
      return {
        kind: "duplicate",
        trackingToken: existing[0].public_tracking_token || input.trackingToken,
      };
    }

    await transactionSql.query(
      "insert into leads (id,name,phone,people_count,job,deal,property_type,neighborhood,consultant,note,source,follow_up_at,public_tracking_token) values ($1,$2,$3,1,$4,$5,$6,$7,'',$8,'website',current_timestamp + interval '2 hours',$9)",
      [
        input.leadId,
        input.ownerName,
        input.ownerPhone,
        "مالک",
        input.deal,
        input.propertyType,
        input.neighborhood,
        input.leadNote,
        input.trackingToken,
      ],
    );
    await transactionSql.query(
      "insert into customer_property_submissions (id,lead_id,public_tracking_token,status,owner_name,owner_phone,property_data,queue_started_at) values ($1,$2,$3,'pending',$4,$5,$6::jsonb,current_timestamp)",
      [
        input.submissionId,
        input.leadId,
        input.trackingToken,
        input.ownerName,
        input.ownerPhone,
        input.propertyData,
      ],
    );
    await transactionSql.query(
      "insert into lead_activities (lead_id,activity_type,title,note,metadata) values ($1,'follow_up',$2,$3,$4::jsonb)",
      [
        input.leadId,
        "ثبت ملک توسط مشتری",
        "ملک جدید برای بررسی و انتشار ارسال شده است.",
        JSON.stringify({
          submissionId: input.submissionId,
          mediaCount: input.mediaCount,
        }),
      ],
    );
    await transactionSql.query(
      "insert into customer_property_submission_events (id,submission_id,action,note,metadata) values ($1,$2,'created',$3,$4::jsonb)",
      [
        crypto.randomUUID(),
        input.submissionId,
        "ثبت ملک جدید توسط مشتری و ورود به صف بررسی.",
        JSON.stringify({
          trackingToken: input.trackingToken,
          possibleDuplicate: input.possibleDuplicate,
        }),
      ],
    );
    return { kind: "created" };
  });
}
