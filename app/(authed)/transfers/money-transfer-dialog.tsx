"use client"

import dynamic from "next/dynamic"
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useDisclosure } from "@/lib/hooks"

export type ProjectPickerEntry = { id: string; name: string }

const MoneyTransferForm = dynamic(() =>
  import("./money-transfer-dialog.body").then((m) => m.MoneyTransferForm),
)

export function MoneyTransferButton({
  projects,
  lockedSource,
}: {
  projects: ProjectPickerEntry[]
  lockedSource?: string
}) {
  const { open, setOpen, onOpenChange, contentKey, mounted } = useDisclosure()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {lockedSource ? "Transfer money to another project" : "New money transfer"}
        </Button>
      </DialogTrigger>
      {mounted ? (
        <DialogContent>
          <MoneyTransferForm
            key={contentKey}
            projects={projects}
            lockedSource={lockedSource}
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
