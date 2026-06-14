"use client"

import { useState, type MouseEvent } from "react"
import dynamic from "next/dynamic"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MarkSoldButton } from "./mark-sold-dialog"
import { UnmarkButton } from "./unmark-confirm-dialog"
import type { Role } from "@/types"

const DrilldownSheet = dynamic(() =>
  import("@/app/(authed)/components/drilldown-sheet").then((m) => m.DrilldownSheet),
)
const EditUnitDialog = dynamic(() =>
  import("./edit-unit-dialog").then((m) => m.EditUnitDialog),
)

const INR = new Intl.NumberFormat("en-IN")

export function UnitRow({
  unit,
  projectId,
  role,
  isJointVentureProject,
}: {
  unit: {
    _id: string
    number: string
    type: "apartment" | "parking"
    floor: number | null
    areaSqft: number
    salePrice: number
    notes: string | null
    status: "available" | "sold"
    buyerName: string | null
    soldPriceTotal: number | null
    soldAt: string | null
    isJointVentureUnit: boolean
  }
  projectId: string
  role: Role
  isJointVentureProject: boolean
}) {
  const [open, setOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
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
        <td className="px-4 py-3 font-mono">
          <span className="flex items-center gap-1.5">
            {unit.number}
            {unit.isJointVentureUnit && (
              <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900 dark:text-indigo-300 text-[10px] px-1.5 py-0">
                JV
              </Badge>
            )}
          </span>
        </td>
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
            <div className="flex items-center justify-end gap-2">
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
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  setEditOpen(true)
                }}
              >
                Edit
              </Button>
            </div>
            {editOpen ? (
              <EditUnitDialog
                unitId={unit._id}
                open={editOpen}
                onOpenChange={setEditOpen}
                isJointVentureProject={isJointVentureProject}
                current={{
                  number: unit.number,
                  floor: unit.floor ?? 0,
                  areaSqft: unit.areaSqft,
                  salePrice: unit.salePrice,
                  notes: unit.notes ?? undefined,
                  status: unit.status,
                  type: unit.type,
                  isJointVentureUnit: unit.isJointVentureUnit,
                }}
              />
            ) : null}
          </td>
        ) : null}
      </tr>
      {open ? (
        <DrilldownSheet
          entityType="unit"
          entityId={unit._id}
          role={role === "admin" ? "admin" : "floor_manager"}
          open={open}
          onOpenChange={setOpen}
        />
      ) : null}
    </>
  )
}
