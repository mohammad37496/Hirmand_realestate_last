/** Public listing facts whose mutation invalidates the manager's verification stamp. */
export const PROPERTY_VERIFICATION_FACT_COLUMNS = [
  "title",
  "transaction_type",
  "property_type",
  "neighborhood",
  "address",
  "area_m2",
  "bedrooms",
  "bathrooms",
  "floor",
  "total_floors",
  "built_year",
  "parking",
  "elevator",
  "storage",
  "cabinet_type",
  "flooring_type",
  "cooling_system",
  "heating_system",
  "wall_closet_type",
  "other_amenities",
  "price",
  "deposit",
  "rent",
  "latitude",
  "longitude",
  "virtual_tour_url",
  "floor_label",
  "painted",
  "wallpaper",
  "convertible",
  "orientation",
  "owner_name",
  "owner_phone",
  "owner_info",
  "floor_plan_url",
  "description",
  "features",
  "images",
  "contact_name",
  "contact_phone",
] as const;

/** Build a null-safe PostgreSQL row comparison from trusted SQL expressions. */
export function distinctRowSql(left: readonly string[], right: readonly string[]): string {
  if (left.length === 0 || left.length !== right.length) {
    throw new Error("A row comparison requires equally sized, non-empty expressions.");
  }
  return `(${left.join(", ")}) IS DISTINCT FROM (${right.join(", ")})`;
}

export function propertyVerificationChangedSql(
  currentAlias = "properties",
  incomingAlias = "excluded",
): string {
  return distinctRowSql(
    PROPERTY_VERIFICATION_FACT_COLUMNS.map((column) => `${currentAlias}.${column}`),
    PROPERTY_VERIFICATION_FACT_COLUMNS.map((column) => `${incomingAlias}.${column}`),
  );
}

export function propertyContactChangedSql(
  currentAlias = "properties",
  incomingName = "$1::text",
  incomingPhone = "$2::text",
): string {
  return distinctRowSql(
    [`${currentAlias}.contact_name`, `${currentAlias}.contact_phone`],
    [incomingName, incomingPhone],
  );
}

export function divarPropertyFactsChangedSql(currentAlias = "properties"): string {
  return distinctRowSql(
    [
      `${currentAlias}.images`,
      `${currentAlias}.latitude`,
      `${currentAlias}.longitude`,
      `${currentAlias}.floor`,
      `${currentAlias}.floor_label`,
      `${currentAlias}.orientation`,
    ],
    ["$2::jsonb", "$3::double precision", "$4::double precision", "$5::smallint", "$6::text", "$7::text"],
  );
}
