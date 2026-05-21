/**
 * RFC 4180 CSV encoding helpers for buffered exports.
 *
 * Excel-friendly defaults:
 *  - CRLF line endings
 *  - UTF-8 BOM prepended in toCsvFile so non-ASCII text in description/notes
 *    renders correctly when the file is opened in Excel.
 *
 * `null` and `undefined` become empty cells. Booleans become "true"/"false".
 * Numbers go through String() so integers render without thousand separators.
 */

export type CsvValue = string | number | boolean | null | undefined

const NEEDS_QUOTING = /[",\r\n]/

function encodeCell(value: CsvValue): string {
  if (value === null || value === undefined) return ""
  const s = typeof value === "string" ? value : String(value)
  if (!NEEDS_QUOTING.test(s)) return s
  return `"${s.replace(/"/g, '""')}"`
}

export function toCsvRow(values: CsvValue[]): string {
  return values.map(encodeCell).join(",")
}

export function toCsvFile(
  headers: string[],
  rows: CsvValue[][]
): string {
  const lines = [toCsvRow(headers), ...rows.map(toCsvRow)]
  // U+FEFF (UTF-8 BOM) — must be the very first character of the response body
  // so Excel detects UTF-8 instead of the system codepage.
  return "﻿" + lines.join("\r\n")
}
