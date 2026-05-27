"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { HistoryDialog } from "@/app/(authed)/components/history-sheet"
import type { MaterialMovement } from "@/lib/materials/schemas"
import type { Role } from "@/types"

const INR = new Intl.NumberFormat("en-IN")
const PAGE_SIZE = 50

type MovementRow = {
  _id: string
  kind: "in" | "out"
  category: MaterialMovement["category"]
  qty: number
  amount?: number
  purpose?: string
  notes?: string
  occurredAt: string
  voided?: boolean
}

function categoryLabel(c: MovementRow["category"]): string {
  switch (c) {
    case "purchase": return "Purchase"
    case "return": return "Return"
    case "consumption": return "Consumption"
    case "transfer_in": return "Transfer in"
    case "transfer_out": return "Transfer out"
  }
}

export function MovementsSheetButton({
  projectId,
  materialId,
  materialName,
  unitLabel,
  role,
}: {
  projectId: string
  materialId: string
  materialName: string
  unitLabel: string
  role: Role
}) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<MovementRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch(
      `/api/movements?projectId=${projectId}&materialId=${materialId}&page=${page}&pageSize=${PAGE_SIZE}`,
      { cache: "no-store" },
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: { rows: MovementRow[]; total: number }) => {
        if (!cancelled) {
          setRows(data.rows)
          setTotal(data.total)
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load history.")
      })
    return () => {
      cancelled = true
    }
  }, [open, projectId, materialId, page])

  const loading = open && rows === null && error === null
  const showAmount = role === "admin"
  const isAdmin = role === "admin"
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
      >
        History
      </Button>
      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) {
            setRows(null)
            setError(null)
            setPage(1)
            setTotal(0)
          }
        }}
      >
        <SheetContent side="right" className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{materialName} — movement history</SheetTitle>
            <SheetDescription>
              Newest first. Quantities in {unitLabel}.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 flex flex-col gap-3">
            {error ? (
              <p className="text-sm text-destructive" role="alert">{error}</p>
            ) : loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !rows || rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No movements yet.</p>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2">Date</th>
                      <th className="py-2">Type</th>
                      <th className="py-2 text-right">Qty</th>
                      {showAmount ? <th className="py-2 text-right">Amount</th> : null}
                      <th className="py-2">Purpose / notes</th>
                      {isAdmin ? <th className="py-2 text-right">Actions</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r._id}
                        className="border-b border-border last:border-0"
                      >
                        <td className="py-2 font-mono">
                          {new Date(r.occurredAt).toLocaleDateString()}
                        </td>
                        <td className="py-2">
                          <Badge variant={r.kind === "in" ? "default" : "secondary"}>
                            {categoryLabel(r.category)}
                          </Badge>
                        </td>
                        <td className="py-2 text-right font-mono">
                          {r.kind === "in" ? "+" : "−"}
                          {r.qty}
                        </td>
                        {showAmount ? (
                          <td className="py-2 text-right font-mono">
                            {r.amount != null ? `₹${INR.format(r.amount)}` : ""}
                          </td>
                        ) : null}
                        <td className="py-2 text-muted-foreground">
                          {[r.purpose, r.notes].filter(Boolean).join(" — ")}
                        </td>
                        {isAdmin ? (
                          <td className="py-2 text-right">
                            <HistoryDialog
                              entityType="movement"
                              entityId={r._id}
                              trigger={
                                <Button variant="ghost" size="sm">
                                  History
                                </Button>
                              }
                            />
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {totalPages > 1 ? (
                  <nav className="flex items-center justify-end gap-3 text-sm">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      ← Prev
                    </Button>
                    <span className="text-muted-foreground">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next →
                    </Button>
                  </nav>
                ) : null}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
