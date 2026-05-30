"use client"

import { useMemo, useState, useTransition } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { expandProjectCapacity } from "../../projects/actions"

type Props = {
  projectId: string
  current: {
    totalUnits: number
    totalParkings: number
    startingUnitNumber?: number
    unitsPerFloor?: number
    parkingPrefix?: string
  }
}

function previewApartments(
  current: number,
  add: number,
  start?: number,
  perFloor?: number
): string {
  if (add <= 0 || start === undefined || perFloor === undefined) return ""
  const baseFloor = Math.floor(start / 100)
  const basePosition = start % 100
  const first = (() => {
    const seq = current
    const floorOffset = Math.floor(seq / perFloor)
    const positionInFloor = seq % perFloor
    const floor = baseFloor + floorOffset
    return floor * 100 + basePosition + positionInFloor
  })()
  const last = (() => {
    const seq = current + add - 1
    const floorOffset = Math.floor(seq / perFloor)
    const positionInFloor = seq % perFloor
    const floor = baseFloor + floorOffset
    return floor * 100 + basePosition + positionInFloor
  })()
  return `${first}–${last}`
}

function previewParkings(
  current: number,
  add: number,
  prefix?: string
): string {
  if (add <= 0 || prefix === undefined) return ""
  const first = String(current + 1).padStart(3, "0")
  const last = String(current + add).padStart(3, "0")
  return `${prefix}${first}–${prefix}${last}`
}

export function ExpandCapacityDialog({ projectId, current }: Props) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [addUnits, setAddUnits] = useState("0")
  const [addParkings, setAddParkings] = useState("0")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const numUnits = Math.max(0, parseInt(addUnits, 10) || 0)
  const numParkings = Math.max(0, parseInt(addParkings, 10) || 0)
  const totalAdding = numUnits + numParkings

  const unitsPreview = useMemo(
    () =>
      previewApartments(
        current.totalUnits,
        numUnits,
        current.startingUnitNumber,
        current.unitsPerFloor
      ),
    [
      current.totalUnits,
      numUnits,
      current.startingUnitNumber,
      current.unitsPerFloor,
    ]
  )
  const parkingsPreview = useMemo(
    () => previewParkings(current.totalParkings, numParkings, current.parkingPrefix),
    [current.totalParkings, numParkings, current.parkingPrefix]
  )

  const handleClose = () => {
    setOpen(false)
    setConfirming(false)
    setAddUnits("0")
    setAddParkings("0")
    setError(null)
  }

  const handleSubmit = () => {
    setError(null)
    startTransition(async () => {
      const res = await expandProjectCapacity({
        projectId,
        additionalUnits: numUnits,
        additionalParkings: numParkings,
      })
      if (res.ok) {
        handleClose()
      } else {
        setError(res.error)
        setConfirming(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Add capacity
        </Button>
      </DialogTrigger>
      <DialogContent
        key={open ? `open-${projectId}` : "closed"}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Add capacity</DialogTitle>
          <DialogDescription>
            Add apartments or parkings to this project. Numbering continues from
            existing units. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {!confirming ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="addUnits">Additional apartments</Label>
              <Input
                id="addUnits"
                type="number"
                min={0}
                max={2000}
                value={addUnits}
                onChange={(e) => setAddUnits(e.target.value)}
              />
              {unitsPreview && (
                <p className="text-sm text-muted-foreground">
                  Will create apartments {unitsPreview}.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="addParkings">Additional parkings</Label>
              <Input
                id="addParkings"
                type="number"
                min={0}
                max={2000}
                value={addParkings}
                onChange={(e) => setAddParkings(e.target.value)}
              />
              {parkingsPreview && (
                <p className="text-sm text-muted-foreground">
                  Will create parkings {parkingsPreview}.
                </p>
              )}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <DialogFooter>
              <Button variant="ghost" onClick={handleClose} disabled={pending}>
                Cancel
              </Button>
              <Button
                onClick={() => setConfirming(true)}
                disabled={pending || totalAdding === 0}
              >
                Continue
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-medium">Confirm capacity expansion</p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                {numUnits > 0 && (
                  <li>
                    {numUnits} apartment{numUnits === 1 ? "" : "s"}
                    {unitsPreview && ` (${unitsPreview})`}
                  </li>
                )}
                {numParkings > 0 && (
                  <li>
                    {numParkings} parking{numParkings === 1 ? "" : "s"}
                    {parkingsPreview && ` (${parkingsPreview})`}
                  </li>
                )}
              </ul>
              <p className="mt-2">This cannot be undone.</p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setConfirming(false)}
                disabled={pending}
              >
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={pending}>
                {pending ? "Creating…" : "Confirm"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
