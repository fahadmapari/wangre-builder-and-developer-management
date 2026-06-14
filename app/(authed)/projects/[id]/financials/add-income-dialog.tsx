"use client"

import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { useDisclosure } from "@/lib/hooks"

const AddIncomeDialog = dynamic(() =>
  import("./add-income-dialog.body").then((m) => m.AddIncomeDialog),
)

export function AddIncomeButton({ projectId }: { projectId: string }) {
  const { open, onOpenChange, contentKey, mounted } = useDisclosure()
  return (
    <>
      <Button onClick={() => onOpenChange(true)}>Add income</Button>
      {mounted ? (
        <AddIncomeDialog
          key={contentKey}
          open={open}
          onOpenChange={onOpenChange}
          projectId={projectId}
        />
      ) : null}
    </>
  )
}
