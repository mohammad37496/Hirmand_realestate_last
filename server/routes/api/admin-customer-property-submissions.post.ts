import { createError, defineEventHandler, getCookie, readBody, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { TEAM } from "@/lib/site";
import { isAllowedMediaRef, isVideoUrl } from "@/lib/media";
import { propertyInputSchema } from "@/lib/properties";
import { clearPropertyReadCache } from "@/lib/property-read-cache.server";
import { getPublishReadiness } from "@/lib/property-publish-readiness";

type Action = "list" | "approve" | "reject" | "update" | "set_priority" | "history" | "bulk_set_priority" | "bulk_reject" | "export" | "assign_consultant";

function slugify(value: string) {
  const normalized = value.trim().toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "property";
}

function money(value: unknown) {
  if (value == null) return null;
  const text = String(value).replace(/[^0-9]/g, "");
  return text ? text : null;
}

async function logReviewEvent(sql: Awaited<ReturnType<typeof getSql>>, submissionId: string, action: string, note = "", metadata: Record<string, unknown> = {}) {
  await sql.query(
    "insert into customer_property_submission_events (id,submission_id,action,note,metadata) values ($1,$2,$3,$4,$5::jsonb)",
    [crypto.randomUUID(), submissionId, action, note.slice(0, 1200), JSON.stringify(metadata)],
  ).catch(() => {});
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست. دوباره وارد پنل شوید." });
  }
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "property.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی بررسی و انتشار فایل‌های ارسالی مشتریان برای این حساب فعال نیست." });
  }
  if (dbSource === "unconfigured") return { submissions: [], total: 0, counts: { pending: 0, approved: 0, rejected: 0 } };

  const body = (await readBody(event)) as {
    action?: Action;
    id?: string;
    status?: "pending" | "approved" | "rejected";
    reviewNote?: string;
    consultantName?: string;
    consultantPhone?: string;
    query?: string;
    patch?: Record<string, unknown>;
    priority?: "low" | "normal" | "high";
    ids?: string[];
    page?: number;
    pageSize?: number;
    fromDate?: string;
    toDate?: string;
    assignedConsultantName?: string;
    assignedConsultantPhone?: string;
    queueFilter?: "all" | "overdue" | "unassigned" | "high";
  };
  const action = body.action ?? "list";
  const sql = await getSql();

  if (action === "list") {
    const status = body.status && ["pending","approved","rejected"].includes(body.status) ? body.status : "pending";
    const query = typeof body.query === "string" ? body.query.trim().slice(0, 80) : "";
    const pattern = "%" + query + "%";
    const fromDate = typeof body.fromDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.fromDate) ? body.fromDate : "";
    const toDate = typeof body.toDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.toDate) ? body.toDate : "";
    const queueFilter = body.queueFilter && ["all","overdue","unassigned","high"].includes(body.queueFilter) ? body.queueFilter : "all";
    const requestedPage = Number.isInteger(body.page) ? Number(body.page) : 1;
    const page = Math.min(Math.max(requestedPage, 1), 10000);
    const requestedPageSize = Number.isInteger(body.pageSize) ? Number(body.pageSize) : 20;
    const pageSize = [10, 20, 40].includes(requestedPageSize) ? requestedPageSize : 20;
    const offset = (page - 1) * pageSize;
    const rows = await sql.query<Record<string, unknown>>(
      `select s.id,s.lead_id,s.public_tracking_token,s.status,s.owner_name,s.owner_phone,s.property_data,s.review_note,s.property_id,s.created_at,s.reviewed_at,s.priority,s.updated_at,s.queue_started_at,s.assigned_consultant_name,s.assigned_consultant_phone,
        (
          exists(select 1 from customer_property_submissions d where d.id<>s.id and d.status in ('pending','approved') and (
            d.owner_phone=s.owner_phone
            or ((d.property_data->>'neighborhood')=(s.property_data->>'neighborhood') and (d.property_data->>'areaM2')=(s.property_data->>'areaM2') and lower(coalesce(d.property_data->>'title',''))=lower(coalesce(s.property_data->>'title','')))
          ))
          or exists(select 1 from properties p where p.status <> 'archived' and (
            p.owner_phone=s.owner_phone
            or ((p.neighborhood=(s.property_data->>'neighborhood')) and coalesce(p.area_m2,0)::text=(s.property_data->>'areaM2') and lower(coalesce(p.title,''))=lower(coalesce(s.property_data->>'title','')))
          ))
        ) as possible_duplicate
      from customer_property_submissions s
      where s.status=$1
        and ($2='' or s.owner_name ilike $3 or s.owner_phone ilike $3 or s.public_tracking_token ilike $3 or coalesce(s.property_data->>'title','') ilike $3 or coalesce(s.property_data->>'neighborhood','') ilike $3)
        and ($4='' or s.created_at >= $4::date)
        and ($5='' or s.created_at < ($5::date + interval '1 day'))
        and ($6='all' or ($6='overdue' and coalesce(s.queue_started_at,s.created_at) < current_timestamp - interval '24 hours') or ($6='unassigned' and coalesce(s.assigned_consultant_phone,'')='') or ($6='high' and s.priority='high'))
      order by case s.priority when 'high' then 0 when 'normal' then 1 else 2 end, coalesce(s.queue_started_at,s.created_at) asc
      limit $7 offset $8`,
      [status, query, pattern, fromDate, toDate, queueFilter, pageSize, offset],
    );
    const totalRows = await sql.query<{ count: number }>(
      `select count(*)::int as count
       from customer_property_submissions s
       where s.status=$1
         and ($2='' or s.owner_name ilike $3 or s.owner_phone ilike $3 or s.public_tracking_token ilike $3 or coalesce(s.property_data->>'title','') ilike $3 or coalesce(s.property_data->>'neighborhood','') ilike $3)
         and ($4='' or s.created_at >= $4::date)
         and ($5='' or s.created_at < ($5::date + interval '1 day'))
         and ($6='all' or ($6='overdue' and coalesce(s.queue_started_at,s.created_at) < current_timestamp - interval '24 hours') or ($6='unassigned' and coalesce(s.assigned_consultant_phone,'')='') or ($6='high' and s.priority='high'))`,
      [status, query, pattern, fromDate, toDate, queueFilter],
    );
    const countRows = await sql.query<{ status: string; count: number }>(
      "select status,count(*)::int as count from customer_property_submissions group by status",
    );
    const counts = { pending: 0, approved: 0, rejected: 0 };
    for (const row of countRows) {
      if (row.status === "pending" || row.status === "approved" || row.status === "rejected") counts[row.status] = Number(row.count) || 0;
    }
    const total = Number(totalRows[0]?.count) || 0;
    const workloadRows = await sql.query<{ assigned_consultant_phone: string | null; count: number }>(
      "select assigned_consultant_phone,count(*)::int as count from customer_property_submissions where status='pending' group by assigned_consultant_phone",
    ).catch(() => [] as { assigned_consultant_phone: string | null; count: number }[]);
    const workloadByPhone = new Map(workloadRows.map((row) => [String(row.assigned_consultant_phone ?? ""), Number(row.count) || 0]));
    const slaRows = await sql.query<{ overdue: number; high_priority: number; unassigned: number; average_age_hours: number | null }>(
      "select count(*) filter (where coalesce(queue_started_at,created_at) < current_timestamp - interval '24 hours')::int as overdue, count(*) filter (where priority='high')::int as high_priority, count(*) filter (where assigned_consultant_phone is null or assigned_consultant_phone='')::int as unassigned, avg(extract(epoch from (current_timestamp-coalesce(queue_started_at,created_at)))/3600)::float8 as average_age_hours from customer_property_submissions where status='pending'",
    ).catch(() => [{ overdue: 0, high_priority: 0, unassigned: 0, average_age_hours: 0 }]);
    const sla = slaRows[0] ?? { overdue: 0, high_priority: 0, unassigned: 0, average_age_hours: 0 };
    return {
      total,
      page,
      pageSize,
      counts,
      queueStats: {
        overdue: Number(sla.overdue) || 0,
        highPriority: Number(sla.high_priority) || 0,
        unassigned: Number(sla.unassigned) || 0,
        averageAgeHours: Number(sla.average_age_hours) || 0,
        consultants: TEAM.map((person) => ({
          name: person.name,
          phone: person.phone,
          count: workloadByPhone.get(person.phone) ?? 0,
        })),
      },
      submissions: rows.map((row) => ({
        id: String(row.id),
        leadId: row.lead_id == null ? null : String(row.lead_id),
        trackingToken: String(row.public_tracking_token),
        status: String(row.status),
        ownerName: String(row.owner_name ?? ""),
        ownerPhone: String(row.owner_phone ?? ""),
        propertyData: row.property_data && typeof row.property_data === "object" ? row.property_data : {},
        reviewNote: String(row.review_note ?? ""),
        propertyId: row.property_id == null ? null : String(row.property_id),
        createdAt: new Date(String(row.created_at)).toISOString(),
        reviewedAt: row.reviewed_at == null ? null : new Date(String(row.reviewed_at)).toISOString(),
        priority: String(row.priority ?? "normal"),
        updatedAt: row.updated_at == null ? null : new Date(String(row.updated_at)).toISOString(),
        ageHours: Math.max(0, (Date.now() - new Date(String(row.queue_started_at ?? row.created_at)).getTime()) / 3600000),
        possibleDuplicate: Boolean(row.possible_duplicate),
        assignedConsultantName: row.assigned_consultant_name == null ? null : String(row.assigned_consultant_name),
        assignedConsultantPhone: row.assigned_consultant_phone == null ? null : String(row.assigned_consultant_phone),
      })),
    };
  }

  if (action === "assign_consultant") {
    if (!body.id) throw createError({ statusCode: 400, statusMessage: "شناسه درخواست مشخص نیست." });
    const name = typeof body.assignedConsultantName === "string" ? body.assignedConsultantName.trim() : "";
    const phone = typeof body.assignedConsultantPhone === "string" ? body.assignedConsultantPhone.trim() : "";
    const consultant = name && phone ? TEAM.find((person) => person.name === name && person.phone === phone) : null;
    if (name || phone) {
      if (!consultant) throw createError({ statusCode: 422, statusMessage: "مشاور انتخاب‌شده معتبر نیست." });
    }
    const rows = await sql.query<{ id: string; status: string }>("select id,status from customer_property_submissions where id=$1 limit 1",[body.id]);
    if (!rows[0]) throw createError({ statusCode: 404, statusMessage: "درخواست ثبت ملک پیدا نشد." });
    if (rows[0].status !== "pending") throw createError({ statusCode: 409, statusMessage: "تخصیص مشاور فقط برای پرونده‌های در انتظار بررسی انجام می‌شود." });
    await sql.query(
      "update customer_property_submissions set assigned_consultant_name=$2,assigned_consultant_phone=$3,assigned_at=current_timestamp,updated_at=current_timestamp where id=$1",
      [body.id, consultant?.name ?? null, consultant?.phone ?? null],
    );
    await logReviewEvent(sql, body.id, "assign", consultant ? "پرونده به " + consultant.name + " تخصیص یافت." : "مسئول پرونده برداشته شد.", {
      consultantName: consultant?.name ?? null,
      consultantPhone: consultant?.phone ?? null,
    });
    return { success: true, assignedConsultantName: consultant?.name ?? null, assignedConsultantPhone: consultant?.phone ?? null };
  }

  if (action === "bulk_set_priority" || action === "bulk_reject") {
    const ids = Array.from(new Set(Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim()) : [])).slice(0, 50);
    if (!ids.length) throw createError({ statusCode: 422, statusMessage: "حداقل یک پرونده را انتخاب کنید." });

    if (action === "bulk_set_priority") {
      const priority = body.priority;
      if (!priority || !["low","normal","high"].includes(priority)) {
        throw createError({ statusCode: 422, statusMessage: "اولویت نامعتبر است." });
      }
      const targets = await sql.query<{ id: string }>(
        "select id from customer_property_submissions where id = any($1::text[]) and status='pending'",
        [ids],
      );
      if (!targets.length) return { success: true, updatedCount: 0, priority };
      await sql.query(
        "update customer_property_submissions set priority=$2,updated_at=current_timestamp where id = any($1::text[]) and status='pending'",
        [ids, priority],
      );
      for (const target of targets) {
        await logReviewEvent(sql, target.id, "priority", "اولویت پرونده به " + priority + " تغییر کرد.", { priority, bulk: true });
      }
      return { success: true, updatedCount: targets.length, priority };
    }

    const reviewNote = typeof body.reviewNote === "string" ? body.reviewNote.trim().slice(0, 1200) : "";
    const targets = await sql.query<{ id: string; lead_id: string | null }>(
      "select id,lead_id from customer_property_submissions where id = any($1::text[]) and status='pending'",
      [ids],
    );
    if (!targets.length) return { success: true, updatedCount: 0 };
    await sql.query(
      "update customer_property_submissions set status='rejected', review_note=$2, reviewed_at=current_timestamp, updated_at=current_timestamp where id = any($1::text[]) and status='pending'",
      [ids, reviewNote],
    );
    for (const target of targets) {
      if (target.lead_id) {
        await sql.query("update leads set status='closed', updated_at=current_timestamp where id=$1", [target.lead_id]).catch(() => {});
        await sql.query(
          "insert into lead_activities (lead_id,activity_type,title,note,metadata) values ($1,'status',$2,$3,$4::jsonb)",
          [target.lead_id, "ثبت ملک رد شد", reviewNote || "درخواست ثبت ملک توسط کارشناس رد شد.", JSON.stringify({ submissionId: target.id, bulk: true })],
        ).catch(() => {});
      }
      await logReviewEvent(sql, target.id, "reject", reviewNote || "درخواست ثبت ملک رد شد.", { bulk: true });
    }
    return { success: true, updatedCount: targets.length, status: "rejected" };
  }

  if (action === "export") {
    const status = body.status && ["pending","approved","rejected"].includes(body.status) ? body.status : "pending";
    const query = typeof body.query === "string" ? body.query.trim().slice(0, 80) : "";
    const pattern = "%" + query + "%";
    const fromDate = typeof body.fromDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.fromDate) ? body.fromDate : "";
    const toDate = typeof body.toDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.toDate) ? body.toDate : "";
    const queueFilter = body.queueFilter && ["all","overdue","unassigned","high"].includes(body.queueFilter) ? body.queueFilter : "all";
    const rows = await sql.query<Record<string, unknown>>(
      `select s.id,s.public_tracking_token,s.status,s.owner_name,s.owner_phone,s.property_data,s.created_at,s.reviewed_at,s.priority,
        (
          exists(select 1 from customer_property_submissions d where d.id<>s.id and d.status in ('pending','approved') and (
            d.owner_phone=s.owner_phone
            or ((d.property_data->>'neighborhood')=(s.property_data->>'neighborhood') and (d.property_data->>'areaM2')=(s.property_data->>'areaM2') and lower(coalesce(d.property_data->>'title',''))=lower(coalesce(s.property_data->>'title','')))
          ))
          or exists(select 1 from properties p where p.status <> 'archived' and (
            p.owner_phone=s.owner_phone
            or ((p.neighborhood=(s.property_data->>'neighborhood')) and coalesce(p.area_m2,0)::text=(s.property_data->>'areaM2') and lower(coalesce(p.title,''))=lower(coalesce(s.property_data->>'title','')))
          ))
        ) as possible_duplicate
       from customer_property_submissions s
       where s.status=$1
         and ($2='' or s.owner_name ilike $3 or s.owner_phone ilike $3 or s.public_tracking_token ilike $3 or coalesce(s.property_data->>'title','') ilike $3 or coalesce(s.property_data->>'neighborhood','') ilike $3)
         and ($4='' or s.created_at >= $4::date)
         and ($5='' or s.created_at < ($5::date + interval '1 day'))
         and ($6='all' or ($6='overdue' and coalesce(s.queue_started_at,s.created_at) < current_timestamp - interval '24 hours') or ($6='unassigned' and coalesce(s.assigned_consultant_phone,'')='') or ($6='high' and s.priority='high'))
       order by s.created_at desc`,
      [status, query, pattern, fromDate, toDate, queueFilter],
    );
    const txLabels: Record<string,string> = { buy:"خرید", sell:"فروش", rent:"اجاره", mortgage:"رهن" };
    const typeLabels: Record<string,string> = { apartment:"آپارتمان", villa:"ویلا و باغ", office:"اداری", heritage:"خانه اصیل", land:"زمین", commercial:"تجاری" };
    const statusLabels: Record<string,string> = { pending:"در انتظار", approved:"تأیید شده", rejected:"رد شده" };
    const priorityLabels: Record<string,string> = { low:"کم", normal:"عادی", high:"فوری" };
    const csvEscape = (value: unknown) => {
      const valueText = String(value ?? "");
      return /[",\n\r]/.test(valueText) ? '"' + valueText.replace(/"/g, '""') + '"' : valueText;
    };
    const headers = ["کد رهگیری","وضعیت","عنوان ملک","نوع معامله","نوع ملک","محله","متراژ","نام مالک","موبایل مالک","قیمت","رهن","اجاره","اولویت","تاریخ ثبت","تاریخ بررسی","تکراری"];
    const lines = [headers.map(csvEscape).join(",")];
    for (const row of rows) {
      const data = row.property_data && typeof row.property_data === "object" ? row.property_data as Record<string, unknown> : {};
      lines.push([
        row.public_tracking_token,
        statusLabels[String(row.status)] ?? String(row.status),
        data.title,
        txLabels[String(data.transactionType)] ?? String(data.transactionType ?? ""),
        typeLabels[String(data.propertyType)] ?? String(data.propertyType ?? ""),
        data.neighborhood,
        data.areaM2,
        row.owner_name,
        row.owner_phone,
        data.price,
        data.deposit,
        data.rent,
        priorityLabels[String(row.priority ?? "normal")] ?? String(row.priority ?? "normal"),
        row.created_at ? new Date(String(row.created_at)).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" }) : "",
        row.reviewed_at ? new Date(String(row.reviewed_at)).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" }) : "",
        row.possible_duplicate ? "بله" : "خیر",
      ].map(csvEscape).join(","));
    }
    setResponseHeader(event, "content-type", "text/csv; charset=utf-8");
    setResponseHeader(event, "content-disposition", 'attachment; filename="hirmand-customer-submissions.csv"');
    return "\ufeff" + lines.join("\r\n");
  }

  if (!body.id) throw createError({ statusCode: 400, statusMessage: "شناسه درخواست مشخص نیست." });

  if (action === "history") {
    const events = await sql.query<Record<string, unknown>>(
      "select id,action,note,metadata,created_at from customer_property_submission_events where submission_id=$1 order by created_at desc limit 50",
      [body.id],
    ).catch(() => [] as Record<string, unknown>[]);
    return {
      success: true,
      events: events.map((row) => ({
        id: String(row.id),
        action: String(row.action),
        note: String(row.note ?? ""),
        metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
        createdAt: new Date(String(row.created_at)).toISOString(),
      })),
    };
  }

  if (action === "set_priority") {
    const priority = body.priority;
    if (!priority || !["low","normal","high"].includes(priority)) {
      throw createError({ statusCode: 422, statusMessage: "اولویت نامعتبر است." });
    }
    const rows = await sql.query<Record<string, unknown>>(
      "select id,status from customer_property_submissions where id=$1 limit 1",
      [body.id],
    );
    if (!rows[0]) throw createError({ statusCode: 404, statusMessage: "درخواست ثبت ملک پیدا نشد." });
    await sql.query(
      "update customer_property_submissions set priority=$2,updated_at=current_timestamp where id=$1",
      [body.id, priority],
    );
    await logReviewEvent(sql, body.id, "priority", "اولویت پرونده به " + priority + " تغییر کرد.", { priority });
    return { success: true, status: String(rows[0].status), priority };
  }



  const rows = await sql.query<Record<string, unknown>>(
    "select * from customer_property_submissions where id=$1 limit 1",
    [body.id],
  );
  const submission = rows[0];
  if (!submission) throw createError({ statusCode: 404, statusMessage: "درخواست ثبت ملک پیدا نشد." });
  if (action === "approve" && String(submission.status) === "approved") {
    return { success: true, status: "approved", propertyId: submission.property_id ? String(submission.property_id) : null };
  }
  if (action === "reject" && String(submission.status) !== "pending") {
    throw createError({ statusCode: 409, statusMessage: "این درخواست قبلاً بررسی شده است." });
  }
  if (action === "approve" && String(submission.status) === "rejected") {
    throw createError({ statusCode: 409, statusMessage: "این درخواست قبلاً رد شده است." });
  }

  if (action === "update") {
    if (String(submission.status) !== "pending") {
      throw createError({ statusCode: 409, statusMessage: "فقط درخواست‌های در انتظار بررسی قابل ویرایش هستند." });
    }
    const patch = body.patch && typeof body.patch === "object" ? body.patch : {};
    const current = (submission.property_data && typeof submission.property_data === "object"
      ? submission.property_data
      : {}) as Record<string, unknown>;
    const next = { ...current };
    const editableKeys = [
      "title","transactionType","propertyType","neighborhood","address","areaM2","bedrooms","bathrooms","floor","totalFloors",
      "builtYear","orientation","cabinetType","flooringType","coolingSystem","heatingSystem",
      "wallClosetType","price","deposit","rent","description","features","images",
    ] as const;
    for (const key of editableKeys) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) next[key] = patch[key];
    }

    const title = String(next.title ?? "").trim();
    const transactionType = String(next.transactionType ?? "");
    const propertyType = String(next.propertyType ?? "");
    const neighborhood = String(next.neighborhood ?? "").trim();
    if (!["buy","sell","rent","mortgage"].includes(transactionType)) throw createError({ statusCode: 422, statusMessage: "نوع معامله معتبر نیست." });
    if (!["apartment","villa","office","heritage","land","commercial"].includes(propertyType)) throw createError({ statusCode: 422, statusMessage: "نوع ملک معتبر نیست." });
    const description = String(next.description ?? "").trim();
    const area = next.areaM2 == null || next.areaM2 === "" ? null : Number(next.areaM2);
    const parseOptionalInt = (value: unknown) => value == null || value === "" ? null : Number(value);
    if (title.length < 8 || title.length > 180) throw createError({ statusCode: 422, statusMessage: "عنوان ملک باید بین ۸ تا ۱۸۰ کاراکتر باشد." });
    if (neighborhood.length < 2 || neighborhood.length > 80) throw createError({ statusCode: 422, statusMessage: "محله ملک معتبر نیست." });
    if (description.length < 80 || description.length > 5000) throw createError({ statusCode: 422, statusMessage: "توضیحات ملک باید حداقل ۸۰ کاراکتر باشد." });
    if (area != null && (!Number.isInteger(area) || area < 1 || area > 100000)) throw createError({ statusCode: 422, statusMessage: "متراژ ملک معتبر نیست." });

    for (const [key, max] of [["bedrooms",30],["bathrooms",30],["floor",200],["totalFloors",200],["builtYear",2500]] as const) {
      const value = parseOptionalInt(next[key]);
      if (value != null && (!Number.isInteger(value) || (key === "floor" ? value < -60 || value > max : value < (key === "builtYear" ? 1200 : 0) || value > max))) {
        throw createError({ statusCode: 422, statusMessage: "مقدار " + key + " معتبر نیست." });
      }
      next[key] = value;
    }
    for (const key of ["price","deposit","rent"]) {
      const value = next[key];
      if (value != null && value !== "" && !/^\d{1,20}$/.test(String(value))) {
        throw createError({ statusCode: 422, statusMessage: "مبلغ مالی واردشده معتبر نیست." });
      }
      next[key] = value == null || value === "" ? null : String(value);
    }
    const hasMoney = (key: string) => Boolean(next[key] && /^\d{1,20}$/.test(String(next[key])));
    if (transactionType === "sell" && !hasMoney("price")) throw createError({ statusCode: 422, statusMessage: "برای فروش قیمت کل را وارد کنید." });
    if (transactionType === "rent" && !hasMoney("deposit") && !hasMoney("rent")) throw createError({ statusCode: 422, statusMessage: "برای اجاره حداقل رهن یا اجاره را وارد کنید." });
    if (transactionType === "mortgage" && !hasMoney("deposit")) throw createError({ statusCode: 422, statusMessage: "برای رهن مبلغ رهن را وارد کنید." });
    if (!Array.isArray(next.features) || next.features.some((item) => typeof item !== "string") || next.features.length > 20) {
      throw createError({ statusCode: 422, statusMessage: "ویژگی‌های ملک معتبر نیست." });
    }
    next.features = next.features.map((item) => item.trim()).filter(Boolean).slice(0, 20);
    if (!Array.isArray(next.images) || next.images.length < 1 || next.images.length > 20 || next.images.some((item) => typeof item !== "string" || !isAllowedMediaRef(item))) {
      throw createError({ statusCode: 422, statusMessage: "رسانه‌های ملک معتبر نیستند." });
    }
    const editedVideos = next.images.filter((item): item is string => typeof item === "string" && isVideoUrl(item));
    const editedImages = next.images.filter((item): item is string => typeof item === "string" && !isVideoUrl(item));
    if (!editedImages.length) throw createError({ statusCode: 422, statusMessage: "حداقل یک تصویر برای ملک لازم است." });
    if (editedVideos.length > 1) throw createError({ statusCode: 422, statusMessage: "حداکثر یک ویدئو مجاز است." });
    next.title = title;
    next.neighborhood = neighborhood;
    next.address = String(next.address ?? "").trim().slice(0, 240);
    next.description = description;

    await sql.query(
      "update customer_property_submissions set property_data=$2::jsonb, review_note=$3, updated_at=current_timestamp where id=$1",
      [body.id, JSON.stringify(next), "ویرایش اطلاعات توسط مدیر قبل از انتشار."],
    ).catch(async (error) => {
      const message = String(error instanceof Error ? error.message : error);
      if (!message.toLowerCase().includes("updated_at")) throw error;
      await sql.query(
        "update customer_property_submissions set property_data=$2::jsonb, review_note=$3 where id=$1",
        [body.id, JSON.stringify(next), "ویرایش اطلاعات توسط مدیر قبل از انتشار."],
      );
    });

    await logReviewEvent(sql, body.id, "edit", "اطلاعات و رسانه‌های پرونده قبل از انتشار ویرایش شد.");
    return {
      success: true,
      status: "pending",
      submission: {
        id: String(submission.id),
        leadId: submission.lead_id == null ? null : String(submission.lead_id),
        trackingToken: String(submission.public_tracking_token),
        status: "pending",
        ownerName: String(submission.owner_name ?? ""),
        ownerPhone: String(submission.owner_phone ?? ""),
        propertyData: next,
        reviewNote: "ویرایش اطلاعات توسط مدیر قبل از انتشار.",
        propertyId: submission.property_id == null ? null : String(submission.property_id),
        createdAt: new Date(String(submission.created_at)).toISOString(),
        reviewedAt: submission.reviewed_at == null ? null : new Date(String(submission.reviewed_at)).toISOString(),
        priority: String(submission.priority ?? "normal"),
        updatedAt: new Date().toISOString(),
        ageHours: Math.max(0, (Date.now() - new Date(String(submission.queue_started_at ?? submission.created_at)).getTime()) / 3600000),
      },
    };
  }

  if (action === "reject") {
    const reviewNote = typeof body.reviewNote === "string" ? body.reviewNote.trim().slice(0, 1200) : "";
    await sql.query(
      "update customer_property_submissions set status='rejected', review_note=$2, reviewed_at=current_timestamp, updated_at=current_timestamp where id=$1",
      [body.id, reviewNote],
    );
    if (submission.lead_id) {
      await sql.query("update leads set status='closed', updated_at=current_timestamp where id=$1", [submission.lead_id]).catch(() => {});
      await sql.query(
        "insert into lead_activities (lead_id,activity_type,title,note,metadata) values ($1,'status',$2,$3,$4::jsonb)",
        [submission.lead_id, "ثبت ملک رد شد", reviewNote || "درخواست ثبت ملک توسط کارشناس رد شد.", JSON.stringify({ submissionId: body.id })],
      ).catch(() => {});
    }
    await logReviewEvent(sql, body.id, "reject", reviewNote || "درخواست ثبت ملک رد شد.");
    return { success: true, status: "rejected" };
  }

  if (action === "approve") {
    const consultantName = typeof body.consultantName === "string" ? body.consultantName.trim() : "";
    const consultantPhone = typeof body.consultantPhone === "string" ? body.consultantPhone.trim() : "";
    const assignedName = String(submission.assigned_consultant_name ?? "").trim();
    const assignedPhone = String(submission.assigned_consultant_phone ?? "").trim();
    const consultant = TEAM.find((person) => person.name === (assignedName || consultantName) && person.phone === (assignedPhone || consultantPhone));
    if (!consultant) throw createError({ statusCode: 400, statusMessage: "برای انتشار این پرونده یک مشاور معتبر انتخاب یا تخصیص دهید." });

    const data = (submission.property_data && typeof submission.property_data === "object"
      ? submission.property_data
      : {}) as Record<string, unknown>;

    const propertyId = crypto.randomUUID();
    const media = Array.isArray(data.images) ? data.images.filter((item): item is string => typeof item === "string") : [];
    const propertyPayload = {
      id: propertyId,
      title: String(data.title ?? ""),
      transactionType: data.transactionType,
      propertyType: data.propertyType,
      neighborhood: String(data.neighborhood ?? ""),
      address: String(data.address ?? ""),
      areaM2: data.areaM2 == null ? null : Number(data.areaM2),
      bedrooms: data.bedrooms == null ? null : Number(data.bedrooms),
      bathrooms: data.bathrooms == null ? null : Number(data.bathrooms),
      floor: data.floor == null ? null : Number(data.floor),
      floorLabel: null,
      orientation: data.orientation ?? null,
      totalFloors: data.totalFloors == null ? null : Number(data.totalFloors),
      builtYear: data.builtYear == null ? null : Number(data.builtYear),
      parking: Boolean(data.parking),
      elevator: Boolean(data.elevator),
      storage: Boolean(data.storage),
      painted: Boolean(data.painted),
      wallpaper: Boolean(data.wallpaper),
      convertible: Boolean(data.convertible),
      cabinetType: String(data.cabinetType ?? "") || null,
      flooringType: String(data.flooringType ?? "") || null,
      coolingSystem: String(data.coolingSystem ?? "") || null,
      heatingSystem: String(data.heatingSystem ?? "") || null,
      wallClosetType: String(data.wallClosetType ?? "") || null,
      otherAmenities: Array.isArray(data.otherAmenities) ? data.otherAmenities.filter((item): item is string => typeof item === "string") : [],
      price: money(data.price),
      deposit: money(data.deposit),
      rent: money(data.rent),
      description: String(data.description ?? ""),
      features: Array.isArray(data.features) ? data.features.filter((item): item is string => typeof item === "string") : [],
      images: media,
      contactName: consultant.name,
      contactPhone: consultant.phone,
      ownerName: String(submission.owner_name ?? data.ownerName ?? ""),
      ownerPhone: String(submission.owner_phone ?? data.ownerPhone ?? ""),
      ownerInfo: "ارسال‌شده از فرم ثبت ملک مشتری — نیازمند نگهداری داخلی اطلاعات مالک.",
      status: "published",
      availabilityStatus: "available",
      featured: false,
      featuredUntil: null,
      internalPriority: "normal",
      internalNote: "منبع: ثبت ملک توسط مشتری | کد: " + String(submission.public_tracking_token),
      latitude: data.latitude == null ? null : Number(data.latitude),
      longitude: data.longitude == null ? null : Number(data.longitude),
    };

    const validated = propertyInputSchema.safeParse(propertyPayload);
    if (!validated.success) {
      throw createError({ statusCode: 422, statusMessage: validated.error.issues[0]?.message || "اطلاعات این ملک برای انتشار کامل نیست." });
    }

    const readiness = getPublishReadiness({
      transactionType: validated.data.transactionType,
      title: validated.data.title,
      neighborhood: validated.data.neighborhood,
      description: validated.data.description,
      contactName: validated.data.contactName,
      contactPhone: validated.data.contactPhone,
      price: validated.data.price ?? "",
      deposit: validated.data.deposit ?? "",
      rent: validated.data.rent ?? "",
      imageCount: validated.data.images.length,
      areaM2: validated.data.areaM2 == null ? "" : String(validated.data.areaM2),
      features: validated.data.features.join("\n"),
      latitude: validated.data.latitude ?? null,
      longitude: validated.data.longitude ?? null,
    });
    if (!readiness.ready) {
      throw createError({ statusCode: 422, statusMessage: "این ملک هنوز آماده انتشار نیست: " + readiness.blockers.join(" ") });
    }

    const slug = slugify(validated.data.title) + "-" + propertyId.slice(0, 8);
    const d = validated.data;
    const savedFloor = d.floorLabel === "suite" ? null : d.floor;
    await sql.query(
      "insert into properties (id,slug,status,featured,title,transaction_type,property_type,city,neighborhood,address,area_m2,bedrooms,bathrooms,floor,total_floors,built_year,parking,elevator,storage,cabinet_type,flooring_type,cooling_system,heating_system,wall_closet_type,other_amenities,price,deposit,rent,description,features,images,contact_name,contact_phone,published_at,featured_until,latitude,longitude,floor_label,painted,wallpaper,convertible,orientation,owner_name,owner_phone,owner_info,availability_status,internal_priority,internal_note) values ($1,$2,'published',false,$3,$4,$5,'اصفهان',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23,$24,$25,$26,$27::jsonb,$28::jsonb,$29,$30,current_timestamp,null,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,'available','normal',$41)",
      [
        d.id, slug, d.title, d.transactionType, d.propertyType, d.neighborhood, d.address || null,
        d.areaM2 ?? null, d.bedrooms ?? null, d.bathrooms ?? null, savedFloor, d.totalFloors ?? null, d.builtYear ?? null,
        d.parking, d.elevator, d.storage, d.cabinetType, d.flooringType, d.coolingSystem, d.heatingSystem, d.wallClosetType,
        JSON.stringify(d.otherAmenities), d.price, d.deposit, d.rent, d.description, JSON.stringify(d.features), JSON.stringify(d.images),
        d.contactName, d.contactPhone, d.latitude ?? null, d.longitude ?? null, d.floorLabel === "suite" ? "suite" : null,
        d.painted, d.wallpaper, d.convertible, d.orientation, d.ownerName ?? "", d.ownerPhone ?? "", d.ownerInfo ?? "",
        d.internalNote,
      ],
    );

    await sql.query(
      "insert into property_change_history (property_id,action,before_state,after_state) values ($1,'created',null,$2::jsonb)",
      [propertyId, JSON.stringify({ title:d.title, status:"published", source:"customer_property_submission", submissionId:body.id })],
    ).catch(() => {});

    await sql.query(
      "update customer_property_submissions set status='approved', property_id=$2, review_note=$3, reviewed_at=current_timestamp, updated_at=current_timestamp where id=$1",
      [body.id, propertyId, typeof body.reviewNote === "string" ? body.reviewNote.trim().slice(0,1200) : "تأیید و انتشار شد."],
    );
    await logReviewEvent(sql, body.id, "approve", typeof body.reviewNote === "string" ? body.reviewNote.trim() : "تأیید و انتشار شد.", { propertyId, propertySlug: slug, consultant: consultant.name });

    if (submission.lead_id) {
      await sql.query("update leads set status='contacted', updated_at=current_timestamp where id=$1", [submission.lead_id]).catch(() => {});
      await sql.query(
        "insert into lead_activities (lead_id,activity_type,title,note,metadata) values ($1,'status',$2,$3,$4::jsonb)",
        [submission.lead_id, "ملک مشتری تأیید و منتشر شد", "فایل با موفقیت در سایت منتشر شد.", JSON.stringify({ submissionId:body.id, propertyId, propertySlug:slug })],
      ).catch(() => {});
    }
    clearPropertyReadCache();
    return { success:true, status:"approved", propertyId, slug };
  }

  throw createError({ statusCode: 400, statusMessage: "عملیات نامعتبر است." });
});
