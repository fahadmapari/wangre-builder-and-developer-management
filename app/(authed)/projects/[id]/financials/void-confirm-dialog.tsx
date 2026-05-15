"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
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
import { voidTransaction } from "./actions"

export function VoidConfirmDialog({
  open,
  onOpenChange,
  transactionId,
  description,
  amount,
  kind,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  transactionId: string
  description: string
  amount: number
  kind: "income" | "expense"
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function confirm() {
    setErrorMsg(null)
    startTransition(async () => {
      const result = await voidTransaction({ transactionId })
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
          <AlertDialogTitle>Void this entry?</AlertDialogTitle>
          <AlertDialogDescription>
            {description} (₹{amount.toLocaleString("en-IN")} {kind})
            <br />
            <br />
            The entry stays in the audit trail but is hidden from active totals
            and the default ledger view. Use this for &ldquo;just clicked
            wrong&rdquo; mistakes. For accounting corrections of older entries,
            use Reverse instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
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
            {isPending ? "Voiding…" : "Void"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
