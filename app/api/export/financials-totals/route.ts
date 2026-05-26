import { requireAdmin } from "@/lib/auth/session"
import { listCrossProjectTotals } from "@/lib/transactions/repository"
import { toCsvFile } from "@/lib/exports/csv"

export const dynamic = "force-dynamic"

const TOTALS_CSV_HEADERS = [
  "projectId",
  "projectName",
  "revenue",
  "expenses",
  "net",
  "transfersIn",
  "transfersOut",
] as const

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function parseLocalDate(raw: string | null, fallback: Date): Date {
  if (!raw) return fallback
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!m) return fallback
  const [, y, mo, d] = m
  const year = Number(y)
  const monthIndex = Number(mo) - 1
  const day = Number(d)
  const out = new Date(year, monthIndex, day, 0, 0, 0, 0)
  if (
    out.getFullYear() !== year ||
    out.getMonth() !== monthIndex ||
    out.getDate() !== day
  ) {
    return fallback
  }
  return out
}

function defaultFrom(): Date {
  const d = new Date()
  d.setMonth(0, 1)
  d.setHours(0, 0, 0, 0)
  return d
}

function defaultTo(): Date {
  const d = new Date()
  d.setMonth(11, 31)
  d.setHours(0, 0, 0, 0)
  return d
}

export async function GET(req: Request) {
  await requireAdmin()

  const url = new URL(req.url)
  const from = parseLocalDate(url.searchParams.get("from"), defaultFrom())
  const to = parseLocalDate(url.searchParams.get("to"), defaultTo())

  const { overall, perProject } = await listCrossProjectTotals({ from, to })

  const rows = perProject.map((p) => [
    p.projectId,
    p.projectName,
    p.revenue,
    p.expenses,
    p.net,
    p.transfersIn,
    p.transfersOut,
  ])

  rows.push([
    "",
    "OVERALL",
    overall.revenue,
    overall.expenses,
    overall.net,
    overall.transfersIn,
    overall.transfersOut,
  ])

  const csv = toCsvFile([...TOTALS_CSV_HEADERS], rows)
  const filename = `financials-totals-${isoDate(from)}-${isoDate(to)}.csv`

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
