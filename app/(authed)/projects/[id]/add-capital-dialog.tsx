"use client"

import { useState } from "react"
import { useServerAction } from "@/lib/hooks"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { addCapital } from "../actions"

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function AddCapitalDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState("")
  const [occurredAt, setOccurredAt] = useState(todayIso)
  const [notes, setNotes] = useState("")

  const { run, isPending, errorMsg, setErrorMsg } = useServerAction(addCapital, {
    refresh: false,
    onSuccess: () => {
      reset()
      setOpen(false)
    },
  })

  function reset() {
    setAmount("")
    setOccurredAt(todayIso())
    setNotes("")
    setErrorMsg(null)
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    setOpen(next)
  }

  function handleSubmit() {
    run({
      projectId,
      amount: Number(amount),
      occurredAt: (() => { const [y, m, d] = occurredAt.split("-").map(Number); return new Date(y, m - 1, d) })(),
      notes,
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Add funds
        </Button>
      </DialogTrigger>
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
              onClick={() => handleOpenChange(false)}
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
    </Dialog>
  )
}
