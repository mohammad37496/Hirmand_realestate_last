/**
 * Encode a value as a CSV cell and neutralize spreadsheet formula prefixes.
 * Keep this shared by browser and server exports so user-controlled fields
 * cannot become formulas when an administrator opens a CSV in a spreadsheet.
 */
export function csvCell(value: unknown): string {
  let text = String(value ?? "").replace(/\r\n?|\n/g, " ");
  if (/^[=+\-@]/.test(text.trimStart())) text = "'" + text;
  return /[",]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
