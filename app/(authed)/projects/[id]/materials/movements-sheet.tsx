"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import type { Role } from "@/types"

const MovementsSheetBody = dynamic(() =>
  import("./movements-sheet.body").then((m) => m.MovementsSheetBody),
)

export function MovementsSheetButton({
  projectId,
  materialId,
  materialName,
  unitLabel,
  role,
}: {
  projectId: string
  materialId: string
  materialName: string
  unitLabel: string
  role: Role
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        History
      </Button>
      {open ? (
        <MovementsSheetBody
          projectId={projectId}
          materialId={materialId}
          materialName={materialName}
          unitLabel={unitLabel}
          role={role}
          open={open}
          onOpenChange={setOpen}
        />
      ) : null}
    </>
  )
}
