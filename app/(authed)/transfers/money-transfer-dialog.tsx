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
import { createMoneyTransferAction } from "./actions"

export type ProjectPickerEntry = { id: string; name: string }

export function MoneyTransferButton({
  projects,
  lockedSource,
}: {
  projects: ProjectPickerEntry[]
  lockedSource?: string
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
          {lockedSource ? "Transfer money to another project" : "New money transfer"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <MoneyTransferForm
          projects={projects}
          lockedSource={lockedSource}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function MoneyTransferForm({
  projects,
  lockedSource,
  onDone,
}: {
  projects: ProjectPickerEntry[]
  lockedSource?: string
  onDone: () => void
}) {
  const [sourceProjectId, setSourceProjectId] = useState(lockedSource ?? "")
  const [destProjectId, setDestProjectId] = useState("")
  const [amount, setAmount] = useState("")
  const today = new Date().toISOString().slice(0, 10)
  const [occurredAt, setOccurredAt] = useState(today)
  const [description, setDescription] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const destOptions = projects.filter((p) => p.id !== sourceProjectId)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setErrorField(null)
    startTransition(async () => {
      const result = await createMoneyTransferAction({
        sourceProjectId,
        destProjectId,
        amount,
        occurredAt,
        description,
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
        <DialogTitle>Transfer money to another project</DialogTitle>
        <DialogDescription>
          Records paired ledger entries in both projects, atomically.
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
          <Label htmlFor="amount">Amount (₹)</Label>
          <Input
            id="amount"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
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
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Working capital top-up"
            required
            maxLength={500}
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
