import type { AdminPermission } from "./admin-roles.ts";
import type { Sql } from "./db.ts";

type Row = Record<string, unknown>;
const emptyRows = Promise.resolve([] as Row[]);

/**
 * Load only source feeds the current role may see. All authorized feeds run
 * concurrently; any failure rejects the whole load so partial data cannot
 * masquerade as a complete inbox.
 */
export async function loadAdminNotificationCandidates(sql: Sql, permissions: readonly AdminPermission[]) {
  const allows = (permission: AdminPermission) => permissions.includes(permission);
  const [
    newLeads, overdueLeads, visits, messages,
    submissions, overdueSubmissions, submissionEvents, incompleteProperties,
    staleProperties, verificationDue, propertyReports, propertyChanges,
    publicationReviews, dealDocuments, divarFailures, dataHealthFindings, backupHealth,
  ] = await Promise.all([
    allows("lead.manage") ? sql.query<Row>(
      `/* notification:lead-new */
       select id,name,created_at from leads
        where status in ('new','contacted')
          and created_at >= current_timestamp - interval '30 days'
        order by created_at desc limit 40`,
    ) : emptyRows,
    allows("lead.manage") ? sql.query<Row>(
      `/* notification:lead-overdue */
       select id,name,follow_up_at from leads
        where status in ('new','contacted') and follow_up_at is not null
          and follow_up_at <= current_timestamp
        order by follow_up_at asc limit 40`,
    ) : emptyRows,
    allows("lead.manage") ? sql.query<Row>(
      `/* notification:lead-visit */
       select id,name,visit_requested_at,visit_preferred_at,updated_at,created_at from leads
        where visit_status='requested'
        order by visit_preferred_at asc nulls last,created_at desc limit 30`,
    ) : emptyRows,
    allows("lead.manage") && allows("reports.view") ? sql.query<Row>(
      `/* notification:customer-message */
       select lead_id,count(*)::int as unread_count,max(created_at) as latest
         from customer_messages
        where sender_type='customer' and read_by_admin_at is null
        group by lead_id order by max(created_at) desc limit 30`,
    ) : emptyRows,
    allows("property.manage") ? sql.query<Row>(
      `/* notification:property-submission */
       select id,owner_name,status,property_data->>'title' as property_title,created_at
         from customer_property_submissions
        where created_at >= current_timestamp - interval '30 days'
        order by created_at desc limit 50`,
    ) : emptyRows,
    allows("property.manage") ? sql.query<Row>(
      `/* notification:property-submission-overdue */
       select id,owner_name,queue_started_at from customer_property_submissions
        where status='pending'
          and coalesce(queue_started_at,created_at) <= current_timestamp - interval '24 hours'
        order by coalesce(queue_started_at,created_at) asc limit 30`,
    ) : emptyRows,
    allows("property.manage") ? sql.query<Row>(
      `/* notification:property-submission-event */
       select e.id,e.action,e.created_at,s.id as submission_id,s.owner_name
         from customer_property_submission_events e
         join customer_property_submissions s on s.id=e.submission_id
        where e.created_at >= current_timestamp - interval '7 days'
          and e.action <> 'created'
        order by e.created_at desc limit 30`,
    ) : emptyRows,
    allows("property.manage") ? sql.query<Row>(
      `/* notification:property-incomplete */
       select id,title,slug,updated_at from properties
        where deleted_at is null and status='draft'
          and (trim(coalesce(title,''))='' or trim(coalesce(neighborhood,''))=''
            or trim(coalesce(description,''))='' or trim(coalesce(contact_name,''))=''
            or trim(coalesce(contact_phone,''))=''
            or coalesce(case when jsonb_typeof(images)='array' then jsonb_array_length(images) else 0 end,0)=0)
        order by updated_at desc limit 30`,
    ) : emptyRows,
    allows("property.manage") ? sql.query<Row>(
      `/* notification:property-no-image */
       select id,title,slug from properties
        where deleted_at is null and status='published'
          and coalesce(case when jsonb_typeof(images)='array' then jsonb_array_length(images) else 0 end,0)=0
        order by updated_at desc limit 20`,
    ) : emptyRows,
    allows("property.manage") ? sql.query<Row>(
      `/* notification:property-verification */
       select id,title,slug,coalesce(last_verified_at,published_at,updated_at,created_at) as verification_anchor
         from properties
        where deleted_at is null and status='published'
          and coalesce(last_verified_at,published_at,updated_at,created_at)
              <= current_timestamp - interval '14 days'
        order by coalesce(last_verified_at,published_at,updated_at,created_at) asc limit 20`,
    ) : emptyRows,
    allows("property.manage") ? sql.query<Row>(
      `/* notification:property-report */
       select id,property_id,property_slug,property_title,report_type,created_at
         from property_reports where status='open'
        order by created_at desc limit 30`,
    ) : emptyRows,
    allows("property.manage") ? sql.query<Row>(
      `/* notification:property-change */
       select h.id,h.property_id,h.action,h.changed_at,
              coalesce(h.after_state->>'title',h.before_state->>'title',p.title,'فایل') as title,
              p.slug
         from property_change_history h
         left join properties p on p.id=h.property_id
        where h.changed_at >= current_timestamp - interval '48 hours'
        order by h.changed_at desc limit 40`,
    ) : emptyRows,
    allows("property.publish") ? sql.query<Row>(
      `/* notification:property-publication */
       select r.id,r.property_id,r.requested_at,p.title,p.slug
         from property_publication_reviews r
         join properties p on p.id=r.property_id
        where r.status='pending'
        order by r.requested_at asc limit 30`,
    ) : emptyRows,
    allows("deal.manage") ? sql.query<Row>(
      `/* notification:deal-document */
       select d.id,d.deal_id,d.document_type,d.status,d.updated_at,
              a.title as deal_title,a.property_id,p.slug as property_slug
         from admin_deal_documents d
         join admin_deals a on a.id=d.deal_id
         left join properties p on p.id=a.property_id
        where d.status in ('pending','rejected')
        order by d.updated_at desc limit 30`,
    ) : emptyRows,
    allows("divar.import") ? sql.query<Row>(
      `/* notification:divar-sync */
       select id,status,started_at
         from divar_sync_runs
        where (status='failed' or (status='running' and started_at <= current_timestamp - interval '20 minutes'))
          and started_at >= current_timestamp - interval '30 days'
        order by started_at desc limit 20`,
    ) : emptyRows,
    allows("team.manage") ? sql.query<Row>(
      `/* notification:data-health */
       select id,source_key,kind,severity,title,detail,entity_type,entity_id,detected_at
         from admin_data_health_findings
        where resolved_at is null
        order by case severity when 'critical' then 0 when 'warning' then 1 else 2 end,
                 detected_at desc limit 30`,
    ) : emptyRows,
    allows("team.manage") ? sql.query<Row>(
      `/* notification:backup-health */
       select max(created_at) as latest_backup
         from admin_backup_log
       having max(created_at) is null
           or max(created_at) <= current_timestamp - interval '7 days'`,
    ) : emptyRows,
  ]);

  return {
    newLeads, overdueLeads, visits, messages, submissions, overdueSubmissions,
    submissionEvents, incompleteProperties, staleProperties, verificationDue,
    propertyReports, propertyChanges, publicationReviews, dealDocuments,
    divarFailures, dataHealthFindings, backupHealth,
  };
}
