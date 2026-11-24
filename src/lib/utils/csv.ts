/**
 * CSV for spreadsheets: UTF-8 with BOM so Excel reads Urdu, and cells that a spreadsheet
 * would run as a formula are prefixed with an apostrophe. Plain numbers are left alone.
 */
export function toCsv(rows: readonly (readonly unknown[])[]): string {
  const cell = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return `﻿${rows.map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`;
}
