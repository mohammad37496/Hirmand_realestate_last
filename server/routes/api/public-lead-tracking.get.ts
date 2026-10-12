import { createError, defineEventHandler, getQuery, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";

type LeadStatus = "new" | "contacted" | "follow_up" | "visited" | "contract" | "closed" | "spam";
type VisitStatus = "none" | "requested" | "confirmed" | "completed" | "cancelled";

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "در انتظار تماس",
  contacted: "تماس گرفته شد",
  follow_up: "در حال پیگیری",
  visited: "بازدید انجام شد",
  contract: "قرارداد ثبت شد",
  closed: "پرونده بسته شد",
  spam: "نامعتبر",
};

const VISIT_LABEL: Record<VisitStatus, string> = {
  none: "بدون درخواست بازدید",
  requested: "درخواست بازدید ثبت شده",
  confirmed: "بازدید تأیید شده",
  completed: "بازدید انجام شده",
  cancelled: "بازدید لغو شده",
};

function normalizeCode(value: unknown) {
  return typeof value === "string"
    ? value.trim().toUpperCase().replace(/\s+/g, "")
    : "";
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");

  const code = normalizeCode(getQuery(event).code);
  if (!/^HIR-[A-Z0-9]{2}-[A-F0-9]{12}$/.test(code)) {
    throw createError({ statusCode: 400, statusMessage: "کد رهگیری نامعتبر است." });
  }

  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "سامانه پیگیری موقتاً در دسترس نیست." });
  }

  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>(
    "select l.public_tracking_token,l.status,l.created_at,l.updated_at,l.consultant,l.deal,l.property_type,l.neighborhood,l.visit_requested_at,l.visit_preferred_at,l.visit_status,l.callback_preferred_at,l.offer_amount,l.offer_conditions," +
      "cps.status as customer_property_submission_status,cps.review_note as customer_property_submission_review_note," +
      "p.title as property_title,p.slug as property_slug " +
      "from leads l left join properties p on p.id::text=l.property_id::text " +
      "left join customer_property_submissions cps on cps.public_tracking_token=l.public_tracking_token " +
      "where l.public_tracking_token=$1 limit 1",
    [code],
  );

  const row = rows[0];
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: "درخواستی با این کد پیدا نشد." });
  }

  const status = String(row.status || "new") as LeadStatus;
  const visitStatus = String(row.visit_status || "none") as VisitStatus;
  const createdAt = row.created_at ? new Date(String(row.created_at)).toISOString() : null;
  const updatedAt = row.updated_at ? new Date(String(row.updated_at)).toISOString() : null;
  const visitRequestedAt = row.visit_requested_at ? new Date(String(row.visit_requested_at)).toISOString() : null;
  const visitPreferredAt = row.visit_preferred_at ? new Date(String(row.visit_preferred_at)).toISOString() : null;
  const callbackPreferredAt = row.callback_preferred_at ? new Date(String(row.callback_preferred_at)).toISOString() : null;
  const offerAmount = row.offer_amount == null ? null : Number(row.offer_amount);
  const offerConditions = String(row.offer_conditions ?? "");
  const customerPropertySubmissionStatus = row.customer_property_submission_status == null ? null : String(row.customer_property_submission_status);
  const customerPropertySubmissionReviewNote = row.customer_property_submission_review_note == null ? "" : String(row.customer_property_submission_review_note);

  const timeline: Array<{
    type: "created" | "status" | "visit";
    label: string;
    note: string;
    at: string | null;
  }> = [];

  if (createdAt) {
    timeline.push({ type: "created", label: "درخواست ثبت شد", note: "درخواست شما با موفقیت در سامانه هیرمند ثبت شد.", at: createdAt });
  }
  if (updatedAt && createdAt && new Date(updatedAt).getTime() > new Date(createdAt).getTime() + 1000) {
    timeline.push({ type: "status", label: "وضعیت درخواست به‌روزرسانی شد", note: STATUS_LABEL[status] ?? "در حال پیگیری", at: updatedAt });
  }
  if (customerPropertySubmissionStatus === "pending") {
    timeline.push({
      type: "status",
      label: "ثبت ملک در حال بررسی است",
      note: "اطلاعات و رسانه‌های ملک در صف بررسی کارشناسان هیرمند قرار دارد.",
      at: updatedAt || createdAt,
    });
  } else if (customerPropertySubmissionStatus === "approved") {
    timeline.push({
      type: "status",
      label: "ملک تأیید و منتشر شد",
      note: "درخواست ثبت ملک شما تأیید شده و فایل وارد بخش فایل‌های منتشرشده شده است.",
      at: updatedAt || createdAt,
    });
  } else if (customerPropertySubmissionStatus === "rejected") {
    timeline.push({
      type: "status",
      label: "ملک نیازمند اصلاح است",
      note: customerPropertySubmissionReviewNote || "برای ادامه، اطلاعات ملک را اصلاح و دوباره ارسال کنید.",
      at: updatedAt || createdAt,
    });
  }
  if (visitRequestedAt) {
    timeline.push({ type: "visit", label: "درخواست بازدید ثبت شد", note: VISIT_LABEL[visitStatus] ?? "بازدید در حال هماهنگی است.", at: visitRequestedAt });
  }
  if (callbackPreferredAt) {
    timeline.push({ type: "visit", label: "زمان تماس ثبت شد", note: "زمان پیشنهادی تماس: " + new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(callbackPreferredAt)), at: callbackPreferredAt });
  }
  if (offerAmount != null && offerAmount > 0) {
    timeline.push({ type: "status", label: "پیشنهاد قیمت ثبت شد", note: "مبلغ پیشنهاد: " + offerAmount.toLocaleString("fa-IR") + " تومان", at: updatedAt || createdAt });
  }
  if (visitPreferredAt) {
    timeline.push({ type: "visit", label: "زمان بازدید ثبت شد", note: "زمان پیشنهادی: " + new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(visitPreferredAt)), at: visitPreferredAt });
  }
  if (updatedAt && (visitStatus === "confirmed" || visitStatus === "completed" || visitStatus === "cancelled")) {
    timeline.push({
      type: "visit",
      label: visitStatus === "confirmed" ? "بازدید تأیید شد" : visitStatus === "completed" ? "بازدید انجام شد" : "بازدید لغو شد",
      note: VISIT_LABEL[visitStatus],
      at: updatedAt,
    });
  }

  timeline.sort((a, b) => (a.at ? new Date(a.at).getTime() : 0) - (b.at ? new Date(b.at).getTime() : 0));

  return {
    success: true,
    trackingCode: String(row.public_tracking_token),
    status,
    statusLabel: STATUS_LABEL[status] ?? "در حال پیگیری",
    visitStatus,
    visitStatusLabel: VISIT_LABEL[visitStatus] ?? "بدون درخواست بازدید",
    createdAt,
    updatedAt,
    consultant: row.consultant ? String(row.consultant) : "",
    deal: row.deal ? String(row.deal) : "",
    propertyType: row.property_type ? String(row.property_type) : "",
    neighborhood: row.neighborhood ? String(row.neighborhood) : "",
    visitRequestedAt,
    visitPreferredAt,
    callbackPreferredAt,
    offerAmount,
    offerConditions,
    customerPropertySubmissionStatus,
    customerPropertySubmissionReviewNote,
    timeline,
    property: row.property_title
      ? {
          title: String(row.property_title),
          slug: row.property_slug ? String(row.property_slug) : "",
        }
      : null,
  };
});
