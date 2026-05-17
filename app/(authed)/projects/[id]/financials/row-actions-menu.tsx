"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { VoidConfirmDialog } from "./void-confirm-dialog"
import { ReverseConfirmDialog } from "./reverse-confirm-dialog"

export type RowActionsContext = {
  transactionId: string
  description: string
  amount: number
  kind: "income" | "expense"
  category: "sale" | "purchase" | "adhoc" | "transfer_in" | "transfer_out"
  voided: boolean
  isReversal: boolean
}

function actionsForRow(ctx: RowActionsContext): {
  canVoid: boolean
  canReverse: boolean
} {
  if (ctx.voided) return { canVoid: false, canReverse: false }
  if (ctx.isReversal) return { canVoid: false, canReverse: false }
  if (ctx.category === "transfer_in" || ctx.category === "transfer_out") {
    return { canVoid: false, canReverse: false }
  }
  return {
    canVoid: ctx.category === "adhoc",
    canReverse:
      ctx.category === "sale" ||
      ctx.category === "purchase" ||
      ctx.category === "adhoc",
  }
}

export function RowActionsMenu(ctx: RowActionsContext) {
  const [voidOpen, setVoidOpen] = useState(false)
  const [reverseOpen, setReverseOpen] = useState(false)
  const { canVoid, canReverse } = actionsForRow(ctx)

  if (!canVoid && !canReverse) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost">
            ⋯
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canVoid ? (
            <DropdownMenuItem onClick={() => setVoidOpen(true)}>
              Void
            </DropdownMenuItem>
          ) : null}
          {canReverse ? (
            <DropdownMenuItem onClick={() => setReverseOpen(true)}>
              Reverse
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {canVoid ? (
        <VoidConfirmDialog
          key={voidOpen ? `void-open-${ctx.transactionId}` : "void-closed"}
          open={voidOpen}
          onOpenChange={setVoidOpen}
          transactionId={ctx.transactionId}
          description={ctx.description}
          amount={ctx.amount}
          kind={ctx.kind}
        />
      ) : null}
      {canReverse ? (
        <ReverseConfirmDialog
          key={reverseOpen ? `rev-open-${ctx.transactionId}` : "rev-closed"}
          open={reverseOpen}
          onOpenChange={setReverseOpen}
          transactionId={ctx.transactionId}
          description={ctx.description}
          amount={ctx.amount}
          kind={ctx.kind}
          category={ctx.category}
        />
      ) : null}
    </>
  )
}
