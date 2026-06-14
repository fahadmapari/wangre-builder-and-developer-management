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
import { useFormFields, useServerAction } from "@/lib/hooks"
import { logReturn } from "./actions"

type FormState = {
  qty: string
  purpose: string
  occurredAt: string
  notes: string
}

function isoDateToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export function LogReturnDialog({
  open,
  onOpenChange,
  projectId,
  materialId,
  materialName,
  unitLabel,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  projectId: string
  materialId: string
  materialName: string
  unitLabel: string
}) {
  const [form, set] = useFormFields<FormState>({
    qty: "",
    purpose: "",
    occurredAt: isoDateToday(),
    notes: "",
  })

  const { run, isPending, errorMsg, errorField } = useServerAction(logReturn, {
    onSuccess: () => onOpenChange(false),
  })

  function handleSubmit() {
    run({
      projectId,
      materialId,
      qty: form.qty,
      purpose: form.purpose,
      occurredAt: form.occurredAt,
      notes: form.notes,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log return — {materialName}</DialogTitle>
          <DialogDescription>
            Restores stock. No ledger entry — returns are not cash events.
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
            label={`Quantity returned (${unitLabel})`}
            htmlFor="qty"
            error={errorField === "qty" ? errorMsg : null}
          >
            <Input
              id="qty"
              type="number"
              min={0}
              step="any"
              value={form.qty}
              onChange={(e) => set("qty", e.target.value)}
              disabled={isPending}
              autoFocus
            />
          </Field>
          <Field
            label="Reason (optional)"
            htmlFor="purpose"
            error={errorField === "purpose" ? errorMsg : null}
          >
            <Input
              id="purpose"
              value={form.purpose}
              onChange={(e) => set("purpose", e.target.value)}
              disabled={isPending}
              placeholder="e.g. Excess from Tower A pour"
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
              {isPending ? "Logging…" : "Log return"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
