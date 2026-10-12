import { getSql } from "@/lib/db";

type SqlClient = Awaited<ReturnType<typeof getSql>>;

function n(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function scoreBand(score: number) {
  if (score >= 80) return "hot";
  if (score >= 55) return "warm";
  return "cold";
}

export async function recalculateLeadScore(sql: SqlClient, leadId: string) {
  const rows = await sql.query<Record<string, unknown>>(
    "select id,status,follow_up_at,last_contacted_at,match_count,offer_amount,visit_status,created_at " +
    "from leads where id=$1 limit 1",
    [leadId],
  );
  const lead = rows[0];
  if (!lead) return null;

  const [activityRows, visitRows, callRows] = await Promise.all([
    sql.query<{count:number}>(
      "select count(*)::int as count from lead_activities where lead_id=$1 and created_at>=current_timestamp-interval '30 days'",
      [leadId],
    ),
    sql.query<{count:number}>(
      "select count(*)::int as count from leads where id=$1 and visit_status in ('requested','confirmed','completed')",
      [leadId],
    ),
    sql.query<{count:number}>(
      "select count(*)::int as count from staff_mobile_crm_contacts c join staff_mobile_crm_interactions i on i.contact_id=c.id " +
      "where c.lead_id=$1 and i.kind='call' and i.created_at>=current_timestamp-interval '30 days'",
      [leadId],
    ),
  ]);

  const status = String(lead.status ?? "new");
  let score =
    status === "new" ? 28 :
    status === "contacted" ? 40 :
    status === "follow_up" ? 52 :
    status === "visited" ? 68 :
    status === "contract" ? 88 :
    status === "closed" || status === "spam" ? 0 : 35;

  const due = lead.follow_up_at ? new Date(String(lead.follow_up_at)).getTime() : NaN;
  if (Number.isFinite(due)) {
    if (due <= Date.now()) score += 15;
    else if (due <= Date.now() + 48 * 60 * 60 * 1000) score += 9;
    else if (due <= Date.now() + 7 * 24 * 60 * 60 * 1000) score += 4;
  }

  const lastContacted = lead.last_contacted_at ? new Date(String(lead.last_contacted_at)).getTime() : NaN;
  if (Number.isFinite(lastContacted)) {
    const ageHours = Math.max(0, (Date.now() - lastContacted) / 3600000);
    score += ageHours <= 24 ? 10 : ageHours <= 72 ? 5 : 0;
  }

  const activities = n(activityRows[0]?.count);
  const visits = n(visitRows[0]?.count);
  const calls = n(callRows[0]?.count);
  score += Math.min(12, activities);
  score += visits > 0 ? 8 : 0;
  score += calls > 0 ? Math.min(8, calls * 2) : 0;
  score += n(lead.match_count) > 0 ? 6 : 0;
  score += lead.offer_amount != null ? 8 : 0;
  if (String(lead.visit_status) === "completed") score += 6;

  score = Math.max(0, Math.min(100, Math.round(score)));
  const factors = {
    status,
    followUpDue: Number.isFinite(due) && due <= Date.now(),
    recentContact: Number.isFinite(lastContacted) && (Date.now() - lastContacted) <= 72 * 60 * 60 * 1000,
    activities30d: activities,
    crmCalls30d: calls,
    visitSignals: visits,
    matchCount: n(lead.match_count),
    hasOffer: lead.offer_amount != null,
  };

  await sql.query(
    "update leads set lead_score=$2,lead_score_band=$3,lead_score_factors=$4::jsonb,lead_score_updated_at=current_timestamp,updated_at=current_timestamp where id=$1",
    [leadId, score, scoreBand(score), JSON.stringify(factors)],
  );
  return { score, band: scoreBand(score), factors };
}

export async function recalculateActiveLeadScores(sql: SqlClient, limit = 500) {
  const rows = await sql.query<{id:string}>(
    "select id from leads where status not in ('closed','spam') order by updated_at desc limit $1",
    [Math.max(1, Math.min(2000, limit))],
  );
  let updated = 0;
  for (const row of rows) {
    const result = await recalculateLeadScore(sql, String(row.id));
    if (result) updated++;
  }
  return { updated };
}
