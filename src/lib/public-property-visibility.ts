/** SQL predicate shared by public property reads and public interactions. */
export function publicPropertyVisibilitySql(alias = "") {
  if (alias && !/^[a-z_][a-z0-9_]*$/i.test(alias)) {
    throw new Error("Invalid SQL alias for public property visibility predicate.");
  }
  const column = alias ? `${alias}.` : "";
  return `(${column}deleted_at is null) and (${column}status = 'published' or (${column}status = 'draft' and ${column}publish_at is not null and ${column}publish_at <= current_timestamp)) and (${column}unpublish_at is null or ${column}unpublish_at > current_timestamp)`;
}
