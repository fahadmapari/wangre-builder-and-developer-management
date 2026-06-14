"use client"

import { useState } from "react"
import { useServerAction } from "@/lib/hooks"
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { addCapital } from "../actions"

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function AddCapitalDialogBody({
  projectId,
  onClose,
}: {
  projectId: string
  onClose: () => void
}) {
  const [amount, setAmount] = useState("")
  const [occurredAt, setOccurredAt] = useState(todayIso)
  const [notes, setNotes] = useState("")

  const { run, isPending, errorMsg } = useServerAction(addCapital, {
    refresh: false,
    onSuccess: () => onClose(),
  })

  function handleSubmit() {
    run({
      projectId,
      amount: Number(amount),
      occurredAt: (() => { const [y, m, d] = occurredAt.split("-").map(Number); return new Date(y, m - 1, d) })(),
      notes,
    })
  }

  return (
    <DialogContent className="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>Add funds</DialogTitle>
        <DialogDescription>
          Record a capital injection for this project.
        </DialogDescription>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleSubmit()
        }}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cap-amount">Amount (₹)</Label>
          <Input
            id="cap-amount"
            type="number"
            min={1}
            step={1}
            placeholder="e.g. 5000000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isPending}
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cap-date">Date</Label>
          <Input
            id="cap-date"
            type="date"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cap-notes">
            Notes{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="cap-notes"
            rows={2}
            placeholder="e.g. Second tranche"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isPending}
          />
        </div>
        {errorMsg && (
          <p className="text-sm text-destructive" role="alert">
            {errorMsg}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || !amount}>
            {isPending ? "Adding…" : "Add funds"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
