"use client"

import { useState, useTransition } from "react"
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
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ProjectPickerEntry } from "./money-transfer-dialog"
import { createMaterialTransferAction } from "./actions"

export type MaterialPickerEntry = {
  id: string
  name: string
  unitLabel: string
}

export function MaterialTransferButton({
  projects,
  materials,
  lockedSource,
  lockedMaterial,
  triggerLabel,
}: {
  projects: ProjectPickerEntry[]
  materials: MaterialPickerEntry[]
  lockedSource?: string
  lockedMaterial?: string
  triggerLabel?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      key={open ? "open" : "closed"}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {triggerLabel ?? "Transfer to another project"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <MaterialTransferForm
          projects={projects}
          materials={materials}
          lockedSource={lockedSource}
          lockedMaterial={lockedMaterial}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function MaterialTransferForm({
  projects,
  materials,
  lockedSource,
  lockedMaterial,
  onDone,
}: {
  projects: ProjectPickerEntry[]
  materials: MaterialPickerEntry[]
  lockedSource?: string
  lockedMaterial?: string
  onDone: () => void
}) {
  const [sourceProjectId, setSourceProjectId] = useState(lockedSource ?? "")
  const [destProjectId, setDestProjectId] = useState("")
  const [materialId, setMaterialId] = useState(lockedMaterial ?? "")
  const [qty, setQty] = useState("")
  const today = new Date().toISOString().slice(0, 10)
  const [occurredAt, setOccurredAt] = useState(today)
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const destOptions = projects.filter((p) => p.id !== sourceProjectId)
  const pickedMaterial = materials.find((m) => m.id === materialId)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setErrorField(null)
    startTransition(async () => {
      const result = await createMaterialTransferAction({
        sourceProjectId,
        destProjectId,
        materialId,
        qty,
        occurredAt,
        notes,
      })
      if (result.ok) {
        onDone()
      } else {
        setError(result.error)
        setErrorField(result.field ?? null)
      }
    })
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Transfer material to another project</DialogTitle>
        <DialogDescription>
          Moves stock between projects atomically. Source stock decremented;
          destination stock incremented.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sourceProjectId">From</Label>
          <Select
            value={sourceProjectId}
            onValueChange={(v) => {
              setSourceProjectId(v)
              if (v === destProjectId) setDestProjectId("")
            }}
            disabled={!!lockedSource}
          >
            <SelectTrigger id="sourceProjectId">
              <SelectValue placeholder="Select source project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="destProjectId">To</Label>
          <Select value={destProjectId} onValueChange={setDestProjectId}>
            <SelectTrigger id="destProjectId">
              <SelectValue placeholder="Select destination project" />
            </SelectTrigger>
            <SelectContent>
              {destOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="materialId">Material</Label>
          <Select
            value={materialId}
            onValueChange={setMaterialId}
            disabled={!!lockedMaterial}
          >
            <SelectTrigger id="materialId">
              <SelectValue placeholder="Select material" />
            </SelectTrigger>
            <SelectContent>
              {materials.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name} ({m.unitLabel})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="qty">
            Quantity {pickedMaterial ? `(${pickedMaterial.unitLabel})` : ""}
          </Label>
          <Input
            id="qty"
            type="number"
            inputMode="decimal"
            min={0.0001}
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="occurredAt">Date</Label>
          <Input
            id="occurredAt"
            type="date"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            rows={3}
          />
        </div>
        {error ? (
          <p className="text-sm text-destructive">
            {errorField ? `${errorField}: ` : ""}
            {error}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Transferring…" : "Transfer"}
        </Button>
      </DialogFooter>
    </form>
  )
}
