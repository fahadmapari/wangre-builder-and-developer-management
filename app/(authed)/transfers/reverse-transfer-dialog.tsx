"use client"

import { useState, useTransition } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  reverseMoneyTransferAction,
  reverseMaterialTransferAction,
} from "./actions"

export type TransferReversalKind = "money" | "material"

export function ReverseTransferButton({
  transferGroupId,
  kind,
  summary,
}: {
  transferGroupId: string
  kind: TransferReversalKind
  summary: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <AlertDialog
      open={open}
      onOpenChange={setOpen}
      key={open ? "open" : "closed"}
    >
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Reverse
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <ReverseTransferForm
          transferGroupId={transferGroupId}
          kind={kind}
          summary={summary}
          onDone={() => setOpen(false)}
        />
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ReverseTransferForm({
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
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const action =
        kind === "money"
          ? reverseMoneyTransferAction
          : reverseMaterialTransferAction
      const result = await action({
        transferGroupId,
        occurredAt,
        notes,
      })
      if (result.ok) {
        onDone()
      } else {
        setError(result.error)
      }
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
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
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
