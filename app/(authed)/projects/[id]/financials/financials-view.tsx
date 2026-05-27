import type { Transaction } from "@/lib/transactions/schemas"
import type { FinancialTotals } from "@/lib/transactions/repository"
import { Button } from "@/components/ui/button"
import { LedgerFilters } from "./ledger-filters"
import { LedgerTable } from "./ledger-table"
import { AddIncomeButton } from "./add-income-dialog"
import { AddExpenseButton } from "./add-expense-dialog"
import { MoneyTransferButton, type ProjectPickerEntry } from "@/app/(authed)/transfers/money-transfer-dialog"

const INR = new Intl.NumberFormat("en-IN")

export function FinancialsView({
  projectId,
  rows,
  totals,
  defaultFrom,
  defaultTo,
  projects,
  otherProjectByRowId,
  linkedMaterials,
  search,
  ledgerExportHref,
  page,
  pageSize,
  total,
  currentSearchParams,
}: {
  projectId: string
  rows: Transaction[]
  totals: FinancialTotals
  defaultFrom: string
  defaultTo: string
  projects: ProjectPickerEntry[]
  otherProjectByRowId: Map<string, string>
  linkedMaterials?: Map<
    string,
    { name: string; unit: string; qty: number; projectName: string }
  >
  search?: string
  ledgerExportHref: string
  page: number
  pageSize: number
  total: number
  currentSearchParams: Record<string, string | string[] | undefined>
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const entriesLine =
    total === 0
      ? "No entries in this window."
      : total <= pageSize
        ? `${total} entr${total === 1 ? "y" : "ies"} in this window.`
        : `Showing ${rows.length} of ${total} entries.`

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile
          label="Revenue"
          value={`₹${INR.format(totals.revenue)}`}
          subtitle={
            totals.transfersIn > 0
              ? `incl. ₹${INR.format(totals.transfersIn)} transfers in`
              : null
          }
        />
        <Tile
          label="Expenses"
          value={`₹${INR.format(totals.expenses)}`}
          subtitle={
            totals.transfersOut > 0
              ? `incl. ₹${INR.format(totals.transfersOut)} transfers out`
              : null
          }
        />
        <Tile
          label="Net"
          value={`${totals.net < 0 ? "−" : ""}₹${INR.format(Math.abs(totals.net))}`}
          tone={totals.net < 0 ? "loss" : "gain"}
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{entriesLine}</p>
        <div className="flex gap-2">
          <AddIncomeButton projectId={projectId} />
          <AddExpenseButton projectId={projectId} />
          <MoneyTransferButton projects={projects} lockedSource={projectId} />
          <Button asChild variant="outline" size="sm">
            <a href={ledgerExportHref} download>
              Export CSV
            </a>
          </Button>
        </div>
      </div>
      <LedgerFilters defaultFrom={defaultFrom} defaultTo={defaultTo} />
      {search ? (
        <p className="text-sm text-muted-foreground">
          Showing matches for{" "}
          <span className="font-medium text-foreground">&quot;{search}&quot;</span>
          {" — "}use the search input above to refine or clear.
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="rounded border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          {search
            ? "No transactions match your search."
            : "No transactions in this window."}
        </p>
      ) : (
        <LedgerTable
          rows={rows}
          otherProjectByRowId={otherProjectByRowId}
          linkedMaterials={linkedMaterials}
        />
      )}
      <Pagination
        current={page}
        totalPages={totalPages}
        searchParams={currentSearchParams}
      />
    </div>
  )
}

function Pagination({
  current,
  totalPages,
  searchParams,
}: {
  current: number
  totalPages: number
  searchParams: Record<string, string | string[] | undefined>
}) {
  if (totalPages <= 1) return null
  const base = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (k === "page") continue
    if (typeof v === "string") base.set(k, v)
  }
  const hrefFor = (p: number) => {
    const q = new URLSearchParams(base)
    q.set("page", String(p))
    return `?${q.toString()}`
  }
  return (
    <nav className="flex items-center gap-3 text-sm">
      <PaginationLink href={hrefFor(current - 1)} disabled={current <= 1} label="← Prev" />
      <span className="text-muted-foreground">
        Page {current} of {totalPages}
      </span>
      <PaginationLink
        href={hrefFor(current + 1)}
        disabled={current >= totalPages}
        label="Next →"
      />
    </nav>
  )
}

function PaginationLink({ href, disabled, label }: { href: string; disabled: boolean; label: string }) {
  if (disabled) {
    return <span className="text-muted-foreground">{label}</span>
  }
  return (
    <a className="text-primary hover:underline" href={href}>
      {label}
    </a>
  )
}

function Tile({
  label,
  value,
  subtitle,
  tone,
}: {
  label: string
  value: string
  subtitle?: string | null
  tone?: "gain" | "loss"
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={
          "font-mono text-xl " +
          (tone === "loss" ? "text-destructive" : "")
        }
      >
        {value}
      </span>
      {subtitle ? (
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      ) : null}
    </div>
  )
}
