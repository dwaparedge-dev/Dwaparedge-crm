export type CsvCell = string | number | null | undefined;

/**
 * RFC 4180 quoting. Text cells that start with a spreadsheet formula character get a leading
 * apostrophe so opening the file in Excel/Sheets cannot execute attacker-controlled formulas
 * (client names and notes are user input). Numeric/money cells are written as-is.
 */
export function toCsv(headers: string[], rows: CsvCell[][], textColumns: boolean[]): string {
  const esc = (v: CsvCell, isText: boolean) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (isText && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map((h) => esc(h, false)).join(",")];
  for (const r of rows) lines.push(r.map((v, i) => esc(v, textColumns[i] ?? true)).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n"; // BOM so Excel reads UTF-8 correctly
}
