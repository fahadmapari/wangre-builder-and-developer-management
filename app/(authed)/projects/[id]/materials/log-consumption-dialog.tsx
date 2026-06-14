"use client"

import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { useDisclosure } from "@/lib/hooks"

const LogConsumptionDialog = dynamic(() =>
  import("./log-consumption-dialog.body").then((m) => m.LogConsumptionDialog),
)

export function LogConsumptionButton({
  projectId,
  materialId,
  materialName,
  unitLabel,
  stockOnHand,
}: {
  projectId: string
  materialId: string
  materialName: string
  unitLabel: string
  stockOnHand: number
}) {
  const { open, onOpenChange, contentKey, mounted } = useDisclosure()
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => onOpenChange(true)}>
        Log use
      </Button>
      {mounted ? (
        <LogConsumptionDialog
          key={contentKey}
          open={open}
          onOpenChange={onOpenChange}
          projectId={projectId}
          materialId={materialId}
          materialName={materialName}
          unitLabel={unitLabel}
          stockOnHand={stockOnHand}
        />
      ) : null}
    </>
  )
}
