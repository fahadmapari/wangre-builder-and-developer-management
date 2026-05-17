"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { reverseTransaction } from "./actions"

function isoDateToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export type ReverseConfirmDialogProps = {
  open: boolean
  onOpenChange: (next: boolean) => void
  transactionId: string
  description: string
  amount: number
  kind: "income" | "expense"
  category: "sale" | "purchase" | "adhoc" | "transfer_in" | "transfer_out"
  // Only meaningful when category === "purchase". Used in the checkbox helper
  // text so the admin sees exactly what will be decremented.
  linkedMaterial?: { name: string; unit: string; qty: number; projectName: string }
}

export function ReverseConfirmDialog({
  open,
  onOpenChange,
  transactionId,
  description,
  amount,
  kind,
  category,
  linkedMaterial,
}: ReverseConfirmDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [occurredAt, setOccurredAt] = useState<string>(isoDateToday())
  const [notes, setNotes] = useState<string>("")
  const [andUnstock, setAndUnstock] = useState<boolean>(false)

  const showStockCheckbox = category === "purchase" && !!linkedMaterial

  function confirm() {
    setErrorMsg(null)
    startTransition(async () => {
      const result = await reverseTransaction({
        transactionId,
        occurredAt,
        notes,
        andUnstock: showStockCheckbox ? andUnstock : false,
      })
      if (!result.ok) {
        setErrorMsg(result.error)
        return
      }
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reverse this entry?</AlertDialogTitle>
          <AlertDialogDescription>
            {description} (₹{amount.toLocaleString("en-IN")} {kind})
            <br />
            <br />
            A new reversal row will be inserted on the ledger at the date below.
            Both the original and the reversal stay active &mdash; aggregates
            net to zero. Use this for accounting corrections of older entries.
            For &ldquo;just clicked wrong&rdquo; mistakes, use Void instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reverseDate">Reversal date</Label>
            <Input
              id="reverseDate"
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reverseNotes">Notes (optional)</Label>
            <Textarea
              id="reverseNotes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isPending}
              placeholder="Why is this being reversed?"
            />
          </div>
          {showStockCheckbox && linkedMaterial ? (
            <div className="flex items-start gap-2 rounded border border-border bg-muted/50 p-3">
              <input
                id="andUnstock"
                type="checkbox"
                className="mt-1"
                checked={andUnstock}
                onChange={(e) => setAndUnstock(e.target.checked)}
                disabled={isPending}
              />
              <div className="flex flex-col gap-1 text-sm">
                <Label htmlFor="andUnstock" className="font-medium">
                  Also undo the stock side (decrements {linkedMaterial.projectName}
                  &rsquo;s {linkedMaterial.name} by {linkedMaterial.qty}{" "}
                  {linkedMaterial.unit})
                </Label>
                <p className="text-xs text-muted-foreground">
                  Use when the materials were returned or never received. Leave
                  unchecked if the supplier issued a credit while you kept the
                  goods.
                </p>
              </div>
            </div>
          ) : null}
        </div>
        {errorMsg ? (
          <p className="text-sm text-destructive" role="alert">
            {errorMsg}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              confirm()
            }}
            disabled={isPending}
          >
            {isPending ? "Reversing…" : "Reverse"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
