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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Field } from "@/components/form-field"
import { useFormFields, useServerAction } from "@/lib/hooks"
import type { MaterialUnit } from "@/lib/materials/schemas"
import { createMaterial } from "@/app/(authed)/catalog/actions"

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
  notes: string
}

export function AddMaterialDialog({
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
    notes: "",
  })

  const { run, isPending, errorMsg, errorField } = useServerAction(
    createMaterial,
    {
      onSuccess: () => onOpenChange(false),
    },
  )

  function handleSubmit() {
    run({
      name: form.name,
      unit: form.unit,
      unitOther: form.unit === "other" ? form.unitOther : undefined,
      notes: form.notes,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add material</DialogTitle>
          <DialogDescription>
            Add a new material to the global catalog. An admin can set its
            unit price later.
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
              />
            </Field>
          ) : null}
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
              {isPending ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
