import { createError, defineEventHandler, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { TEAM } from "@/lib/site";

type StaffDirectoryItem = {
  id: string;
  name: string;
  role: string;
};

function bundledDirectory(): StaffDirectoryItem[] {
  return TEAM.map((person) => ({
    id: person.id,
    name: person.name,
    role: person.role,
  }));
}

function dedupe(items: StaffDirectoryItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.id.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default defineEventHandler(async (event) => {
  setResponseHeader(
    event,
    "cache-control",
    "public, max-age=30, stale-while-revalidate=300",
  );

  if (dbSource === "unconfigured") {
    return {
      success: true,
      source: "bundled",
      staff: bundledDirectory(),
    };
  }

  try {
    const sql = await getSql();
    const rows = await sql.query<{ id: string; name: string; role: string }>(
      "select id,name,role from consultants where is_active=true order by sort_order asc,name asc",
    );

    const databaseStaff = rows
      .map((row) => ({
        id: String(row.id ?? "").trim(),
        name: String(row.name ?? "").trim(),
        role: String(row.role ?? "").trim(),
      }))
      .filter((item) => item.id.length >= 2 && item.name.length >= 2 && item.role.length >= 2);

    const staff = dedupe([
      ...databaseStaff,
      ...bundledDirectory().filter(
        (item) => !databaseStaff.some(
          (databaseItem) => databaseItem.id.trim().toLowerCase() === item.id.trim().toLowerCase(),
        ),
      ),
    ]);

    return {
      success: true,
      source: databaseStaff.length > 0 ? "database" : "bundled",
      staff,
    };
  } catch {
    throw createError({
      statusCode: 503,
      statusMessage: "فهرست کارکنان هیرمند موقتاً در دسترس نیست.",
    });
  }
});
