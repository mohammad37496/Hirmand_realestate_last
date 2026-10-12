/**
 * Manual review actions for Divar files.
 *
 * The agency filter is deliberately strict, which means it produces false
 * positives. These are the human-in-the-loop escape hatches the panel needs:
 * approve an ad by hand, undo that approval, or purge drafts.
 *
 * Kept out of `@/lib/divar` (already ~1600 lines) but built on the same
 * internals so an approved ad is parsed exactly like a synced one.
 */
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertAdminServerFnOrigin } from "@/lib/admin-server-fn-guard.server";
import {
  CATEGORIES,
  DIVAR_API,
  fetchJson,
  getDivarAgencyReason,
  nullableInteger,
  parseDivarListing,
  strictNullableMoney,
  type ParsedListing,
} from "@/lib/divar";

/**
 * Duplicated from `@/lib/divar` on purpose, exactly like `attendance.ts`,
 * `properties.ts` and `consultants.ts`. It has to stay module-local: the only
 * callers are `createServerFn` handlers, whose bodies are stripped out of the
 * client bundle, so JS drops this function *and* the `admin-session.server`
 * import above. Re-exporting it (or importing it from another module) keeps
 * that binding reachable from client code, and the TanStack Start
 * import-protection plugin then fails the production build.
 */
async function requireAdmin() {
  const token = getCookie(ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(token))) {
    throw new Error("نشست مدیریت معتبر نیست. دوباره وارد پنل شوید.");
  }
  assertAdminServerFnOrigin();
  const claims = await getAdminSessionClaims(token);
  const role = normalizeAdminRole(claims?.role);
  if (!hasAdminPermission(role, "divar.import")) {
    throw new Error("دسترسی بررسی فایل‌های دیوار برای این حساب فعال نیست.");
  }
  return claims;
}

function tolerantMoney(value: string | null): string | null {
  if (!value) return null;
  try {
    return strictNullableMoney(value);
  } catch {
    return null;
  }
}

/** Rebuilds the list category a stored row came from (it is not persisted). */
function categoryOf(row: Record<string, unknown>): (typeof CATEGORIES)[number] {
  const house = row.property_type === "villa" ? "house-villa" : "apartment";
  const deal = row.transaction_type === "rent" ? "rent" : "sell";
  return `${house}-${deal}` as (typeof CATEGORIES)[number];
}

const approveSchema = z.object({
  id: z.string().min(1),
  /** Must be true for ads the filter still flags: overriding it is deliberate. */
  force: z.boolean().optional().default(false),
});

/**
 * Approves a filter-rejected ad by hand.
 *
 * Rejected rows are stored without a description or gallery (the filter drops
 * them before the detail is parsed), so the ad is re-read from Divar and the
 * row is backfilled first. Without that, "تأیید دستی" would publish an empty
 * listing. The override is durable: `importDivarFile` skips its agency re-check
 * for a row that was approved by a human.
 */
