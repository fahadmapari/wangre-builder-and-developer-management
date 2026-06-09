import type { FinancialLedgerRow } from "@/lib/transactions/schemas"
import type { FinancialTotals } from "@/lib/transactions/repository"
import { Button } from "@/components/ui/button"
import { Pagination } from "@/components/pagination"
import { FinancialsSummary } from "./financials-summary"
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
  rows: FinancialLedgerRow[]
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
  const entriesLine =
    total === 0
      ? "No entries in this window."
      : total <= pageSize
        ? `${total} entr${total === 1 ? "y" : "ies"} in this window.`
        : `Showing ${rows.length} of ${total} entries.`

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <FinancialsSummary>
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
            label="Available Funds"
            value={`${totals.availableFunds < 0 ? "−" : ""}₹${INR.format(Math.abs(totals.availableFunds))}`}
            subtitle={
              totals.capital > 0
                ? `incl. ₹${INR.format(totals.capital)} capital`
                : null
            }
            tone={totals.availableFunds < 0 ? "loss" : undefined}
          />
        </div>
      </FinancialsSummary>
      <div className="flex shrink-0 items-center justify-between">
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
      <div className="shrink-0">
        <LedgerFilters defaultFrom={defaultFrom} defaultTo={defaultTo} />
      </div>
      {search ? (
        <p className="shrink-0 text-sm text-muted-foreground">
          Showing matches for{" "}
          <span className="font-medium text-foreground">&quot;{search}&quot;</span>
          {" — "}use the search input above to refine or clear.
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {rows.length === 0 ? (
          <p className="rounded border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            {search
              ? "No entries match your search."
              : "No entries in this window."}
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
          total={total}
          pageSize={pageSize}
          searchParams={currentSearchParams}
        />
      </div>
    </div>
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
