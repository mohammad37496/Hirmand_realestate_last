import { createError, defineEventHandler, getCookie, readBody, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { getAdminSessionClaims } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

type Status = "new" | "contacted" | "follow_up" | "visited" | "contract" | "closed" | "spam";
type VisitStatus = "none" | "requested" | "confirmed" | "completed" | "cancelled";

const STATUSES: Status[] = ["new", "contacted", "follow_up", "visited", "contract", "closed", "spam"];

const SEARCHABLE_LEAD_COLUMNS = [
  "name",
  "phone",
  "job",
  "deal",
  "property_type",
  "neighborhood",
  "consultant",
  "note",
  "acquisition_source",
  "budget_deposit::text",
  "budget_rent::text",
  "budget_purchase::text",
  "budget_sale::text",
  "budget_equivalent::text",
  "floor_preference",
  "callback_preferred_at::text",
  "offer_amount::text",
  "offer_conditions",
];

const LIST_LIMIT = 50;
const LIST_MAX_OFFSET = 100000;

function parseListInput(body: Record<string, unknown>) {
  const status = typeof body.status === "string" ? body.status : "";
  const sortRaw = typeof body.sort === "string" ? body.sort : "newest";
  const sort = ["newest", "oldest", "name", "follow_up", "priority"].includes(sortRaw)
    ? (sortRaw as "newest" | "oldest" | "name" | "follow_up" | "priority")
    : "newest";
  const query = typeof body.query === "string" ? body.query.trim().slice(0, 80) : "";
  const limit = Math.min(100, Math.max(1, Number(body.limit) || LIST_LIMIT));
  const offset = Math.min(LIST_MAX_OFFSET, Math.max(0, Number(body.offset) || 0));

  if (status && !STATUSES.includes(status as Status)) {
    throw createError({ statusCode: 400, statusMessage: "فیلتر وضعیت نامعتبر است." });
  }

  return { status: status as Status | "", sort, query, limit, offset };
}

function csvCell(value: unknown) {
  let text = String(value ?? "").replace(/\r?\n/g, " ");
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return /[",]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function csvDate(value: unknown) {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Asia/Tehran",
    }).format(new Date(String(value)));
  } catch {
    return String(value ?? "");
  }
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  const body = (await readBody(event)) as {
    action?: "list" | "status" | "visit_status" | "delete" | "export" | "note" | "follow_up" | "activity" | "activities" | "create_overdue_tasks";
    id?: string;
    status?: Status;
    query?: string;
    note?: string;
    sort?: string;
    limit?: number;
    offset?: number;
    followUpAt?: string | null;
    activityType?: "note" | "call" | "whatsapp" | "match" | "visit" | "follow_up" | "status" | "document";
    activityTitle?: string;
    activityNote?: string;
    activityMetadata?: Record<string, unknown>;
    visitStatus?: VisitStatus;
  };

  if (!await verifyAdminSessionToken(getCookie(event, ADMIN_SESSION_COOKIE))) {
    throw createError({
      statusCode: 401,
      statusMessage: "نشست مدیریت معتبر نیست. دوباره وارد پنل شوید.",
    });
  }

  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(getCookie(event, ADMIN_SESSION_COOKIE));
  const currentRole = normalizeAdminRole(claims?.role);
  if (currentRole === "staff" && body.action === "delete") {
    throw createError({ statusCode: 403, statusMessage: "کارکنان اجازه حذف درخواست‌های مشتری را ندارند." });
  }
  if (currentRole === "staff" && body.action === "export") {
    throw createError({ statusCode: 403, statusMessage: "خروجی‌گیری انبوه از اطلاعات مشتریان فقط برای مدیر مجاز است." });
  }
  if (!hasAdminPermission(currentRole, "lead.manage")) {
    throw createError({ statusCode: 403, statusMessage: "سطح دسترسی CRM برای این حساب فعال نیست." });
  }

  if (dbSource === "unconfigured") return { leads: [], total: 0 };
  const sql = await getSql();

  if (body.action === "export") {
    const query = typeof body.query === "string" ? body.query.trim().slice(0, 80) : "";
    const status = body.status;

    if (status && !["new", "contacted", "follow_up", "visited", "contract", "closed", "spam"].includes(status)) {
      throw createError({ statusCode: 400, statusMessage: "فیلتر وضعیت نامعتبر است." });
    }

    const params: string[] = [];
    const conditions = ["true"];
    if (status) {
      params.push(status);
      conditions.push("status = $1");
    }
    if (query) {
      params.push("%" + query + "%");
      const index = params.length;
      conditions.push(
        "(" +
          ["name", "phone", "deal", "property_type", "neighborhood", "consultant", "job", "note", "callback_preferred_at::text", "offer_amount::text", "offer_conditions", "budget_deposit::text", "budget_rent::text", "budget_purchase::text", "budget_sale::text", "budget_deposit_min::text", "budget_deposit_max::text", "budget_rent_min::text", "budget_rent_max::text", "budget_purchase_min::text", "budget_purchase_max::text", "budget_sale_min::text", "budget_sale_max::text"]
            .map((column) => column + " ilike $" + index)
            .join(" or ") +
          ")",
      );
    }

    const rows = await sql.query<Record<string, unknown>>(
      "select name, phone, people_count, job, deal, property_type, neighborhood, consultant, status, note, source, " +
        "acquisition_source, acquisition_medium, acquisition_campaign, acquisition_referrer, follow_up_at, last_contacted_at, " +
        "property_id, visit_preferred_at, visit_requested_at, visit_status, callback_preferred_at, offer_amount, offer_conditions, lease_deadline, budget_deposit, budget_rent, budget_purchase, budget_sale, budget_deposit_min, budget_deposit_max, budget_rent_min, budget_rent_max, budget_purchase_min, budget_purchase_max, budget_sale_min, budget_sale_max, budget_equivalent, budget_bedrooms, floor_preference, requested_bedrooms, requested_amenities, match_count, created_at " +
        "from leads where " + conditions.join(" and ") +
        " order by created_at desc limit 50000",
      params,
    );

    const labels: Record<Status, string> = {
      new: "جدید",
      contacted: "تماس گرفته شد",
      follow_up: "پیگیری",
      visited: "بازدید",
      contract: "قرارداد",
      closed: "ناموفق / بسته‌شده",
      spam: "اسپم",
    };
    const visitLabels: Record<VisitStatus, string> = {
      none: "بدون بازدید",
      requested: "درخواست بازدید",
      confirmed: "تأییدشده",
      completed: "انجام‌شده",
      cancelled: "لغوشده",
    };
    const header = ["نام", "تلفن", "تعداد نفرات", "شغل", "معامله", "نوع ملک", "محله", "طبقه", "مشاور", "وضعیت", "وضعیت بازدید", "زمان بازدید", "زمان تماس", "مبلغ پیشنهاد", "شرایط پیشنهاد", "منبع جذب", "رهن از", "رهن تا", "اجاره از", "اجاره تا", "خرید از", "خرید تا", "فروش از", "فروش تا", "معادل رهنی", "خواب موردنظر", "خواب بودجه‌یابی", "تعداد فایل پیشنهادی", "امکانات موردنظر", "توضیحات", "مهلت رهن و اجاره", "تاریخ"];
    const lines = [
      header.map(csvCell).join(","),
      ...rows.map((row) =>
        [
          row.name,
          row.phone,
          row.people_count,
          row.job,
          row.deal,
          row.property_type,
          row.neighborhood,
          row.floor_preference,
          row.consultant,
          labels[String(row.status) as Status] ?? row.status,
          visitLabels[String(row.visit_status) as VisitStatus] ?? "بدون بازدید",
          row.visit_preferred_at == null ? "" : csvDate(row.visit_preferred_at),
          row.callback_preferred_at == null ? "" : csvDate(row.callback_preferred_at),
          row.offer_amount == null ? "" : Number(row.offer_amount).toLocaleString("fa-IR"),
          row.offer_conditions,
          row.acquisition_source ?? row.source,
          row.budget_deposit_min ?? row.budget_deposit,
          row.budget_deposit_max ?? row.budget_deposit,
          row.budget_rent_min ?? row.budget_rent,
          row.budget_rent_max ?? row.budget_rent,
          row.budget_purchase_min ?? row.budget_purchase,
          row.budget_purchase_max ?? row.budget_purchase,
          row.budget_sale_min ?? row.budget_sale,
          row.budget_sale_max ?? row.budget_sale,
          row.budget_equivalent,
          row.requested_bedrooms,
          row.budget_bedrooms,
          row.match_count,
          Array.isArray(row.requested_amenities) ? row.requested_amenities.join(" | ") : "",
          row.note,
          row.lease_deadline,
          csvDate(row.created_at),
        ].map(csvCell).join(","),
      ),
    ];

    setResponseHeader(event, "content-type", "text/csv; charset=utf-8");
    setResponseHeader(event, "content-disposition", 'attachment; filename="hirmand-leads.csv"');
    setResponseHeader(event, "cache-control", "no-store");
    return "\uFEFF" + lines.join("\n");
  }

  if ((body.action ?? "list") === "list") {
    const { status, sort, query, limit, offset } = parseListInput(body as Record<string, unknown>);

    const conditions: string[] = ["true"];
    const params: unknown[] = [];
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (query) {
      params.push(`%${query}%`);
      const index = params.length;
      conditions.push(
        "(" +
          SEARCHABLE_LEAD_COLUMNS.map((column) => `${column} ilike $${index}`).join(" or ") +
          ")",
      );
    }

    // `follow_up_at desc nulls last` surfaces the leads that need attention
    // first; everything else falls back to the most recent submissions.
    const orderBy =
      sort === "oldest" ? "created_at asc" :
      sort === "name" ? "name asc nulls last" :
      sort === "follow_up" ? "follow_up_at asc nulls last, created_at desc" :
      sort === "priority" ? "priority_score desc, created_at desc" : "created_at desc";

    params.push(limit, offset);
    const limitIndex = params.length - 1;
    const offsetIndex = params.length;

    const [rows, countRows] = await Promise.all([
      sql.query<Record<string, unknown>>(
        "select id,name,phone,people_count,job,deal,property_type,neighborhood,floor_preference,consultant,note,status,source, " +
          "acquisition_source,acquisition_medium,acquisition_campaign,acquisition_referrer,follow_up_at,last_contacted_at,property_id,visit_preferred_at,visit_requested_at,visit_status,lease_deadline, " +
          "budget_deposit,budget_rent,budget_purchase,budget_sale,budget_deposit_min,budget_deposit_max,budget_rent_min,budget_rent_max,budget_purchase_min,budget_purchase_max,budget_sale_min,budget_sale_max,budget_equivalent,budget_bedrooms,budget_rate,requested_bedrooms,requested_amenities,matched_properties,match_count,callback_preferred_at,offer_amount,offer_conditions,created_at, " + "(case when status in ('closed','spam') then 0 else (case when status='new' then 28 when status='follow_up' then 22 when status='visited' then 18 when status='contract' then 10 else 14 end) + (case when follow_up_at is not null and follow_up_at <= current_timestamp then 28 when follow_up_at is not null and follow_up_at <= current_timestamp + interval '48 hours' then 16 else 0 end) + (case when visit_status='requested' then 22 when visit_status='confirmed' then 12 else 0 end) + (case when offer_amount is not null then 12 else 0 end) + (case when match_count > 0 then 7 else 0 end) + (case when created_at >= current_timestamp - interval '48 hours' then 5 else 0 end) end)" + " as priority_score " +
          `from leads where ${conditions.join(" and ")} order by ${orderBy} ` +
          `limit $${limitIndex} offset $${offsetIndex}`,
        params,
      ),
      sql.query<{ count: number }>(
        `select count(*)::int as count from leads where ${conditions.join(" and ")}`,
        params.slice(0, params.length - 2),
      ),
    ]);

    return {
      total: Number(countRows[0]?.count) || 0,
      leads: rows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        phone: String(row.phone),
        peopleCount: row.people_count == null ? null : Number(row.people_count),
        job: String(row.job ?? ""),
        deal: String(row.deal),
        propertyType: String(row.property_type ?? ""),
        neighborhood: String(row.neighborhood ?? ""),
        floorPreference: String(row.floor_preference ?? ""),
        requestedBedrooms: row.requested_bedrooms == null ? null : Number(row.requested_bedrooms),
        requestedAmenities: Array.isArray(row.requested_amenities) ? row.requested_amenities.map(String) : [],
        consultant: String(row.consultant ?? ""),
        note: String(row.note ?? ""),
        status: String(row.status) as Status,
        source: String(row.source ?? "website"),
        acquisitionSource: row.acquisition_source == null ? null : String(row.acquisition_source),
        acquisitionMedium: row.acquisition_medium == null ? null : String(row.acquisition_medium),
        acquisitionCampaign: row.acquisition_campaign == null ? null : String(row.acquisition_campaign),
        acquisitionReferrer: row.acquisition_referrer == null ? null : String(row.acquisition_referrer),
        followUpAt: row.follow_up_at == null ? null : new Date(String(row.follow_up_at)).toISOString(),
        propertyId: row.property_id == null ? null : String(row.property_id),
        callbackPreferredAt: row.callback_preferred_at == null ? null : new Date(String(row.callback_preferred_at)).toISOString(),
        offerAmount: row.offer_amount == null ? null : Number(row.offer_amount),
        offerConditions: String(row.offer_conditions ?? ""),
        visitPreferredAt: row.visit_preferred_at == null ? null : new Date(String(row.visit_preferred_at)).toISOString(),
        visitRequestedAt: row.visit_requested_at == null ? null : new Date(String(row.visit_requested_at)).toISOString(),
        visitStatus:
          row.visit_status === "requested" || row.visit_status === "confirmed" || row.visit_status === "completed" || row.visit_status === "cancelled"
            ? row.visit_status
            : "none",
        lastContactedAt: row.last_contacted_at == null ? null : new Date(String(row.last_contacted_at)).toISOString(),
        leaseDeadline: row.lease_deadline == null ? null : String(row.lease_deadline),
        budgetDeposit: row.budget_deposit == null ? null : Number(row.budget_deposit),
        budgetRent: row.budget_rent == null ? null : Number(row.budget_rent),
        budgetPurchase: row.budget_purchase == null ? null : Number(row.budget_purchase),
        budgetSale: row.budget_sale == null ? null : Number(row.budget_sale),
        budgetDepositMin: row.budget_deposit_min == null ? null : Number(row.budget_deposit_min),
        budgetDepositMax: row.budget_deposit_max == null ? null : Number(row.budget_deposit_max),
        budgetRentMin: row.budget_rent_min == null ? null : Number(row.budget_rent_min),
        budgetRentMax: row.budget_rent_max == null ? null : Number(row.budget_rent_max),
        budgetPurchaseMin: row.budget_purchase_min == null ? null : Number(row.budget_purchase_min),
        budgetPurchaseMax: row.budget_purchase_max == null ? null : Number(row.budget_purchase_max),
        budgetSaleMin: row.budget_sale_min == null ? null : Number(row.budget_sale_min),
        budgetSaleMax: row.budget_sale_max == null ? null : Number(row.budget_sale_max),
        budgetEquivalent: row.budget_equivalent == null ? null : Number(row.budget_equivalent),
        budgetBedrooms: row.budget_bedrooms == null ? null : Number(row.budget_bedrooms),
        budgetRate: row.budget_rate == null ? null : Number(row.budget_rate),
        priorityScore: Number(row.priority_score) || 0,
        priority: (Number(row.priority_score) || 0) >= 70 ? "hot" : (Number(row.priority_score) || 0) >= 45 ? "warm" : "cold",
        matchCount: Number(row.match_count) || 0,
        matchedProperties: Array.isArray(row.matched_properties) ? row.matched_properties : [],
        createdAt: new Date(String(row.created_at)).toISOString(),
      })),
    };
  }

  if (body.action === "create_overdue_tasks") {
    const overdue = await sql.query<Record<string, unknown>>("select id, name, deal, neighborhood from leads where status not in ('closed','spam') and follow_up_at is not null and follow_up_at <= current_timestamp order by follow_up_at asc limit 500");
    let created = 0;
    for (const row of overdue) {
      const exists = await sql.query<{ id: string }>("select id from admin_tasks where entity_type='lead' and entity_id=$1 and status='open' limit 1",[String(row.id)]).catch(()=>[]);
      if (exists.length) continue;
      await sql.query("insert into admin_tasks(id,title,description,status,priority,due_at,assignee,entity_type,entity_id) values($1,$2,$3,'open','high',current_timestamp,'تیم هیرمند','lead',$4)",[crypto.randomUUID(),"پیگیری فوری لید: "+String(row.name||"مشتری"),"لید "+String(row.deal||"درخواست ملکی")+(row.neighborhood?" · "+String(row.neighborhood):"")+" از موعد پیگیری عبور کرده است.",String(row.id)]);
      created++;
    }
    return { success:true, created };
  }

  if (!body.id) {
    throw createError({
      statusCode: 400,
      statusMessage: "شناسه درخواست مشخص نیست.",
    });
  }

  if (body.action === "status") {
    if (!body.status || !STATUSES.includes(body.status)) {
      throw createError({
        statusCode: 400,
        statusMessage: "وضعیت درخواست معتبر نیست.",
      });
    }
    const rows = await sql.query<{ id: string }>(
      "update leads set status=$2, follow_up_at=$3, last_contacted_at=case when $2='contacted' then current_timestamp else last_contacted_at end, updated_at=current_timestamp where id=$1 returning id",
      [
        body.id,
        body.status,
        ["new", "contacted", "follow_up", "visited"].includes(body.status) ? new Date(Date.now() + (body.status === "new" ? 24 : body.status === "visited" ? 72 : 48) * 60 * 60 * 1000).toISOString() : null,
      ],
    );
    if (!rows[0]) {
      throw createError({ statusCode: 404, statusMessage: "درخواست پیدا نشد." });
    }
    await sql.query(
      "insert into lead_activities (lead_id, activity_type, title, note, metadata) values ($1,'status',$2,$3,$4::jsonb)",
      [
        body.id,
        "وضعیت تغییر کرد",
        "وضعیت جدید: " + (body.status ?? ""),
        JSON.stringify({ status: body.status }),
      ],
    ).catch(() => {});
    return { success: true };
  }

  if (body.action === "visit_status") {
    const visitStatus = body.visitStatus;
    if (!visitStatus || !["none","requested","confirmed","completed","cancelled"].includes(visitStatus)) {
      throw createError({ statusCode: 400, statusMessage: "وضعیت بازدید معتبر نیست." });
    }
    const rows = await sql.query<{ id: string }>(
      "update leads set visit_status=$2, updated_at=current_timestamp where id=$1 returning id",
      [body.id, visitStatus],
    );
    if (!rows[0]) throw createError({ statusCode: 404, statusMessage: "درخواست پیدا نشد." });
    await sql.query(
      "insert into lead_activities (lead_id, activity_type, title, note, metadata) values ($1,'visit',$2,$3,$4::jsonb)",
      [body.id, "وضعیت بازدید تغییر کرد", "وضعیت بازدید: " + visitStatus, "", JSON.stringify({ visitStatus })],
    ).catch(() => {});
    return { success: true, visitStatus };
  }

  if (body.action === "note") {
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 4000) : "";
    const rows = await sql.query<{ note: string | null }>(
      "update leads set note=$2, updated_at=current_timestamp where id=$1 returning note",
      [body.id, note],
    );
    if (!rows[0]) {
      throw createError({ statusCode: 404, statusMessage: "درخواست پیدا نشد." });
    }
    await sql.query(
      "insert into lead_activities (lead_id, activity_type, title, note) values ($1,'note',$2,$3)",
      [body.id, "یادداشت داخلی به‌روزرسانی شد", rows[0].note ?? ""],
    ).catch(() => {});
    return { success: true, note: rows[0].note ?? "" };
  }

  if (body.action === "follow_up") {
    const raw = body.followUpAt;
    const followUpAt =
      raw == null || raw === ""
        ? null
        : (() => {
            const date = new Date(String(raw));
            return Number.isFinite(date.getTime()) ? date.toISOString() : null;
          })();
    if (raw != null && raw !== "" && followUpAt == null) {
      throw createError({ statusCode: 400, statusMessage: "زمان پیگیری نامعتبر است." });
    }

    const rows = await sql.query<{ id: string; follow_up_at: string | null }>(
      "update leads set follow_up_at=$2, status=case when $2 is not null and status='new' then 'follow_up' else status end, updated_at=current_timestamp where id=$1 returning id, follow_up_at",
      [body.id, followUpAt],
    );
    if (!rows[0]) throw createError({ statusCode: 404, statusMessage: "درخواست پیدا نشد." });

    await sql.query(
      "insert into lead_activities (lead_id, activity_type, title, note, metadata) values ($1,'follow_up',$2,$3,$4::jsonb)",
      [
        body.id,
        followUpAt ? "پیگیری زمان‌بندی شد" : "پیگیری حذف شد",
        followUpAt ? "زمان پیگیری: " + followUpAt : "زمان پیگیری بعدی پاک شد.",
        JSON.stringify({ followUpAt }),
      ],
    );
    return { success: true, followUpAt: rows[0].follow_up_at };
  }

  if (body.action === "activity") {
    const allowed = ["note","call","whatsapp","match","visit","follow_up","status","document"];
    const activityType = typeof body.activityType === "string" && allowed.includes(body.activityType)
      ? body.activityType
      : "note";
    const title = typeof body.activityTitle === "string" ? body.activityTitle.trim().slice(0, 180) : "";
    const note = typeof body.activityNote === "string" ? body.activityNote.trim().slice(0, 4000) : "";
    if (!title && !note) {
      throw createError({ statusCode: 400, statusMessage: "عنوان یا توضیح فعالیت را وارد کنید." });
    }

    const rows = await sql.query<{ id: number; created_at: string }>(
      "insert into lead_activities (lead_id, activity_type, title, note, metadata) values ($1,$2,$3,$4,$5::jsonb) returning id, created_at",
      [body.id, activityType, title || "فعالیت", note, JSON.stringify(body.activityMetadata ?? {})],
    );
    if (!rows[0]) throw createError({ statusCode: 500, statusMessage: "ثبت فعالیت انجام نشد." });
    return { success: true, id: Number(rows[0].id), createdAt: new Date(String(rows[0].created_at)).toISOString() };
  }

  if (body.action === "activities") {
    const rows = await sql.query<Record<string, unknown>>(
      "select id, activity_type, title, note, metadata, created_at from lead_activities where lead_id=$1 order by created_at desc, id desc limit 100",
      [body.id],
    );
    return {
      activities: rows.map((row) => ({
        id: Number(row.id),
        type: String(row.activity_type),
        title: String(row.title ?? ""),
        note: String(row.note ?? ""),
        metadata: row.metadata ?? {},
        createdAt: new Date(String(row.created_at)).toISOString(),
      })),
    };
  }

  if (body.action === "delete") {
    const rows = await sql.query<{ id: string }>(
      "delete from leads where id=$1 returning id",
      [body.id],
    );
    if (!rows[0]) {
      throw createError({ statusCode: 404, statusMessage: "درخواست پیدا نشد." });
    }
    return { success: true };
  }

  throw createError({
    statusCode: 400,
    statusMessage: "عملیات نامعتبر است.",
  });
});
