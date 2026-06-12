"use client"

import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { useDisclosure } from "@/lib/hooks"

const LogReturnDialog = dynamic(() =>
  import("./log-return-dialog.body").then((m) => m.LogReturnDialog),
)

export function LogReturnButton({
  projectId,
  materialId,
  materialName,
  unitLabel,
}: {
  projectId: string
  materialId: string
  materialName: string
  unitLabel: string
}) {
  const { open, onOpenChange, contentKey, mounted } = useDisclosure()
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => onOpenChange(true)}>
        Log return
      </Button>
      {mounted ? (
        <LogReturnDialog
          key={contentKey}
          open={open}
          onOpenChange={onOpenChange}
          projectId={projectId}
          materialId={materialId}
          materialName={materialName}
          unitLabel={unitLabel}
        />
      ) : null}
    </>
  )
}
