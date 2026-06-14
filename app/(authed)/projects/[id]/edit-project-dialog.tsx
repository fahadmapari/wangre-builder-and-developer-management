"use client"

import dynamic from "next/dynamic"
import { useDisclosure } from "@/lib/hooks"
import { Button } from "@/components/ui/button"
import { Dialog, DialogTrigger } from "@/components/ui/dialog"
import type { EditProjectCurrent } from "./edit-project-dialog.body"

const EditProjectDialogBody = dynamic(() =>
  import("./edit-project-dialog.body").then((m) => m.EditProjectDialogBody),
)

type Props = {
  projectId: string
  current: EditProjectCurrent
}

export function EditProjectDialog({ projectId, current }: Props) {
  const { open, onOpenChange, contentKey, mounted } = useDisclosure()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Edit project
        </Button>
      </DialogTrigger>
      {mounted ? (
        <EditProjectDialogBody
          key={contentKey}
          projectId={projectId}
          current={current}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </Dialog>
  )
}
