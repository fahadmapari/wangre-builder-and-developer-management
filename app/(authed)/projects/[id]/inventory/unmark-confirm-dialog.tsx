"use client"

import { useState } from "react"
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
import { useServerAction } from "@/lib/hooks"
import { unmarkUnitSold } from "./actions"

export function UnmarkButton({
  unitId,
  unitType,
  unitNumber,
}: {
  unitId: string
  unitType: "apartment" | "parking"
  unitNumber: string
}) {
  const [open, setOpen] = useState(false)
  const { run, isPending, errorMsg, setErrorMsg } = useServerAction(unmarkUnitSold, {
    onSuccess: () => setOpen(false),
  })

  const unitLabel =
    unitType === "apartment" ? `Apartment ${unitNumber}` : `Parking ${unitNumber}`

  function confirm() {
    run({ unitId })
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setErrorMsg(null)
          setOpen(true)
        }}
      >
        Unmark
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unmark {unitLabel} as sold?</AlertDialogTitle>
            <AlertDialogDescription>
              The unit will return to available. The original sale row stays in
              the ledger marked as voided — the sale history is preserved.
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
                // AlertDialogAction closes the dialog by default; we want to
                // keep it open on error, so preventDefault and drive close
                // ourselves from confirm() on success.
                e.preventDefault()
                confirm()
              }}
              disabled={isPending}
            >
              {isPending ? "Unmarking…" : "Unmark"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
