"use client"

import dynamic from "next/dynamic"
import { useDisclosure } from "@/lib/hooks"
import { Button } from "@/components/ui/button"
import { Dialog, DialogTrigger } from "@/components/ui/dialog"

const AddCapitalDialogBody = dynamic(() =>
  import("./add-capital-dialog.body").then((m) => m.AddCapitalDialogBody),
)

export function AddCapitalDialog({ projectId }: { projectId: string }) {
  const { open, onOpenChange, contentKey, mounted } = useDisclosure()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Add funds
        </Button>
      </DialogTrigger>
      {mounted ? (
        <AddCapitalDialogBody
          key={contentKey}
          projectId={projectId}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </Dialog>
  )
}
