"use client"

import { useState, type MouseEvent } from "react"
import type { Transaction } from "@/lib/transactions/schemas"
import { Badge } from "@/components/ui/badge"
import { DrilldownSheet } from "@/app/(authed)/components/drilldown-sheet"
import { RowActionsMenu } from "./row-actions-menu"

const INR = new Intl.NumberFormat("en-IN")

function fmtAmount(amount: number, isReversal: boolean): string {
  const sign = isReversal ? "−" : ""
  return `${sign}₹${INR.format(amount)}`
}

function categoryLabel(c: Transaction["category"]): string {
  switch (c) {
    case "sale":
      return "Sale"
    case "purchase":
      return "Purchase"
    case "adhoc":
      return "Ad-hoc"
    case "transfer_in":
      return "Transfer in"
    case "transfer_out":
      return "Transfer out"
  }
}

export type LedgerRowProps = {
  row: {
    _id: string
    occurredAt: string
    kind: "income" | "expense"
    category: Transaction["category"]
    amount: number
    description: string
    buyerName: string | null
    notes: string | null
    voided: boolean
    isReversal: boolean
    transferGroupId: string | null
    unitLabel: string
    peerProjectName: string | null
  }
  linkedMaterial?: {
    name: string
    unit: string
    qty: number
    projectName: string
  }
}

export function LedgerRow({ row, linkedMaterial }: LedgerRowProps) {
  const [drilldownOpen, setDrilldownOpen] = useState(false)
  const rowClass = row.voided
    ? "border-b border-border last:border-0 opacity-60 line-through cursor-pointer hover:bg-muted/40"
    : "border-b border-border last:border-0 cursor-pointer hover:bg-muted/40"

  function onActionsClick(e: MouseEvent<HTMLTableCellElement>) {
    e.stopPropagation()
  }

  const occurredAt = new Date(row.occurredAt)

  return (
    <>
      <tr className={rowClass} onClick={() => setDrilldownOpen(true)}>
        <td className="px-4 py-3 font-mono">{occurredAt.toLocaleDateString()}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <Badge variant={row.kind === "income" ? "default" : "secondary"}>
              {row.kind === "income" ? "Income" : "Expense"}
            </Badge>
            {row.isReversal ? (
              <Badge variant="outline" className="text-xs">
                Reversal
              </Badge>
            ) : null}
          </div>
        </td>
        <td className="px-4 py-3">
          <Badge variant="secondary">{categoryLabel(row.category)}</Badge>
        </td>
        <td className="px-4 py-3 text-right font-mono">
          {fmtAmount(row.amount, row.isReversal)}
        </td>
        <td className="px-4 py-3">
          {row.description}
          {row.transferGroupId ? (
            <Badge variant="outline" className="ml-2 text-xs">
              ↔ {row.peerProjectName ?? "Other project"}
            </Badge>
          ) : null}
        </td>
        <td className="px-4 py-3 text-muted-foreground">{row.buyerName ?? ""}</td>
        <td className="px-4 py-3 text-muted-foreground">{row.unitLabel}</td>
        <td className="px-4 py-3 text-right" onClick={onActionsClick}>
          <RowActionsMenu
            transactionId={row._id}
            description={row.description}
            amount={row.amount}
            kind={row.kind}
            category={row.category}
            voided={row.voided}
            isReversal={row.isReversal}
            linkedMaterial={linkedMaterial}
          />
        </td>
      </tr>
      <DrilldownSheet
        entityType="transaction"
        entityId={row._id}
        role="admin"
        open={drilldownOpen}
        onOpenChange={setDrilldownOpen}
      />
    </>
  )
}
