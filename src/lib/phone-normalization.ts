/** Keep only digits, translating Persian and Arabic-Indic numerals first. */
export function normalizePhoneDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/\D/g, "");
}

/** Canonical Iranian national form: 0 + ten national digits. */
export function normalizeIranianPhoneForMatch(value: string): string {
  let digits = normalizePhoneDigits(value);
  if (digits.startsWith("0098")) digits = digits.slice(4);
  else if (digits.startsWith("98")) digits = digits.slice(2);
  if (digits.length === 10) return `0${digits}`;
  return digits;
}

/** Return a validated Iranian E.164 number for tel: and structured contact links. */
export function toIranianE164Phone(value: string): string | null {
  const national = normalizeIranianPhoneForMatch(value);
  return /^0\d{10}$/.test(national) ? `+98${national.slice(1)}` : null;
}

/** WhatsApp expects the E.164 digits without the leading plus sign. */
export function toIranianWhatsAppNumber(value: string): string | null {
  return toIranianE164Phone(value)?.slice(1) ?? null;
}

/** SQL equivalent for matching legacy rows stored with different digit scripts or punctuation. */
export function normalizedIranianPhoneSql(columnSql: string): string {
  const digits = `regexp_replace(translate(coalesce(${columnSql}, ''), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'), '[^0-9]', '', 'g')`;
  const nationalDigits = `(case
    when ${digits} like '0098%' then substring(${digits} from 5)
    when ${digits} like '98%' then substring(${digits} from 3)
    else ${digits}
  end)`;
  return `(case when length(${nationalDigits}) = 10 then '0' || ${nationalDigits} else ${nationalDigits} end)`;
}
