"use client"

import { useState, type MouseEvent } from "react"
import { Badge } from "@/components/ui/badge"
import type { MoneyTransferRow as MoneyTransferRowData } from "@/lib/transfers/schemas"
import { DrilldownSheet } from "@/app/(authed)/components/drilldown-sheet"
import { ReverseTransferButton } from "./reverse-transfer-dialog"

const INR = new Intl.NumberFormat("en-IN")

function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function MoneyTransferRow({
  row,
}: {
  row: {
    transferGroupId: string
    sourceTxId: string
    occurredAt: string
    sourceProjectName: string
    destProjectName: string
    amount: number
    description: string
    status: MoneyTransferRowData["status"]
    reversedAt: string | null
    createdByName: string | null
  }
}) {
  const [open, setOpen] = useState(false)
  function onActionsClick(e: MouseEvent<HTMLTableCellElement>) {
    e.stopPropagation()
  }
  return (
    <>
      <tr
        className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/40"
        onClick={() => setOpen(true)}
      >
        <td className="px-4 py-3 font-mono text-xs">{fmtDate(row.occurredAt)}</td>
        <td className="px-4 py-3">
          <span>{row.sourceProjectName}</span>
          <span className="px-2 text-muted-foreground">→</span>
          <span>{row.destProjectName}</span>
        </td>
        <td className="px-4 py-3 text-right font-mono">
          ₹{INR.format(row.amount)}
        </td>
        <td className="px-4 py-3 text-muted-foreground">{row.description}</td>
        <td className="px-4 py-3">
          {row.status === "reversed" ? (
            <Badge variant="secondary">
              Reversed{row.reversedAt ? ` on ${fmtDate(row.reversedAt)}` : ""}
            </Badge>
          ) : (
            <Badge variant="outline">Active</Badge>
          )}
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          {row.createdByName ?? "—"}
        </td>
        <td className="px-4 py-3 text-right" onClick={onActionsClick}>
          {row.status === "active" ? (
            <ReverseTransferButton
              transferGroupId={row.transferGroupId}
              kind="money"
              summary={`${row.sourceProjectName} → ${row.destProjectName} · ₹${INR.format(row.amount)}`}
            />
          ) : null}
        </td>
      </tr>
      <DrilldownSheet
        entityType="money_transfer"
        entityId={row.sourceTxId}
        role="admin"
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
