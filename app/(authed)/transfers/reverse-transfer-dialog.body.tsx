"use client"

import { useState } from "react"
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  reverseMoneyTransferAction,
  reverseMaterialTransferAction,
} from "./actions"
import { useServerAction } from "@/lib/hooks"
import type { TransferReversalKind } from "./reverse-transfer-dialog"

export function ReverseTransferForm({
  transferGroupId,
  kind,
  summary,
  onDone,
}: {
  transferGroupId: string
  kind: TransferReversalKind
  summary: string
  onDone: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [occurredAt, setOccurredAt] = useState(today)
  const [notes, setNotes] = useState("")
  const action =
    kind === "money" ? reverseMoneyTransferAction : reverseMaterialTransferAction
  const { run, isPending, errorMsg } = useServerAction(action, {
    refresh: false,
    onSuccess: () => onDone(),
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    run({
      transferGroupId,
      occurredAt,
      notes,
    })
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <AlertDialogHeader>
        <AlertDialogTitle>Reverse this transfer?</AlertDialogTitle>
        <AlertDialogDescription>
          {summary}
          <br />
          A paired reversal entry will be inserted. Both legs will be undone
          atomically. This cannot itself be reversed — to redo, create a new
          transfer.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="occurredAt">Reversal date</Label>
          <Input
            id="occurredAt"
            type="date"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            rows={3}
          />
        </div>
        {errorMsg ? <p className="text-sm text-destructive">{errorMsg}</p> : null}
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
        <AlertDialogAction type="submit" disabled={isPending}>
          {isPending ? "Reversing…" : "Reverse"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </form>
  )
}
