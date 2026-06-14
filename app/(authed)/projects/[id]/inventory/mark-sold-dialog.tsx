"use client"

import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { useDisclosure } from "@/lib/hooks"

const MarkSoldDialog = dynamic(() =>
  import("./mark-sold-dialog.body").then((m) => m.MarkSoldDialog),
)

export function MarkSoldButton({
  projectId,
  unitId,
  unitType,
  unitNumber,
}: {
  projectId: string
  unitId: string
  unitType: "apartment" | "parking"
  unitNumber: string
}) {
  const { open, setOpen, mounted } = useDisclosure()
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Mark sold
      </Button>
      {/* key forces React to remount the dialog on each open/close cycle so
          internal useState resets cleanly (Phase 2 dialog-remount fix). */}
      {mounted ? (
        <MarkSoldDialog
          key={open ? `open-${unitId}` : "closed"}
          open={open}
          onOpenChange={setOpen}
          projectId={projectId}
          unitId={unitId}
          unitType={unitType}
          unitNumber={unitNumber}
        />
      ) : null}
    </>
  )
}
