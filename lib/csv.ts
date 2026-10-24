import { format } from "date-fns";
import { tz } from "@date-fns/tz";

export type CsvCell = string | number | boolean | null | undefined;

// Phone numbers such as "+65 9123 4567" are safe; anything else starting
// with a formula character could run as a formula when opened in Excel.
const FORMULA_START = /^[=+\-@\t\r]/;
const NUMBER_LIKE = /^[+-]?[\d\s().-]+$/;

function cell(value: CsvCell) {
  if (value == null) return "";
  let s = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  if (FORMULA_START.test(s) && !NUMBER_LIKE.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV with a byte-order mark so Excel reads names with accents correctly. */
export function toCsv(headers: string[], rows: CsvCell[][]) {
  const lines = [headers, ...rows].map((r) => r.map(cell).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function csvResponse(filename: string, csv: string) {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

/** "2026-10-30 12:15" on the club's clock, a format spreadsheets sort. */
export function sheetDateTime(iso: string | null, timeZone: string) {
  return iso ? format(new Date(iso), "yyyy-MM-dd HH:mm", { in: tz(timeZone) }) : "";
}
