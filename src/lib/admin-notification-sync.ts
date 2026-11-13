import type { AdminPermission } from "./admin-roles.ts";
import type { Sql } from "./db.ts";
import { loadAdminNotificationCandidates } from "./admin-notification-candidates.ts";

type Candidate = {
  sourceKey: string;
  kind: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  requiredPermission: AdminPermission;
  isStateful?: boolean;
  entityType?: string;
  entityId?: string;
  entitySlug?: string;
};

function value(row: Record<string, unknown>, key: string, fallback = "") {
  const result = row[key];
  return result == null || result === "" ? fallback : String(result);
}

function timestampKey(row: Record<string, unknown>, key: string, fallback = "unknown") {
  const raw = value(row, key);
  if (!raw) return fallback;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

export async function syncAdminNotificationCandidates(sql: Sql, permissions: readonly AdminPermission[]) {
  const candidates: Candidate[] = [];
  const feeds = await loadAdminNotificationCandidates(sql, permissions);
  const add = (candidate: Candidate) => candidates.push(candidate);

  for (const row of feeds.newLeads) add({
    sourceKey: `lead-new:${value(row, "id")}`,
    kind: "lead",
    severity: "warning",
    title: "درخواست مشتری جدید",
    body: `${value(row, "name", "مشتری")} درخواست مشاوره ثبت کرده است.`,
    requiredPermission: "lead.manage",
    entityType: "lead",
    entityId: value(row, "id"),
  });

  for (const row of feeds.overdueLeads) add({
    sourceKey: `lead-overdue:${value(row, "id")}:${timestampKey(row, "follow_up_at")}`,
    kind: "lead",
    severity: "critical",
    title: "پیگیری مشتری عقب افتاده",
    body: `${value(row, "name", "مشتری")} زمان پیگیری‌اش گذشته است.`,
    requiredPermission: "lead.manage",
    isStateful: true,
    entityType: "lead",
    entityId: value(row, "id"),
  });

  for (const row of feeds.visits) add({
    sourceKey: `lead-visit:${value(row, "id")}:${timestampKey(row, "visit_requested_at", timestampKey(row, "updated_at", timestampKey(row, "created_at")))}`,
    kind: "visit",
    severity: "warning",
    title: "درخواست بازدید جدید",
    body: `${value(row, "name", "مشتری")} درخواست بازدید ثبت کرده است.`,
    requiredPermission: "lead.manage",
    isStateful: true,
    entityType: "lead",
    entityId: value(row, "id"),
  });

  for (const row of feeds.messages) add({
    sourceKey: `customer-message:${value(row, "lead_id")}:${timestampKey(row, "latest")}`,
    kind: "message",
    severity: "warning",
    title: "پیام خوانده‌نشده مشتری",
    body: `${value(row, "unread_count", "1")} پیام خوانده‌نشده در گفت‌وگوی مشتری دارید.`,
    requiredPermission: "reports.view",
    isStateful: true,
    entityType: "lead",
    entityId: value(row, "lead_id"),
  });

  for (const row of feeds.submissions) add({
    sourceKey: `property-submission:${value(row, "id")}`,
    kind: "submission",
    severity: value(row, "status") === "pending" ? "warning" : "info",
    title: "درخواست ثبت ملک توسط مشتری",
    body: `${value(row, "owner_name", "مالک")} · ${value(row, "property_title", "ملک ثبت‌شده")} · وضعیت: ${value(row, "status")}`,
    requiredPermission: "property.manage",
    entityType: "submission",
    entityId: value(row, "id"),
  });

  for (const row of feeds.overdueSubmissions) add({
    sourceKey: `property-submission-overdue:${value(row, "id")}:${timestampKey(row, "queue_started_at")}`,
    kind: "submission",
    severity: "critical",
    title: "درخواست ثبت ملک در انتظار بررسی",
    body: `درخواست ${value(row, "owner_name", "مالک")} بیش از ۲۴ ساعت در صف بررسی مانده است.`,
    requiredPermission: "property.manage",
    isStateful: true,
    entityType: "submission",
    entityId: value(row, "id"),
  });

  for (const row of feeds.submissionEvents) {
    const action = value(row, "action");
    const label = action === "resubmit" ? "ارسال مجدد" : action === "reject" ? "رد درخواست" : "تغییر وضعیت";
    add({
      sourceKey: `property-submission-event:${value(row, "id")}`,
      kind: "submission",
      severity: action === "reject" ? "warning" : "info",
      title: "تغییر در پرونده ثبت ملک",
      body: `پرونده ${value(row, "owner_name", "مالک")}: ${label}.`,
      requiredPermission: "property.manage",
      entityType: "submission",
      entityId: value(row, "submission_id"),
    });
  }

  for (const row of feeds.incompleteProperties) add({
    sourceKey: `property-incomplete:${value(row, "id")}:${timestampKey(row, "updated_at")}`,
    kind: "property",
    severity: "warning",
    title: "اطلاعات ملک ناقص است",
    body: `${value(row, "title", "پیش‌نویس ملک")} برای تکمیل مدارک و آماده‌سازی انتشار نیاز به بررسی دارد.`,
    requiredPermission: "property.manage",
    isStateful: true,
    entityType: "property",
    entityId: value(row, "id"),
    entitySlug: value(row, "slug") || undefined,
  });

  for (const row of feeds.staleProperties) add({
    sourceKey: `property-no-image:${value(row, "id")}`,
    kind: "property",
    severity: "warning",
    title: "فایل منتشرشده بدون تصویر",
    body: `${value(row, "title", "فایل")} هنوز تصویر ندارد.`,
    requiredPermission: "property.manage",
    isStateful: true,
    entityType: "property",
    entityId: value(row, "id"),
    entitySlug: value(row, "slug") || undefined,
  });

  for (const row of feeds.verificationDue) add({
    sourceKey: `property-verification:${value(row, "id")}:${timestampKey(row, "verification_anchor")}`,
    kind: "property",
    severity: "warning",
    title: "بازبینی دوره‌ای ملک سررسید شده",
    body: `${value(row, "title", "ملک منتشرشده")} بیش از ۱۴ روز است که بازبینی نشده است.`,
    requiredPermission: "property.manage",
    isStateful: true,
    entityType: "property",
    entityId: value(row, "id"),
    entitySlug: value(row, "slug") || undefined,
  });

  for (const row of feeds.propertyReports) add({
    sourceKey: `property-report:${value(row, "id")}`,
    kind: "property_report",
    severity: "warning",
    title: "گزارش جدید درباره ملک",
    body: `${value(row, "property_title", "ملک")} · ${value(row, "report_type", "گزارش بازدیدکننده")}`,
    requiredPermission: "property.manage",
    isStateful: true,
    entityType: "property",
    entityId: value(row, "property_id"),
    entitySlug: value(row, "property_slug") || undefined,
  });

  for (const row of feeds.propertyChanges) add({
    sourceKey: `property-change:${value(row, "id")}`,
    kind: "property_change",
    severity: value(row, "action") === "deleted" ? "critical" : "info",
    title: value(row, "action") === "created" ? "ملک جدید ثبت شد" : value(row, "action") === "deleted" ? "ملک حذف شد" : "پرونده ملک به‌روزرسانی شد",
    body: `تغییر مهم در پرونده ${value(row, "title", "ملک")}.`,
    requiredPermission: "property.manage",
    entityType: "property",
    entityId: value(row, "property_id"),
    entitySlug: value(row, "slug") || undefined,
  });

  for (const row of feeds.publicationReviews) add({
    sourceKey: `property-publication:${value(row, "id")}`,
    kind: "publication",
    severity: "warning",
    title: "درخواست تأیید انتشار ملک",
    body: `${value(row, "title", "ملک")} برای تأیید نهایی انتشار در صف است.`,
    requiredPermission: "property.publish",
    isStateful: true,
    entityType: "property",
    entityId: value(row, "property_id"),
    entitySlug: value(row, "slug") || undefined,
  });

  for (const row of feeds.dealDocuments) add({
    sourceKey: `deal-document:${value(row, "id")}:${value(row, "status")}:${timestampKey(row, "updated_at")}`,
    kind: "deal_document",
    severity: value(row, "status") === "rejected" ? "critical" : "warning",
    title: value(row, "status") === "rejected" ? "مدرک معامله نیاز به اصلاح دارد" : "مدرک معامله تکمیل نشده است",
    body: `${value(row, "deal_title", "پرونده معامله")} · ${value(row, "document_type", "مدرک")}`,
    requiredPermission: "deal.manage",
    isStateful: true,
    entityType: "deal",
    entityId: value(row, "deal_id"),
    entitySlug: value(row, "property_slug") || undefined,
  });

  for (const row of feeds.divarFailures) add({
    sourceKey: `divar-sync:${value(row, "id")}`,
    kind: "divar",
    severity: value(row, "status") === "failed" ? "critical" : "warning",
    title: value(row, "status") === "failed" ? "همگام‌سازی دیوار ناموفق بود" : "همگام‌سازی دیوار متوقف مانده است",
    body: value(row, "status") === "failed"
      ? "آخرین اجرای دریافت آگهی‌ها با خطا متوقف شد؛ وضعیت اجرا را بررسی کنید."
      : "اجرای دریافت آگهی‌ها بیش از ۲۰ دقیقه در وضعیت شروع‌شده مانده است.",
    requiredPermission: "divar.import",
    entityType: "system",
  });

  for (const row of feeds.dataHealthFindings) add({
    sourceKey: `data-health:${value(row, "source_key")}`,
    kind: "system",
    severity: value(row, "severity", "warning") === "critical" ? "critical" : value(row, "severity") === "info" ? "info" : "warning",
    title: value(row, "title", "ناسازگاری داده"),
    body: value(row, "detail", "یک مورد نیازمند بررسی در سلامت داده شناسایی شده است."),
    requiredPermission: "team.manage",
    isStateful: true,
    entityType: value(row, "entity_type") || "system",
    entityId: value(row, "entity_id") || undefined,
  });

  for (const row of feeds.backupHealth) {
    const latestBackup = value(row, "latest_backup");
    const backupDate = latestBackup ? new Date(latestBackup) : null;
    const dateLabel = backupDate && !Number.isNaN(backupDate.getTime())
      ? backupDate.toLocaleDateString("fa-IR")
      : null;
    add({
      sourceKey: `backup-health:${latestBackup || "missing"}`,
      kind: "backup",
      severity: latestBackup ? "warning" : "critical",
      title: latestBackup ? "نسخه پشتیبان نیاز به به‌روزرسانی دارد" : "سابقه نسخه پشتیبان ثبت نشده است",
      body: latestBackup
        ? `آخرین نسخه پشتیبان در ${dateLabel || "تاریخ نامشخص"} ثبت شده و بیش از ۷ روز گذشته است.`
        : "هیچ سابقه‌ای از تهیه نسخه پشتیبان در سامانه ثبت نشده است.",
      requiredPermission: "team.manage",
      isStateful: true,
      entityType: "system",
    });
  }

  let synced = 0;
  if (candidates.length) {
    const rows = await sql.query<{ id: number }>(
    `insert into admin_notifications
       (source_key,kind,severity,title,body,entity_type,entity_id,entity_slug,required_permission,is_stateful,resolved_at)
     select incoming.source_key,incoming.kind,incoming.severity,incoming.title,incoming.body,
            incoming.entity_type,incoming.entity_id,incoming.entity_slug,incoming.required_permission,
            incoming.is_stateful,null
       from unnest(
         $1::text[],$2::text[],$3::text[],$4::text[],$5::text[],
         $6::text[],$7::text[],$8::text[],$9::text[],$10::boolean[]
       ) as incoming(source_key,kind,severity,title,body,entity_type,entity_id,entity_slug,required_permission,is_stateful)
     on conflict(source_key) do update set
       kind=excluded.kind,severity=excluded.severity,title=excluded.title,body=excluded.body,
       entity_type=excluded.entity_type,entity_id=excluded.entity_id,entity_slug=excluded.entity_slug,
       required_permission=excluded.required_permission,is_stateful=excluded.is_stateful,resolved_at=null
     returning id`,
      [
        candidates.map((item) => item.sourceKey),
        candidates.map((item) => item.kind),
        candidates.map((item) => item.severity),
        candidates.map((item) => item.title),
        candidates.map((item) => item.body),
        candidates.map((item) => item.entityType ?? null),
        candidates.map((item) => item.entityId ?? null),
        candidates.map((item) => item.entitySlug ?? null),
        candidates.map((item) => item.requiredPermission),
        candidates.map((item) => item.isStateful ?? false),
      ],
    );
    synced = rows.length;
  }

  const statefulScopes: AdminPermission[] = [];
  const statefulPatterns: string[] = [];
  if (permissions.includes("lead.manage")) {
    statefulScopes.push("lead.manage");
    statefulPatterns.push("lead-overdue:%", "lead-visit:%");
    if (permissions.includes("reports.view")) {
      statefulScopes.push("reports.view");
      statefulPatterns.push("customer-message:%");
    }
  }
  if (permissions.includes("property.manage")) {
    statefulScopes.push("property.manage");
    statefulPatterns.push(
      "property-submission-overdue:%", "property-incomplete:%", "property-no-image:%",
      "property-verification:%", "property-report:%",
    );
  }
  if (permissions.includes("property.publish")) {
    statefulScopes.push("property.publish");
    statefulPatterns.push("property-publication:%");
  }
  if (permissions.includes("deal.manage")) {
    statefulScopes.push("deal.manage");
    statefulPatterns.push("deal-document:%");
  }
  if (permissions.includes("team.manage")) {
    statefulScopes.push("team.manage");
    statefulPatterns.push("data-health:%", "backup-health:%");
  }
  if (statefulPatterns.length) {
    await sql.query(
      `with resolved as (
         update admin_notifications set resolved_at=current_timestamp
          where is_stateful=true and resolved_at is null
            and required_permission=any($1::text[])
            and source_key like any($2::text[])
            and not (source_key=any($3::text[]))
          returning id
       )
       delete from admin_notification_reads reads
        using resolved
        where reads.notification_id=resolved.id`,
      [statefulScopes, statefulPatterns, candidates.filter((item) => item.isStateful).map((item) => item.sourceKey)],
    );
  }
  return synced;
}
