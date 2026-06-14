"use client"

import { useState } from "react"
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { useServerAction } from "@/lib/hooks"
import type { ProjectPickerEntry } from "./money-transfer-dialog"

export function MoneyTransferForm({
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
  const { run, isPending, errorMsg, errorField } = useServerAction(
    createMoneyTransferAction,
    { refresh: false, onSuccess: () => onDone() },
  )

  const destOptions = projects.filter((p) => p.id !== sourceProjectId)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    run({
      sourceProjectId,
      destProjectId,
      amount,
      occurredAt,
      description,
      notes,
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
        {errorMsg ? (
          <p className="text-sm text-destructive">
            {errorField ? `${errorField}: ` : ""}
            {errorMsg}
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
