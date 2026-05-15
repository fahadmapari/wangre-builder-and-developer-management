"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { reverseTransaction } from "./actions"

function isoDateToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export function ReverseConfirmDialog({
  open,
  onOpenChange,
  transactionId,
  description,
  amount,
  kind,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  transactionId: string
  description: string
  amount: number
  kind: "income" | "expense"
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [occurredAt, setOccurredAt] = useState<string>(isoDateToday())
  const [notes, setNotes] = useState<string>("")

  function confirm() {
    setErrorMsg(null)
    startTransition(async () => {
      const result = await reverseTransaction({
        transactionId,
        occurredAt,
        notes,
      })
      if (!result.ok) {
        setErrorMsg(result.error)
        return
      }
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reverse this entry?</AlertDialogTitle>
          <AlertDialogDescription>
            {description} (₹{amount.toLocaleString("en-IN")} {kind})
            <br />
            <br />
            A new reversal row will be inserted on the ledger at the date below.
            Both the original and the reversal stay active &mdash; aggregates
            net to zero. Use this for accounting corrections of older entries.
            For &ldquo;just clicked wrong&rdquo; mistakes, use Void instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reverseDate">Reversal date</Label>
            <Input
              id="reverseDate"
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reverseNotes">Notes (optional)</Label>
            <Textarea
              id="reverseNotes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isPending}
              placeholder="Why is this being reversed?"
            />
          </div>
        </div>
        {errorMsg ? (
          <p className="text-sm text-destructive" role="alert">
            {errorMsg}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              confirm()
            }}
            disabled={isPending}
          >
            {isPending ? "Reversing…" : "Reverse"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
