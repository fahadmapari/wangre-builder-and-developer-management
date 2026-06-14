"use client"

import dynamic from "next/dynamic"
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type { ProjectPickerEntry } from "./money-transfer-dialog"
import { useDisclosure } from "@/lib/hooks"

export type MaterialPickerEntry = {
  id: string
  name: string
  unitLabel: string
}

const MaterialTransferForm = dynamic(() =>
  import("./material-transfer-dialog.body").then((m) => m.MaterialTransferForm),
)

export function MaterialTransferButton({
  projects,
  materials,
  lockedSource,
  lockedMaterial,
  triggerLabel,
}: {
  projects: ProjectPickerEntry[]
  materials: MaterialPickerEntry[]
  lockedSource?: string
  lockedMaterial?: string
  triggerLabel?: string
}) {
  const { open, setOpen, onOpenChange, contentKey, mounted } = useDisclosure()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {triggerLabel ?? "Transfer to another project"}
        </Button>
      </DialogTrigger>
      {mounted ? (
        <DialogContent>
          <MaterialTransferForm
            key={contentKey}
            projects={projects}
            materials={materials}
            lockedSource={lockedSource}
            lockedMaterial={lockedMaterial}
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
