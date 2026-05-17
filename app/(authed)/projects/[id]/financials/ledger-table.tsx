import { ObjectId } from "mongodb"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Transaction } from "@/lib/transactions/schemas"
import type { Unit } from "@/lib/projects/schemas"
import { getDb } from "@/lib/db/client"
import { RowActionsMenu } from "./row-actions-menu"

const INR = new Intl.NumberFormat("en-IN")

function fmtAmount(t: Transaction): string {
  const sign = t.reversalOf ? "−" : ""
  return `${sign}₹${INR.format(t.amount)}`
}

function categoryLabel(c: Transaction["category"]): string {
  switch (c) {
    case "sale":
      return "Sale"
    case "purchase":
      return "Purchase"
    case "adhoc":
      return "Ad-hoc"
    case "transfer_in":
      return "Transfer in"
    case "transfer_out":
      return "Transfer out"
  }
}

async function fetchUnitsForRows(
  rows: Transaction[]
): Promise<Map<string, string>> {
  const unitIds = Array.from(
    new Set(
      rows
        .filter((r) => r.category === "sale" && r.unitId)
        .map((r) => (r.unitId as ObjectId).toHexString())
    )
  )
  if (unitIds.length === 0) return new Map()
  const db = getDb()
  const docs = await db
    .collection<Unit>("units")
    .find({ _id: { $in: unitIds.map((id) => new ObjectId(id)) } })
    .project<{ _id: ObjectId; type: Unit["type"]; number: string }>({
      type: 1,
      number: 1,
    })
    .toArray()
  return new Map(
    docs.map((d) => [
      d._id.toHexString(),
      `${d.type === "apartment" ? "Apt" : "Parking"} ${d.number}`,
    ])
  )
}

export async function LedgerTable({
  rows,
  otherProjectByRowId,
  linkedMaterials,
}: {
  rows: Transaction[]
  otherProjectByRowId: Map<string, string>
  linkedMaterials?: Map<
    string,
    { name: string; unit: string; qty: number; projectName: string }
  >
}) {
  if (rows.length === 0) {
    return (
      <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
        No transactions match these filters.
      </Card>
    )
  }
  const unitLabels = await fetchUnitsForRows(rows)

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Kind</th>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3 text-right">Amount</th>
            <th className="px-4 py-3">Description</th>
            <th className="px-4 py-3">Buyer</th>
            <th className="px-4 py-3">Linked</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const voided = r.voided === true
            const isReversal = r.reversalOf != null
            const rowClass = voided
              ? "border-b border-border last:border-0 opacity-60 line-through"
              : "border-b border-border last:border-0"
            const unitLabel =
              r.unitId && r.category === "sale"
                ? (unitLabels.get(r.unitId.toHexString()) ?? "")
                : ""
            return (
              <tr key={String(r._id)} className={rowClass}>
                <td className="px-4 py-3 font-mono">
                  {r.occurredAt.toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Badge variant={r.kind === "income" ? "default" : "secondary"}>
                      {r.kind === "income" ? "Income" : "Expense"}
                    </Badge>
                    {isReversal ? (
                      <Badge variant="outline" className="text-xs">
                        Reversal
                      </Badge>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="secondary">{categoryLabel(r.category)}</Badge>
                </td>
                <td className="px-4 py-3 text-right font-mono">{fmtAmount(r)}</td>
                <td className="px-4 py-3">
                  {r.description}
                  {r.transferGroupId ? (
                    <Badge variant="outline" className="ml-2 text-xs">
                      ↔ {otherProjectByRowId.get(r._id.toHexString()) ?? "Other project"}
                    </Badge>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {r.buyerName ?? ""}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{unitLabel}</td>
                <td className="px-4 py-3 text-right">
                  <RowActionsMenu
                    transactionId={String(r._id)}
                    description={r.description}
                    amount={r.amount}
                    kind={r.kind}
                    category={r.category}
                    voided={voided}
                    isReversal={isReversal}
                    linkedMaterial={linkedMaterials?.get(r._id.toHexString())}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}
