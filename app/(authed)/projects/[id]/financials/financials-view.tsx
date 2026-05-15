import type { Transaction } from "@/lib/transactions/schemas"
import type { FinancialTotals } from "@/lib/transactions/repository"
import { LedgerFilters } from "./ledger-filters"
import { LedgerTable } from "./ledger-table"
import { AddIncomeButton } from "./add-income-dialog"
import { AddExpenseButton } from "./add-expense-dialog"

const INR = new Intl.NumberFormat("en-IN")

export function FinancialsView({
  projectId,
  rows,
  totals,
  defaultFrom,
  defaultTo,
}: {
  projectId: string
  rows: Transaction[]
  totals: FinancialTotals
  defaultFrom: string
  defaultTo: string
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="Revenue" value={`₹${INR.format(totals.revenue)}`} />
        <Tile label="Expenses" value={`₹${INR.format(totals.expenses)}`} />
        <Tile
          label="Net"
          value={`${totals.net < 0 ? "−" : ""}₹${INR.format(Math.abs(totals.net))}`}
          tone={totals.net < 0 ? "loss" : "gain"}
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {rows.length} entr{rows.length === 1 ? "y" : "ies"} in this window.
        </p>
        <div className="flex gap-2">
          <AddIncomeButton projectId={projectId} />
          <AddExpenseButton projectId={projectId} />
        </div>
      </div>
      <LedgerFilters defaultFrom={defaultFrom} defaultTo={defaultTo} />
      <LedgerTable rows={rows} />
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
          "font-mono text-xl " +
          (tone === "loss"
            ? "text-destructive"
            : tone === "gain"
              ? ""
              : "")
        }
      >
        {value}
      </span>
    </div>
  )
}
