const PERSIAN_WEEKDAYS = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];

function dateParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function dateOnlyToLocalDate(value: string): Date | undefined {
  const parts = dateParts(value);
  if (!parts || parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) return undefined;
  return new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0);
}

export function localDateToDateOnly(value: Date | undefined): string {
  if (!value || Number.isNaN(value.getTime())) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function tehranDateKey(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return Date.UTC(year, month - 1, day);
}

export function formatPersianDate(value: string, longMonth = true) {
  const date = dateOnlyToLocalDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: longMonth ? "long" : "2-digit",
    day: "numeric",
    timeZone: "Asia/Tehran",
  }).format(date);
}

export function formatPersianDateWithWeekday(value: string) {
  const date = dateOnlyToLocalDate(value);
  if (!date) return "";
  const weekday = PERSIAN_WEEKDAYS[date.getDay()];
  return weekday + "، " + formatPersianDate(value, true);
}

export function daysUntilDateOnly(value: string, now = new Date()) {
  const date = dateOnlyToLocalDate(value);
  if (!date) return null;
  return Math.round((tehranDateKey(date) - tehranDateKey(now)) / 86_400_000);
}
