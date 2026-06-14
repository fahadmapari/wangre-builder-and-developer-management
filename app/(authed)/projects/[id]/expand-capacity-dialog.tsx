"use client"

import dynamic from "next/dynamic"
import { useDisclosure } from "@/lib/hooks"
import { Button } from "@/components/ui/button"
import { Dialog, DialogTrigger } from "@/components/ui/dialog"
import type { ExpandCapacityCurrent } from "./expand-capacity-dialog.body"

const ExpandCapacityDialogBody = dynamic(() =>
  import("./expand-capacity-dialog.body").then((m) => m.ExpandCapacityDialogBody),
)

type Props = {
  projectId: string
  current: ExpandCapacityCurrent
}

export function ExpandCapacityDialog({ projectId, current }: Props) {
  const { open, onOpenChange, contentKey, mounted } = useDisclosure()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Add capacity
        </Button>
      </DialogTrigger>
      {mounted ? (
        <ExpandCapacityDialogBody
          key={contentKey}
          projectId={projectId}
          current={current}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </Dialog>
  )
}
