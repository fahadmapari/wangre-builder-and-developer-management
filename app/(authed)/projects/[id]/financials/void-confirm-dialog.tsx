"use client"

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
import { useServerAction } from "@/lib/hooks"
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
  const { run, isPending, errorMsg } = useServerAction(voidTransaction, {
    onSuccess: () => onOpenChange(false),
  })

  function confirm() {
    run({ transactionId })
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
