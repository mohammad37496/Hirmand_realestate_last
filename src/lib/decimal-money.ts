export type DecimalMoneyInput = string | number | bigint | null | undefined;

type ParsedDecimal = { coefficient: bigint; scale: number };

function parseDecimal(value: DecimalMoneyInput): ParsedDecimal | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return null;
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, fraction = ""] = unsigned.split(".");
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "") || "0";
  const coefficient = BigInt(digits) * (negative ? -1n : 1n);
  return { coefficient, scale: fraction.length };
}

function alignDecimals(a: ParsedDecimal, b: ParsedDecimal) {
  const scale = Math.max(a.scale, b.scale);
  const factorA = 10n ** BigInt(scale - a.scale);
  const factorB = 10n ** BigInt(scale - b.scale);
  return {
    scale,
    a: a.coefficient * factorA,
    b: b.coefficient * factorB,
  };
}

function decimalString(coefficient: bigint, scale: number): string {
  const negative = coefficient < 0n;
  const digits = (negative ? -coefficient : coefficient).toString().padStart(scale + 1, "0");
  const whole = scale ? digits.slice(0, -scale) : digits;
  const fraction = scale ? digits.slice(-scale).replace(/0+$/, "") : "";
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function compareDecimalStrings(left: DecimalMoneyInput, right: DecimalMoneyInput): number {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  if (!a || !b) return 0;
  const aligned = alignDecimals(a, b);
  return aligned.a === aligned.b ? 0 : aligned.a > aligned.b ? 1 : -1;
}

export function addDecimalStrings(left: DecimalMoneyInput, right: DecimalMoneyInput): string {
  const a = parseDecimal(left) ?? { coefficient: 0n, scale: 0 };
  const b = parseDecimal(right) ?? { coefficient: 0n, scale: 0 };
  const aligned = alignDecimals(a, b);
  return decimalString(aligned.a + aligned.b, aligned.scale);
}

export function subtractDecimalStrings(left: DecimalMoneyInput, right: DecimalMoneyInput): string {
  const a = parseDecimal(left) ?? { coefficient: 0n, scale: 0 };
  const b = parseDecimal(right) ?? { coefficient: 0n, scale: 0 };
  const aligned = alignDecimals(a, b);
  return decimalString(aligned.a - aligned.b, aligned.scale);
}

export function formatDecimalMoney(value: DecimalMoneyInput): string {
  const parsed = parseDecimal(value);
  if (!parsed) return "۰";
  const negative = parsed.coefficient < 0n;
  const digits = (negative ? -parsed.coefficient : parsed.coefficient).toString().padStart(parsed.scale + 1, "0");
  const whole = parsed.scale ? digits.slice(0, -parsed.scale) : digits;
  const fraction = parsed.scale ? digits.slice(-parsed.scale).replace(/0+$/, "") : "";
  const localizedWhole = BigInt(whole).toLocaleString("fa-IR");
  const localizedFraction = fraction.replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
  return `${negative ? "−" : ""}${localizedWhole}${localizedFraction ? `.${localizedFraction}` : ""}`;
}
