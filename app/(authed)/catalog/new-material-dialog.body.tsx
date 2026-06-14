"use client"

import { useFormFields, useServerAction } from "@/lib/hooks"
import { Field } from "@/components/form-field"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { MaterialUnit } from "@/lib/materials/schemas"
import { createMaterial } from "./actions"

const UNIT_OPTIONS: { value: MaterialUnit; label: string }[] = [
  { value: "bag", label: "bag" },
  { value: "kg", label: "kg" },
  { value: "ton", label: "ton" },
  { value: "m3", label: "m³" },
  { value: "m2", label: "m²" },
  { value: "m", label: "m" },
  { value: "liter", label: "liter" },
  { value: "piece", label: "piece" },
  { value: "sheet", label: "sheet" },
  { value: "box", label: "box" },
  { value: "roll", label: "roll" },
  { value: "other", label: "Other (custom)" },
]

type FormState = {
  name: string
  unit: MaterialUnit
  unitOther: string
  unitPrice: string
  notes: string
}

export function NewMaterialDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
}) {
  const [form, set] = useFormFields<FormState>({
    name: "",
    unit: "bag",
    unitOther: "",
    unitPrice: "",
    notes: "",
  })

  const { run, isPending, errorMsg, errorField } = useServerAction(createMaterial, {
    onSuccess: () => onOpenChange(false),
  })

  function handleSubmit() {
    run({
      name: form.name,
      unit: form.unit,
      unitOther: form.unit === "other" ? form.unitOther : undefined,
      unitPrice: form.unitPrice === "" ? null : Number(form.unitPrice),
      notes: form.notes,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New material</DialogTitle>
          <DialogDescription>
            Add an entry to the global catalog. Visible to every project.
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
            label="Name"
            htmlFor="name"
            error={errorField === "name" ? errorMsg : null}
          >
            <Input
              id="name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              disabled={isPending}
              autoFocus
            />
          </Field>
          <Field
            label="Unit"
            htmlFor="unit"
            error={errorField === "unit" ? errorMsg : null}
          >
            <Select
              value={form.unit}
              onValueChange={(v) => set("unit", v as MaterialUnit)}
              disabled={isPending}
            >
              <SelectTrigger id="unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {form.unit === "other" ? (
            <Field
              label="Custom unit label"
              htmlFor="unitOther"
              error={errorField === "unitOther" ? errorMsg : null}
            >
              <Input
                id="unitOther"
                value={form.unitOther}
                onChange={(e) => set("unitOther", e.target.value)}
                disabled={isPending}
                placeholder="e.g. drum, crate, panel"
              />
            </Field>
          ) : null}
          <Field
            label="Unit price (₹)"
            htmlFor="unitPrice"
            error={errorField === "unitPrice" ? errorMsg : null}
          >
            <Input
              id="unitPrice"
              type="number"
              min={0}
              step="0.01"
              value={form.unitPrice}
              onChange={(e) => set("unitPrice", e.target.value)}
              disabled={isPending}
              placeholder="Optional"
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
              {isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
