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
import { markUnitSold } from "./actions"
import { useServerAction, useFormFields } from "@/lib/hooks"
import { Field } from "@/components/form-field"

type FormState = {
  salePrice: number
  buyerName: string
  saleDate: string
  description: string
  notes: string
}

function isoDateToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function descriptionFor(
  unitType: "apartment" | "parking",
  unitNumber: string,
  buyerName: string
): string {
  const typeLabel = unitType === "apartment" ? "Apartment" : "Parking"
  const buyer = buyerName.trim() || "buyer"
  return `Sale of ${typeLabel} ${unitNumber} to ${buyer}`
}

export function MarkSoldDialog({
  open,
  onOpenChange,
  projectId,
  unitId,
  unitType,
  unitNumber,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  projectId: string
  unitId: string
  unitType: "apartment" | "parking"
  unitNumber: string
}) {
  const [descriptionTouched, setDescriptionTouched] = useState(false)

  const [form, set] = useFormFields<FormState>({
    salePrice: 0,
    buyerName: "",
    saleDate: isoDateToday(),
    description: descriptionFor(unitType, unitNumber, ""),
    notes: "",
  })

  const { run, isPending, errorMsg, errorField } = useServerAction(
    markUnitSold,
    {
      onSuccess: () => onOpenChange(false),
    },
  )

  function onBuyerBlur() {
    if (descriptionTouched) return
    set("description", descriptionFor(unitType, unitNumber, form.buyerName))
  }

  function handleSubmit() {
    run({
      projectId,
      unitId,
      salePrice: form.salePrice,
      buyerName: form.buyerName,
      saleDate: form.saleDate,
      description: form.description,
      notes: form.notes,
    })
  }

  const unitLabel =
    unitType === "apartment" ? `Apartment ${unitNumber}` : `Parking ${unitNumber}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mark {unitLabel} sold</DialogTitle>
          <DialogDescription>
            Records the sale and inserts a linked income transaction.
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
            label="Sale price (₹)"
            htmlFor="salePrice"
            error={errorField === "salePrice" ? errorMsg : null}
          >
            <Input
              id="salePrice"
              type="number"
              min={1}
              step={1}
              value={form.salePrice || ""}
              onChange={(e) => set("salePrice", Number(e.target.value))}
              disabled={isPending}
              autoFocus
            />
          </Field>
          <Field
            label="Buyer name"
            htmlFor="buyerName"
            error={errorField === "buyerName" ? errorMsg : null}
          >
            <Input
              id="buyerName"
              value={form.buyerName}
              onChange={(e) => set("buyerName", e.target.value)}
              onBlur={onBuyerBlur}
              disabled={isPending}
            />
          </Field>
          <Field
            label="Sale date"
            htmlFor="saleDate"
            error={errorField === "saleDate" ? errorMsg : null}
          >
            <Input
              id="saleDate"
              type="date"
              value={form.saleDate}
              onChange={(e) => set("saleDate", e.target.value)}
              disabled={isPending}
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
              onChange={(e) => {
                setDescriptionTouched(true)
                set("description", e.target.value)
              }}
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
              {isPending ? "Recording…" : "Mark sold"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
