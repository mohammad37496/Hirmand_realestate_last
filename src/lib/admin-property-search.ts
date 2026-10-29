import { toLatinDigits } from "./property-search-utils.ts";

/** Normalize Persian/Arabic numerals and phone punctuation for admin searches. */
export function normalizeAdminPhoneSearch(value: unknown): string | null {
  const digits = toLatinDigits(value).replace(/\D/g, "");
  return digits.length >= 3 ? digits : null;
}

export const ADMIN_PROPERTY_PHONE_SEARCH_SQL = `
  or (
    $13::text is not null and (
      translate(coalesce(contact_phone,''), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789') ilike '%' || $13 || '%'
      or translate(coalesce(owner_phone,''), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789') ilike '%' || $13 || '%'
    )
  )
`;
