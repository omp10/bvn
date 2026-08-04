/**
 * CSV writer. Excel opens CSV, and a spreadsheet is what a school office
 * actually does with a report — so no xlsx dependency, and no PDF renderer.
 */
export type Column<T> = [header: string, get: (row: T) => unknown];

const escape = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  // Quote anything that would otherwise break the row, and double inner quotes.
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function toCsv<T>(rows: T[], columns: Column<T>[]): string {
  const lines = [columns.map(([header]) => escape(header)).join(",")];
  for (const row of rows) lines.push(columns.map(([, get]) => escape(get(row))).join(","));
  // CRLF and a BOM so Excel on Windows opens it in the right encoding.
  return "﻿" + lines.join("\r\n");
}

export const csvHeaders = (filename: string) => ({
  "Content-Type": "text/csv; charset=utf-8",
  "Content-Disposition": `attachment; filename="${filename}"`,
});
