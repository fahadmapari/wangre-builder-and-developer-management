import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { MoneyTransferRow } from "@/lib/transfers/schemas"
import { HistorySheet } from "@/app/(authed)/components/history-sheet"
import { ReverseTransferButton } from "./reverse-transfer-dialog"

const INR = new Intl.NumberFormat("en-IN")

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function MoneyTransfersTable({ rows }: { rows: MoneyTransferRow[] }) {
  if (rows.length === 0) {
    return (
      <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
        No money transfers in this date range.
      </Card>
    )
  }
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">From → To</th>
            <th className="px-4 py-3 text-right">Amount</th>
            <th className="px-4 py-3">Description</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Created by</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.transferGroupId}
              className="border-b border-border last:border-0"
            >
              <td className="px-4 py-3 font-mono text-xs">{fmtDate(r.occurredAt)}</td>
              <td className="px-4 py-3">
                <span>{r.sourceProjectName}</span>
                <span className="px-2 text-muted-foreground">→</span>
                <span>{r.destProjectName}</span>
              </td>
              <td className="px-4 py-3 text-right font-mono">
                ₹{INR.format(r.amount)}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{r.description}</td>
              <td className="px-4 py-3">
                {r.status === "reversed" ? (
                  <Badge variant="secondary">
                    Reversed{r.reversedAt ? ` on ${fmtDate(r.reversedAt)}` : ""}
                  </Badge>
                ) : (
                  <Badge variant="outline">Active</Badge>
                )}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {r.createdByName ?? "—"}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <HistorySheet
                    entityType="transaction"
                    entityId={r.sourceTxId}
                    trigger={
                      <Button variant="ghost" size="sm">
                        History
                      </Button>
                    }
                  />
                  {r.status === "active" ? (
                    <ReverseTransferButton
                      transferGroupId={r.transferGroupId}
                      kind="money"
                      summary={`${r.sourceProjectName} → ${r.destProjectName} · ₹${INR.format(r.amount)}`}
                    />
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
