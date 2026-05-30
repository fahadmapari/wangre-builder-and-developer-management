"use client"

import { useState, useTransition } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { editUnit } from "./actions"

type Props = {
  unitId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  current: {
    number: string
    floor: number
    areaSqft: number
    salePrice: number
    notes?: string
    status: "available" | "sold"
  }
}

export function EditUnitDialog({
  unitId,
  open,
  onOpenChange,
  current,
}: Props) {
  const [error, setError] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const isSold = current.status === "sold"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        key={open ? `open-${unitId}` : "closed"}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Edit unit</DialogTitle>
          <DialogDescription>
            {isSold
              ? "This unit is sold. Sale-related fields are locked."
              : "Update unit fields."}
          </DialogDescription>
        </DialogHeader>
        <form
          action={(formData) => {
            setError(null)
            setErrorField(null)
            startTransition(async () => {
              const raw: Record<string, unknown> = {
                unitId,
                number: String(formData.get("number") ?? ""),
                floor: formData.get("floor"),
                areaSqft: formData.get("areaSqft"),
                notes: String(formData.get("notes") ?? ""),
              }
              if (!isSold) {
                raw.salePrice = formData.get("salePrice")
              }
              const res = await editUnit(raw)
              if (res.ok) {
                onOpenChange(false)
              } else {
                setError(res.error)
                setErrorField(res.field ?? null)
              }
            })
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="number">Number</Label>
            <Input
              id="number"
              name="number"
              defaultValue={current.number}
              maxLength={20}
              required
            />
            {errorField === "number" && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="floor">Floor</Label>
            <Input
              id="floor"
              name="floor"
              type="number"
              min={0}
              max={99}
              defaultValue={current.floor}
              required
            />
            {errorField === "floor" && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="areaSqft">Area (sqft)</Label>
            <Input
              id="areaSqft"
              name="areaSqft"
              type="number"
              min={1}
              max={100000}
              defaultValue={current.areaSqft}
              required
            />
            {errorField === "areaSqft" && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="salePrice">List price (₹)</Label>
            <Input
              id="salePrice"
              name="salePrice"
              type="number"
              min={0}
              max={1_000_000_000}
              defaultValue={current.salePrice}
              disabled={isSold}
            />
            {isSold && (
              <p className="text-sm text-muted-foreground">
                Sold units retain their list price.
              </p>
            )}
            {errorField === "salePrice" && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={current.notes ?? ""}
              maxLength={2000}
              rows={3}
            />
          </div>
          {error && !errorField && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