export const approveDivarFile = createServerFn({ method: "POST" })
  .validator(approveSchema)
  .handler(async ({ data }) => {
    const claims = await requireAdmin();
    if (normalizeAdminRole(claims?.role) === "staff") {
      throw new Error("تأیید دستی یا تغییر نتیجه فیلتر آگهی‌های دیوار فقط برای مدیر مجاز است.");
    }
    if (dbSource === "unconfigured") {
      throw new Error("DATABASE_URL تنظیم نشده است.");
    }

    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select * from divar_files where id = $1 limit 1`,
      [data.id],
    );
    const row = rows[0];
    if (!row) throw new Error("فایل دیوار پیدا نشد.");
    if (row.filter_status === "imported") {
      throw new Error("این فایل قبلاً در سایت منتشر شده است و تأیید دستی لازم ندارد.");
    }

    const token = String(row.token);
    let parsed: ParsedListing | null = null;
    let filterReason: string | null = null;
    let fetchError: string | null = null;

    try {
      const detail = await fetchJson<Record<string, unknown>>(
        `${DIVAR_API}/posts-v2/web/${encodeURIComponent(token)}`,
        { signal: AbortSignal.timeout(15_000) },
      );
      filterReason = getDivarAgencyReason(detail);
      parsed = parseDivarListing(
        detail,
        { title: row.title, district_persian: row.neighborhood },
        categoryOf(row),
        token,
      );
    } catch (error) {
      fetchError = error instanceof Error ? error.message : "خطای نامشخص";
    }

    // The first attempt must be explicit about *why* it stopped, so the panel
    // can ask for confirmation instead of overriding silently.
    if (!data.force) {
      if (fetchError) {
        throw new Error(
          `بررسی دوباره آگهی روی دیوار ممکن نشد (${fetchError}). برای تأیید دستی دوباره تلاش کنید.`,
        );
      }
      if (filterReason) {
        throw new Error(`این آگهی هنوز نشانه مشاور/آژانس دارد: ${filterReason}`);
      }
    }

    const sellerType =
      parsed?.sellerType ?? (row.seller_type == null ? null : String(row.seller_type));

    await sql.query(
      `update divar_files
          set filter_status = 'accepted',
              manual_override = true,
              reject_reason = null,
              seller_type = coalesce($2, seller_type),
              title = coalesce(nullif($3, ''), title),
              neighborhood = coalesce(nullif($4, ''), neighborhood),
              area_m2 = coalesce($5::integer, area_m2),
              bedrooms = coalesce($6::smallint, bedrooms),
              bathrooms = coalesce($7::smallint, bathrooms),
              floor = coalesce($8::smallint, floor),
              total_floors = coalesce($9::smallint, total_floors),
              built_year = coalesce($10::smallint, built_year),
              parking = parking or $11,
              elevator = elevator or $12,
              storage = storage or $13,
              price = coalesce($14::numeric(20,0), price),
              deposit = coalesce($15::numeric(20,0), deposit),
              rent = coalesce($16::numeric(20,0), rent),
              description = case when $17 <> '' then $17 else description end,
              features = case
                when jsonb_array_length($18::jsonb) > 0 then $18::jsonb
                else features
              end,
              images = case
                when jsonb_array_length($19::jsonb) > 0 then $19::jsonb
                else images
              end,
              latitude = coalesce($20::double precision, latitude),
              longitude = coalesce($21::double precision, longitude),
              floor_label = coalesce($22::text, floor_label),
              orientation = coalesce($23::text, orientation),
              updated_at = current_timestamp
        where id = $1`,
      [
        data.id,
        sellerType,
        parsed?.title ?? "",
        parsed?.neighborhood ?? "",
        nullableInteger(parsed?.areaM2),
        nullableInteger(parsed?.bedrooms),
        nullableInteger(parsed?.bathrooms),
        nullableInteger(parsed?.floor),
        nullableInteger(parsed?.totalFloors),
        nullableInteger(parsed?.builtYear),
        Boolean(parsed?.parking),
        Boolean(parsed?.elevator),
        Boolean(parsed?.storage),
        tolerantMoney(parsed?.price ?? null),
        tolerantMoney(parsed?.deposit ?? null),
        tolerantMoney(parsed?.rent ?? null),
        parsed?.description ?? "",
        JSON.stringify(parsed?.features ?? []),
        JSON.stringify(parsed?.images ?? []),
        parsed?.latitude ?? null,
        parsed?.longitude ?? null,
        parsed?.floorLabel ?? null,
        parsed?.orientation ?? null,
      ],
    );

    return {
      id: data.id,
      /** False when Divar was unreachable and only the status changed. */
      refetched: parsed != null,
      filterReason,
      imageCount: parsed?.images.length ?? 0,
    };
  });

const revokeSchema = z.object({ id: z.string().min(1) });

/** Puts a hand-approved file back under the agency filter. */
export const revokeDivarOverride = createServerFn({ method: "POST" })
  .validator(revokeSchema)
  .handler(async ({ data }) => {
    const claims = await requireAdmin();
    if (String(claims?.role ?? "") === "staff") {
      throw new Error("لغو تأیید دستی آگهی‌های دیوار فقط برای مدیر مجاز است.");
    }
    if (dbSource === "unconfigured") {
      throw new Error("DATABASE_URL تنظیم نشده است.");
    }
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select id, filter_status, manual_override from divar_files where id = $1 limit 1`,
      [data.id],
    );
    const row = rows[0];
    if (!row) throw new Error("فایل دیوار پیدا نشد.");
    if (row.filter_status === "imported") {
      throw new Error(
        "این فایل روی سایت منتشر شده است؛ ابتدا آن را از فهرست فایل‌های سایت حذف کنید.",
      );
    }
    if (!row.manual_override) throw new Error("این فایل تأیید دستی ندارد.");

    await sql.query(
      `update divar_files
          set filter_status = 'rejected',
              manual_override = false,
              reject_reason = coalesce(reject_reason, $2),
              updated_at = current_timestamp
        where id = $1`,
      [data.id, "تأیید دستی لغو شد و فایل به فهرست ردشده‌ها بازگشت."],
    );
    return { id: data.id };
  });

const deleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

/**
 * Removes draft Divar rows. Published files are protected: deleting the row
 * would orphan the live listing, so it is skipped and reported back instead.
 */
export const deleteDivarFiles = createServerFn({ method: "POST" })
  .validator(deleteSchema)
  .handler(async ({ data }) => {
    const claims = await requireAdmin();
    if (String(claims?.role ?? "") === "staff") {
      throw new Error("حذف فایل‌های دیوار فقط برای مدیر مجاز است.");
    }
    if (dbSource === "unconfigured") {
      throw new Error("DATABASE_URL تنظیم نشده است.");
    }
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `delete from divar_files
        where id = any($1::text[])
          and filter_status <> 'imported'
        returning id`,
      [data.ids],
    );
    return { deleted: rows.length, skipped: Math.max(0, data.ids.length - rows.length) };
  });
