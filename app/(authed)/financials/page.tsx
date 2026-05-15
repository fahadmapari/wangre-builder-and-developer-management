import { requireAdmin } from "@/lib/auth/session"
import { listCrossProjectTotals } from "@/lib/transactions/repository"
import { GlobalFilters } from "./global-filters"
import { PerProjectTable } from "./per-project-table"

const INR = new Intl.NumberFormat("en-IN")

function startOfYear(): Date {
  const d = new Date()
  d.setMonth(0, 1)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfYear(): Date {
  const d = new Date()
  d.setMonth(11, 31)
  d.setHours(23, 59, 59, 999)
  return d
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function parseDate(raw: string | undefined, fallback: Date): Date {
  if (!raw) return fallback
  const d = new Date(raw + "T00:00:00")
  if (Number.isNaN(d.getTime())) return fallback
  return d
}

export default async function GlobalFinancialsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requireAdmin()
  const sp = await searchParams
  const defaultFromDate = startOfYear()
  const defaultToDate = endOfYear()
  const from = parseDate(sp.from, defaultFromDate)
  const to = parseDate(sp.to, defaultToDate)

  const { overall, perProject } = await listCrossProjectTotals({ from, to })

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Financials</h1>
        <p className="text-sm text-muted-foreground">
          Cross-project revenue, expenses, and net across the filter window.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="Revenue" value={`₹${INR.format(overall.revenue)}`} />
        <Tile label="Expenses" value={`₹${INR.format(overall.expenses)}`} />
        <Tile
          label="Net"
          value={`${overall.net < 0 ? "−" : ""}₹${INR.format(Math.abs(overall.net))}`}
          tone={overall.net < 0 ? "loss" : "gain"}
        />
      </div>
      <GlobalFilters defaultFrom={isoDate(defaultFromDate)} defaultTo={isoDate(defaultToDate)} />
      <PerProjectTable rows={perProject} />
    </div>
  )
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "gain" | "loss"
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={
          "font-mono text-xl " + (tone === "loss" ? "text-destructive" : "")
        }
      >
        {value}
      </span>
    </div>
  )
}
