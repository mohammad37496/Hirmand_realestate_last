import type { Sql } from "./db.ts";
import { publicPropertyVisibilitySql } from "./public-property-visibility.ts";

export type PropertyOpenHouseCreateInput = {
  propertyId: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  note: string;
};

export type PropertyOpenHouseCreateResult =
  | { kind: "created"; id: string }
  | { kind: "not_found" }
  | { kind: "conflict" };

/** Serialize scheduled-event creation per property before checking overlap. */
export async function createPropertyOpenHouseEvent(
  sql: Sql,
  input: PropertyOpenHouseCreateInput,
): Promise<PropertyOpenHouseCreateResult> {
  if (typeof sql.transaction !== "function") {
    throw new Error("Database transaction support is required for open-house creation.");
  }

  return sql.transaction(async (transactionSql) => {
    const properties = await transactionSql.query<{ id: string }>(
      `select id from properties where id=$1 and ${publicPropertyVisibilitySql()} limit 1 for update`,
      [input.propertyId],
    );
    const property = properties[0];
    if (!property) return { kind: "not_found" };

    const overlaps = await transactionSql.query<{ id: string }>(
      "select id from property_open_houses where property_id=$1 and status='scheduled' and starts_at < $3 and ends_at > $2 limit 1",
      [property.id, input.startsAt, input.endsAt],
    );
    if (overlaps[0]) return { kind: "conflict" };

    const id = crypto.randomUUID();
    const inserted = await transactionSql.query<{ id: string }>(
      "insert into property_open_houses(id,property_id,starts_at,ends_at,capacity,note) values($1,$2,$3,$4,$5,$6) returning id",
      [id, property.id, input.startsAt, input.endsAt, input.capacity, input.note],
    );
    return inserted[0] ? { kind: "created", id: inserted[0].id } : { kind: "not_found" };
  });
}
