"use client"

import dynamic from "next/dynamic"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { useDisclosure } from "@/lib/hooks"

export type TransferReversalKind = "money" | "material"

const ReverseTransferForm = dynamic(() =>
  import("./reverse-transfer-dialog.body").then((m) => m.ReverseTransferForm),
)

export function ReverseTransferButton({
  transferGroupId,
  kind,
  summary,
}: {
  transferGroupId: string
  kind: TransferReversalKind
  summary: string
}) {
  const { open, setOpen, onOpenChange, contentKey, mounted } = useDisclosure()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Reverse
        </Button>
      </AlertDialogTrigger>
      {mounted ? (
        <AlertDialogContent>
          <ReverseTransferForm
            key={contentKey}
            transferGroupId={transferGroupId}
            kind={kind}
            summary={summary}
            onDone={() => setOpen(false)}
          />
        </AlertDialogContent>
      ) : null}
    </AlertDialog>
  )
}
