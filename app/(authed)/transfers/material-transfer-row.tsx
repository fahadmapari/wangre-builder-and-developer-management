"use client"

import { useState, type MouseEvent } from "react"
import { Badge } from "@/components/ui/badge"
import type {
  MaterialTransferRow as MaterialTransferRowData,
} from "@/lib/transfers/schemas"
import type { MaterialUnit } from "@/lib/materials/schemas"
import { DrilldownSheet } from "@/app/(authed)/components/drilldown-sheet"
import { ReverseTransferButton } from "./reverse-transfer-dialog"

function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function formatUnit(unit: MaterialUnit, unitOther?: string): string {
  if (unit === "other") return unitOther || "—"
  if (unit === "m2") return "m²"
  if (unit === "m3") return "m³"
  return unit
}

export function MaterialTransferRow({
  row,
}: {
  row: {
    transferGroupId: string
    sourceMovId: string
    occurredAt: string
    sourceProjectName: string
    destProjectName: string
    materialName: string
    materialUnit: MaterialUnit
    materialUnitOther?: string
    qty: number
    status: MaterialTransferRowData["status"]
    reversedAt: string | null
    createdByName: string | null
  }
}) {
  const [open, setOpen] = useState(false)
  const unitLabel = formatUnit(row.materialUnit, row.materialUnitOther)
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
        <td className="px-4 py-3">{row.materialName}</td>
        <td className="px-4 py-3 text-right font-mono">
          {row.qty} {unitLabel}
        </td>
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
              kind="material"
              summary={`${row.sourceProjectName} → ${row.destProjectName} · ${row.qty} ${unitLabel} ${row.materialName}`}
            />
          ) : null}
        </td>
      </tr>
      <DrilldownSheet
        entityType="material_transfer"
        entityId={row.sourceMovId}
        role="admin"
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
