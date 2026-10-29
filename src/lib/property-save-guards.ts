export type PropertyDuplicateKey = {
  status: string;
  title: string;
  transactionType: string;
  propertyType: string;
  neighborhood: string;
  areaM2?: number | null;
  price?: string | number | null;
  deposit?: string | number | null;
  rent?: string | number | null;
};

const textKey = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase();
const nullableKey = (value: unknown) => (value == null || value === "" ? "" : String(value));

export type PropertyStatus = "draft" | "published" | "archived";

export function resolvePropertySaveStatus(requested: PropertyStatus | undefined, existingStatus: unknown): PropertyStatus {
  if (requested) return requested;
  if (existingStatus === "draft" || existingStatus === "published" || existingStatus === "archived") {
    return existingStatus;
  }
  return "draft";
}

export function propertyDuplicateKeyChanged(
  existing: Record<string, unknown> | null,
  next: PropertyDuplicateKey,
): boolean {
  if (!existing) return true;
  return (
    String(existing.status ?? "") !== next.status ||
    textKey(existing.title) !== textKey(next.title) ||
    String(existing.transaction_type ?? "") !== next.transactionType ||
    String(existing.property_type ?? "") !== next.propertyType ||
    textKey(existing.neighborhood) !== textKey(next.neighborhood) ||
    nullableKey(existing.area_m2) !== nullableKey(next.areaM2) ||
    nullableKey(existing.price) !== nullableKey(next.price) ||
    nullableKey(existing.deposit) !== nullableKey(next.deposit) ||
    nullableKey(existing.rent) !== nullableKey(next.rent)
  );
}

export type PublicationCriticalFields = Pick<
  PropertyDuplicateKey,
  "title" | "transactionType" | "neighborhood" | "price" | "deposit" | "rent"
> & { description: string; contactName: string; contactPhone: string };

export function publicationCriticalFieldsChanged(
  existing: Record<string, unknown> | null,
  next: PublicationCriticalFields,
): boolean {
  if (!existing || existing.status !== "published") return true;
  return (
    String(existing.transaction_type ?? "") !== next.transactionType ||
    String(existing.title ?? "") !== next.title ||
    String(existing.neighborhood ?? "") !== next.neighborhood ||
    String(existing.description ?? "") !== next.description ||
    String(existing.contact_name ?? "") !== next.contactName ||
    String(existing.contact_phone ?? "") !== next.contactPhone ||
    nullableKey(existing.price) !== nullableKey(next.price) ||
    nullableKey(existing.deposit) !== nullableKey(next.deposit) ||
    nullableKey(existing.rent) !== nullableKey(next.rent)
  );
}

export const EXACT_PROPERTY_DUPLICATE_SQL = `
  select id, title
  from properties
  where deleted_at is null
    and status in ('draft', 'published')
    and id <> $1
    and lower(trim(title)) = lower(trim($2))
    and transaction_type = $3
    and property_type = $4
    and lower(trim(neighborhood)) = lower(trim($5))
    and area_m2 is not distinct from $6::integer
    and price is not distinct from $7::numeric
    and deposit is not distinct from $8::numeric
    and rent is not distinct from $9::numeric
  order by updated_at desc
  limit 1
`;
