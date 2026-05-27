"use client"

import { useState, type MouseEvent } from "react"
import { Badge } from "@/components/ui/badge"
import { DrilldownSheet } from "@/app/(authed)/components/drilldown-sheet"
import { MarkSoldButton } from "./mark-sold-dialog"
import { UnmarkButton } from "./unmark-confirm-dialog"
import type { Role } from "@/types"

const INR = new Intl.NumberFormat("en-IN")

export function UnitRow({
  unit,
  projectId,
  role,
}: {
  unit: {
    _id: string
    number: string
    type: "apartment" | "parking"
    floor: number | null
    status: "available" | "sold"
    buyerName: string | null
    soldPriceTotal: number | null
    soldAt: string | null
  }
  projectId: string
  role: Role
}) {
  const [open, setOpen] = useState(false)
  const showActions = role === "admin"
  function onActionsClick(e: MouseEvent<HTMLTableCellElement>) {
    e.stopPropagation()
  }
  return (
    <>
      <tr
        className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/40"
        onClick={() => setOpen(true)}
      >
        <td className="px-4 py-3 font-mono">{unit.number}</td>
        <td className="px-4 py-3 capitalize">{unit.type}</td>
        <td className="px-4 py-3 font-mono">{unit.floor ?? ""}</td>
        <td className="px-4 py-3">
          <Badge variant={unit.status === "sold" ? "default" : "secondary"}>
            {unit.status === "sold" ? "Sold" : "Available"}
          </Badge>
        </td>
        <td className="px-4 py-3">{unit.buyerName ?? ""}</td>
        <td className="px-4 py-3 font-mono">
          {unit.soldPriceTotal != null ? `₹${INR.format(unit.soldPriceTotal)}` : ""}
        </td>
        <td className="px-4 py-3">
          {unit.soldAt ? new Date(unit.soldAt).toLocaleDateString() : ""}
        </td>
        {showActions ? (
          <td className="px-4 py-3 text-right" onClick={onActionsClick}>
            {unit.status === "available" ? (
              <MarkSoldButton
                projectId={projectId}
                unitId={unit._id}
                unitType={unit.type}
                unitNumber={unit.number}
              />
            ) : (
              <UnmarkButton
                unitId={unit._id}
                unitType={unit.type}
                unitNumber={unit.number}
              />
            )}
          </td>
        ) : null}
      </tr>
      <DrilldownSheet
        entityType="unit"
        entityId={unit._id}
        role={role === "admin" ? "admin" : "floor_manager"}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
