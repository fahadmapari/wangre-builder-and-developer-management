"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field } from "@/components/form-field"
import { useServerAction, useFormFields } from "@/lib/hooks"
import { createAdhocExpense } from "./actions"

type FormState = {
  amount: string
  description: string
  occurredAt: string
  notes: string
}

function isoDateToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export function AddExpenseDialog({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  projectId: string
}) {
  const [form, set] = useFormFields<FormState>({
    amount: "",
    description: "",
    occurredAt: isoDateToday(),
    notes: "",
  })

  const { run, isPending, errorMsg, errorField } = useServerAction(
    createAdhocExpense,
    { onSuccess: () => onOpenChange(false) },
  )

  function handleSubmit() {
    run({
      projectId,
      amount: form.amount,
      description: form.description,
      occurredAt: form.occurredAt,
      notes: form.notes,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add expense</DialogTitle>
          <DialogDescription>
            Records an ad-hoc expense entry on the ledger (kind=expense, category=adhoc).
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSubmit()
          }}
          className="flex flex-col gap-4"
        >
          <Field
            label="Amount (₹)"
            htmlFor="amount"
            error={errorField === "amount" ? errorMsg : null}
          >
            <Input
              id="amount"
              type="number"
              min={1}
              step={1}
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
              disabled={isPending}
              autoFocus
            />
          </Field>
          <Field
            label="Description"
            htmlFor="description"
            error={errorField === "description" ? errorMsg : null}
          >
            <Input
              id="description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              disabled={isPending}
              placeholder="e.g., Government registration fee"
            />
          </Field>
          <Field
            label="Date"
            htmlFor="occurredAt"
            error={errorField === "occurredAt" ? errorMsg : null}
          >
            <Input
              id="occurredAt"
              type="date"
              value={form.occurredAt}
              onChange={(e) => set("occurredAt", e.target.value)}
              disabled={isPending}
            />
          </Field>
          <Field label="Notes" htmlFor="notes">
            <Textarea
              id="notes"
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              disabled={isPending}
            />
          </Field>

          {errorMsg && !errorField ? (
            <p className="text-sm text-destructive" role="alert">
              {errorMsg}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Add expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
