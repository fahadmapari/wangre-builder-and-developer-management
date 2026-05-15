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

export function LogReturnButton({
  projectId,
  materialId,
  materialName,
  unitLabel,
}: {
  projectId: string
  materialId: string
  materialName: string
  unitLabel: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Log return
      </Button>
      <LogReturnDialog
        key={open ? `open-${materialId}` : "closed"}
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        materialId={materialId}
        materialName={materialName}
        unitLabel={unitLabel}
      />
    </>
  )
}

function LogReturnDialog({
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
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)

  const [form, setForm] = useState<FormState>({
    qty: "",
    purpose: "",
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
      const result = await logReturn({
        projectId,
        materialId,
        qty: form.qty,
        purpose: form.purpose,
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
