import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertAdminServerFnOrigin } from "@/lib/admin-server-fn-guard.server";

export type AttendanceSession = {
  clockIn: string;
  clockOut: string;
};

export type AttendanceRecord = {
  id: string;
  consultantId: string;
  consultantName: string;
  workDate: string;
  sessions: AttendanceSession[];
  note: string;
  createdAt: string;
  updatedAt: string;
};

type AttendanceRow = {
  id: string;
  consultant_id: string;
  consultant_name: string;
  work_date: string;
  sessions: AttendanceSession[] | string;
  note: string;
  created_at: string;
  updated_at: string;
};

async function requireAdmin() {
  const session = getCookie(ADMIN_SESSION_COOKIE);
  if (await verifyAdminSessionToken(session)) {
    assertAdminServerFnOrigin();
    return;
  }
  throw new Error("نشست مدیریت معتبر نیست. دوباره وارد پنل شوید.");
}

function normalizeSessions(value: AttendanceRow["sessions"]): AttendanceSession[] {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.clockIn !== "string" || typeof row.clockOut !== "string") return [];
    return [{ clockIn: row.clockIn, clockOut: row.clockOut }];
  });
}

function normalize(row: AttendanceRow): AttendanceRecord {
  return {
    id: row.id,
    consultantId: row.consultant_id,
    consultantName: row.consultant_name,
    workDate: String(row.work_date),
    sessions: normalizeSessions(row.sessions),
    note: row.note ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "ساعت نامعتبر است.");

const attendanceInput = z.object({
  id: z.string().trim().min(1).max(100).optional(),
  consultantId: z.string().trim().min(2).max(80),
  consultantName: z.string().trim().min(2).max(100),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ نامعتبر است."),
  sessions: z.array(
    z.object({
      clockIn: timeSchema,
      clockOut: timeSchema,
    }),
  ).min(1).max(12),
  note: z.string().trim().max(500).optional().default(""),
});

function minutes(value: string) {
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

function validateSessions(sessions: AttendanceSession[]) {
  for (const session of sessions) {
    if (minutes(session.clockOut) <= minutes(session.clockIn)) {
      throw new Error("ساعت خروج باید بعد از ساعت ورود باشد.");
    }
  }
}

export const listAttendance = createServerFn({ method: "GET" })
  .validator(
    z.object({
      fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    if (data.fromDate > data.toDate) throw new Error("بازه تاریخ نامعتبر است.");
    const sql = await getSql();
    const rows = await sql.query<AttendanceRow>(
      `select id, consultant_id, consultant_name, work_date::text as work_date,
              sessions, note, created_at::text as created_at, updated_at::text as updated_at
       from staff_attendance
       where work_date between $1::date and $2::date
       order by work_date desc, consultant_name asc`,
      [data.fromDate, data.toDate],
    );
    return rows.map(normalize);
  });

export const saveAttendance = createServerFn({ method: "POST" })
  .validator(attendanceInput)
  .handler(async ({ data }) => {
    await requireAdmin();
    validateSessions(data.sessions);

    const sql = await getSql();
    if (data.id?.trim()) {
      await sql.query(
        `update staff_attendance
         set consultant_id = $2,
             consultant_name = $3,
             work_date = $4::date,
             sessions = $5::jsonb,
             note = $6,
             updated_at = current_timestamp
         where id = $1`,
        [data.id.trim(), data.consultantId, data.consultantName, data.workDate, JSON.stringify(data.sessions), data.note],
      );
    } else {
      const id = crypto.randomUUID();
      await sql.query(
        `insert into staff_attendance
          (id, consultant_id, consultant_name, work_date, sessions, note, created_at, updated_at)
         values ($1, $2, $3, $4::date, $5::jsonb, $6, current_timestamp, current_timestamp)
         on conflict (consultant_id, work_date) do update set
           consultant_name = excluded.consultant_name,
           sessions = excluded.sessions,
           note = excluded.note,
           updated_at = current_timestamp`,
        [id, data.consultantId, data.consultantName, data.workDate, JSON.stringify(data.sessions), data.note],
      );
    }

    const rows = await sql.query<AttendanceRow>(
      `select id, consultant_id, consultant_name, work_date::text as work_date,
              sessions, note, created_at::text as created_at, updated_at::text as updated_at
       from staff_attendance
       where consultant_id = $1 and work_date = $2::date
       limit 1`,
      [data.consultantId, data.workDate],
    );
    return rows[0] ? normalize(rows[0]) : null;
  });

export const deleteAttendance = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().trim().min(1).max(100) }))
  .handler(async ({ data }) => {
    await requireAdmin();
    const sql = await getSql();
    await sql.query("delete from staff_attendance where id = $1", [data.id]);
    return { ok: true };
  });
