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
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const unitLabel =
    unitType === "apartment" ? `Apartment ${unitNumber}` : `Parking ${unitNumber}`

  function confirm() {
    setErrorMsg(null)
    startTransition(async () => {
      const result = await unmarkUnitSold({ unitId })
      if (!result.ok) {
        setErrorMsg(result.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
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
