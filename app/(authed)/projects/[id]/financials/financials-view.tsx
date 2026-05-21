import type { Transaction } from "@/lib/transactions/schemas"
import type { FinancialTotals } from "@/lib/transactions/repository"
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
}) {
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
        <p className="text-sm text-muted-foreground">
          {rows.length} entr{rows.length === 1 ? "y" : "ies"} in this window.
        </p>
        <div className="flex gap-2">
          <AddIncomeButton projectId={projectId} />
          <AddExpenseButton projectId={projectId} />
          <MoneyTransferButton projects={projects} lockedSource={projectId} />
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
