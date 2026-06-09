// Pure date + month-bucket helpers for the dashboard. No DB, no React.
// Month keys are "YYYY-MM" strings to match the repository's $dateToString
// output (which buckets in Asia/Kolkata).

export function startOfYear(d: Date = new Date()): Date {
  const x = new Date(d)
  x.setMonth(0, 1)
  x.setHours(0, 0, 0, 0)
  return x
}

export function endOfYear(d: Date = new Date()): Date {
  const x = new Date(d)
  x.setMonth(11, 31)
  x.setHours(23, 59, 59, 999)
  return x
}

export function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function parseISODate(raw: string | undefined, fallback: Date): Date {
  if (!raw) return fallback
  const d = new Date(raw + "T00:00:00")
  return Number.isNaN(d.getTime()) ? fallback : d
}

/** First day of the month 11 months ago (gives a 12-month inclusive window). */
export function last12MonthsStart(d: Date = new Date()): Date {
  const x = new Date(d)
  x.setMonth(x.getMonth() - 11, 1)
  x.setHours(0, 0, 0, 0)
  return x
}

/** Inclusive list of "YYYY-MM" month keys from `from`'s month to `to`'s month. */
export function monthRange(from: Date, to: Date): string[] {
  const out: string[] = []
  const cur = new Date(from.getFullYear(), from.getMonth(), 1)
  const end = new Date(to.getFullYear(), to.getMonth(), 1)
  while (cur <= end) {
    out.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`,
    )
    cur.setMonth(cur.getMonth() + 1)
  }
  return out
}

/** "2026-03" -> "Mar 26" for compact chart axis labels. */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleString("en-IN", {
    month: "short",
    year: "2-digit",
  })
}
