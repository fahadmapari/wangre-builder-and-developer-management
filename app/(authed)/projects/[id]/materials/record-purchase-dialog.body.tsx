"use client"

import { useState } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Field } from "@/components/form-field"
import { useFormFields, useServerAction } from "@/lib/hooks"
import { recordPurchase } from "./actions"
import type { CatalogPickerEntry } from "./record-purchase-dialog"

function unitLabelFor(entry: Pick<CatalogPickerEntry, "unit" | "unitOther">): string {
  if (entry.unit === "other") return entry.unitOther || "—"
  if (entry.unit === "m2") return "m²"
  if (entry.unit === "m3") return "m³"
  return entry.unit
}

type FormState = {
  qty: string
  unitPriceAtMovement: string
  occurredAt: string
  notes: string
}

function isoDateToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export function RecordPurchaseDialog({
  open,
  onOpenChange,
  projectId,
  materialId,
  materialName,
  unitLabel,
  defaultUnitPrice,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  projectId: string
  materialId: string
  materialName: string
  unitLabel: string
  defaultUnitPrice: number | null
}) {
  const [form, set] = useFormFields<FormState>({
    qty: "",
    unitPriceAtMovement:
      defaultUnitPrice != null ? String(defaultUnitPrice) : "",
    occurredAt: isoDateToday(),
    notes: "",
  })

  const { run, isPending, errorMsg, errorField } = useServerAction(
    recordPurchase,
    {
      onSuccess: () => onOpenChange(false),
    },
  )

  const qtyNum = Number(form.qty) || 0
  const priceNum = Number(form.unitPriceAtMovement) || 0
  const computedAmount = Math.round(qtyNum * priceNum)

  function handleSubmit() {
    run({
      projectId,
      materialId,
      qty: form.qty,
      unitPriceAtMovement: form.unitPriceAtMovement,
      occurredAt: form.occurredAt,
      notes: form.notes,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record purchase — {materialName}</DialogTitle>
          <DialogDescription>
            Writes an expense to the ledger and adds stock to this project.
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
            label={`Quantity (${unitLabel})`}
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
            label="Unit price (₹)"
            htmlFor="unitPriceAtMovement"
            error={errorField === "unitPriceAtMovement" ? errorMsg : null}
          >
            <Input
              id="unitPriceAtMovement"
              type="number"
              min={0}
              step="0.01"
              value={form.unitPriceAtMovement}
              onChange={(e) => set("unitPriceAtMovement", e.target.value)}
              disabled={isPending}
            />
          </Field>
          <p className="text-sm text-muted-foreground">
            Amount: <span className="font-mono">₹{computedAmount.toLocaleString("en-IN")}</span>
          </p>
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
              placeholder="Optional — supplier, invoice ref, etc."
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
              {isPending ? "Recording…" : "Record purchase"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function TopLevelPurchaseDialog({
  open,
  onOpenChange,
  projectId,
  catalog,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  projectId: string
  catalog: CatalogPickerEntry[]
}) {
  const [materialId, setMaterialId] = useState<string>("")
  const [form, set] = useFormFields<FormState>({
    qty: "",
    unitPriceAtMovement: "",
    occurredAt: isoDateToday(),
    notes: "",
  })

  const { run, isPending, errorMsg, errorField, setErrorMsg, setErrorField } =
    useServerAction(recordPurchase, {
      onSuccess: () => onOpenChange(false),
    })

  const selected = catalog.find((m) => m.materialId === materialId) ?? null
  const unitLabel = selected ? unitLabelFor(selected) : ""

  function onMaterialChange(next: string) {
    setMaterialId(next)
    const m = catalog.find((c) => c.materialId === next)
    if (m && m.unitPrice != null) {
      set("unitPriceAtMovement", String(m.unitPrice))
    } else {
      set("unitPriceAtMovement", "")
    }
  }

  const qtyNum = Number(form.qty) || 0
  const priceNum = Number(form.unitPriceAtMovement) || 0
  const computedAmount = Math.round(qtyNum * priceNum)

  function handleSubmit() {
    if (!materialId) {
      setErrorMsg("Pick a material")
      setErrorField("materialId")
      return
    }
    run({
      projectId,
      materialId,
      qty: form.qty,
      unitPriceAtMovement: form.unitPriceAtMovement,
      occurredAt: form.occurredAt,
      notes: form.notes,
    })
  }

  if (catalog.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record purchase</DialogTitle>
            <DialogDescription>
              The materials catalog is empty. Add a material first from the
              Catalog page or via the &ldquo;Add material&rdquo; button.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record purchase</DialogTitle>
          <DialogDescription>
            Writes an expense to the ledger and adds stock to this project.
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
            label="Material"
            htmlFor="materialId"
            error={errorField === "materialId" ? errorMsg : null}
          >
            <Select
              value={materialId}
              onValueChange={onMaterialChange}
              disabled={isPending}
            >
              <SelectTrigger id="materialId">
                <SelectValue placeholder="Pick a material" />
              </SelectTrigger>
              <SelectContent>
                {catalog.map((m) => (
                  <SelectItem key={m.materialId} value={m.materialId}>
                    {m.name} ({unitLabelFor(m)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label={selected ? `Quantity (${unitLabel})` : "Quantity"}
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
              disabled={isPending || !selected}
            />
          </Field>
          <Field
            label="Unit price (₹)"
            htmlFor="unitPriceAtMovement"
            error={errorField === "unitPriceAtMovement" ? errorMsg : null}
          >
            <Input
              id="unitPriceAtMovement"
              type="number"
              min={0}
              step="0.01"
              value={form.unitPriceAtMovement}
              onChange={(e) => set("unitPriceAtMovement", e.target.value)}
              disabled={isPending || !selected}
            />
          </Field>
          <p className="text-sm text-muted-foreground">
            Amount: <span className="font-mono">₹{computedAmount.toLocaleString("en-IN")}</span>
          </p>
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
              placeholder="Optional — supplier, invoice ref, etc."
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
              {isPending ? "Recording…" : "Record purchase"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
