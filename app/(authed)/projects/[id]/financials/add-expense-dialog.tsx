"use client"

import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { useDisclosure } from "@/lib/hooks"

const AddExpenseDialog = dynamic(() =>
  import("./add-expense-dialog.body").then((m) => m.AddExpenseDialog),
)

export function AddExpenseButton({ projectId }: { projectId: string }) {
  const { open, onOpenChange, contentKey, mounted } = useDisclosure()
  return (
    <>
      <Button variant="outline" onClick={() => onOpenChange(true)}>
        Add expense
      </Button>
      {mounted ? (
        <AddExpenseDialog
          key={contentKey}
          open={open}
          onOpenChange={onOpenChange}
          projectId={projectId}
        />
      ) : null}
    </>
  )
}
