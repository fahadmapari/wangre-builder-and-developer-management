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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { MaterialUnit } from "@/lib/materials/schemas"
import { updateMaterial } from "./actions"

// Plain-object shape passed across the Server→Client boundary. Mongo ObjectIds
// are not serializable by RSC, so the server converts `_id` to a string before
// rendering.
export type EditableMaterial = {
  _id: string
  name: string
  unit: MaterialUnit
  unitOther?: string
  unitPrice: number | null
  notes?: string
}

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

export function EditMaterialButton({ material }: { material: EditableMaterial }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <EditMaterialDialog
        key={open ? `open-${material._id}` : "closed"}
        open={open}
        onOpenChange={setOpen}
        material={material}
      />
    </>
  )
}

function EditMaterialDialog({
  open,
  onOpenChange,
  material,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  material: EditableMaterial
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)

  const [form, setForm] = useState<FormState>({
    name: material.name,
    unit: material.unit,
    unitOther: material.unitOther ?? "",
    unitPrice: material.unitPrice == null ? "" : String(material.unitPrice),
    notes: material.notes ?? "",
  })

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit() {
    setErrorMsg(null)
    setErrorField(null)
    // Only include unit/unitOther in the payload when they actually changed.
    // The repository's unit-change guard treats any non-undefined `unit` or
    // `unitOther` as an attempted change and would otherwise block every
    // edit of a material that already has movements.
    const submittedOther = form.unit === "other" ? form.unitOther : ""
    const currentOther = material.unit === "other" ? (material.unitOther ?? "") : ""
    const unitChanged =
      form.unit !== material.unit || submittedOther !== currentOther
    startTransition(async () => {
      const result = await updateMaterial({
        materialId: material._id,
        name: form.name,
        ...(unitChanged
          ? { unit: form.unit, unitOther: submittedOther }
          : {}),
        unitPrice: form.unitPrice === "" ? null : Number(form.unitPrice),
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
          <DialogTitle>Edit {material.name}</DialogTitle>
          <DialogDescription>
            Unit cannot be changed after movements exist for this material.
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
              {isPending ? "Saving…" : "Save"}
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
