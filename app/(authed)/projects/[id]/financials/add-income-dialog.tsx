"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createAdhocIncome } from "./actions"

type FormState = {
  amount: string
  description: string
  buyerName: string
  occurredAt: string
  notes: string
}

function isoDateToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export function AddIncomeButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Add income</Button>
      <AddIncomeDialog
        key={open ? "open" : "closed"}
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
      />
    </>
  )
}

function AddIncomeDialog({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  projectId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>({
    amount: "",
    description: "",
    buyerName: "",
    occurredAt: isoDateToday(),
    notes: "",
  })

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit() {
    setErrorMsg(null)
    setErrorField(null)
    startTransition(async () => {
      const result = await createAdhocIncome({
        projectId,
        amount: form.amount,
        description: form.description,
        buyerName: form.buyerName,
        occurredAt: form.occurredAt,
        notes: form.notes,
      })
      if (!result.ok) {
        setErrorMsg(result.error)
        setErrorField(result.field ?? null)
        return
      }
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add income</DialogTitle>
          <DialogDescription>
            Records an ad-hoc income entry on the ledger (kind=income, category=adhoc).
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
              placeholder="e.g., Refund credit from supplier"
            />
          </Field>
          <Field
            label="Buyer / payer (optional)"
            htmlFor="buyerName"
            error={errorField === "buyerName" ? errorMsg : null}
          >
            <Input
              id="buyerName"
              value={form.buyerName}
              onChange={(e) => set("buyerName", e.target.value)}
              disabled={isPending}
              placeholder="Optional — useful for refund/credit tracking"
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
              {isPending ? "Saving…" : "Add income"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string
  htmlFor: string
  error?: string | null
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
