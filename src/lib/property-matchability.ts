import { publicPropertyVisibilitySql } from "./public-property-visibility.ts";

/**
 * CRM recommendations must never suggest a property that a public visitor
 * cannot currently inquire about. Keep publication visibility in sync with
 * public listing reads and additionally require an available inventory state.
 * Legacy rows with a null availability_status are treated as available.
 */
export function matchablePropertyVisibilitySql(alias = "") {
  const column = alias ? `${alias}.` : "";
  return `(${publicPropertyVisibilitySql(alias)}) and coalesce(${column}availability_status, 'available') = 'available'`;
}
