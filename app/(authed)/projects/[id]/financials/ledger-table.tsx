import { ObjectId } from "mongodb"
import { Card } from "@/components/ui/card"
import type { FinancialLedgerRow } from "@/lib/transactions/schemas"
import type { Unit } from "@/lib/projects/schemas"
import { getDb } from "@/lib/db/client"
import { LedgerRow } from "./ledger-row"

async function fetchUnitsForRows(
  rows: FinancialLedgerRow[],
): Promise<Map<string, string>> {
  const unitIds = Array.from(
    new Set(
      rows
        .filter((r) => r._type === "transaction" && r.category === "sale" && r.unitId)
        .map((r) => (r as { unitId: ObjectId }).unitId.toHexString()),
    ),
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
    ]),
  )
}

export async function LedgerTable({
  rows,
  otherProjectByRowId,
  linkedMaterials,
}: {
  rows: FinancialLedgerRow[]
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
    <Card className="h-full overflow-hidden border border-border py-0 ring-0">
      <div className="h-full overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
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
            const id = r._id.toHexString()
            if (r._type === "capital") {
              return (
                <LedgerRow
                  key={id}
                  row={{
                    _id: id,
                    occurredAt: r.occurredAt.toISOString(),
                    kind: "income",
                    category: "adhoc",
                    amount: r.amount,
                    description: "Capital Injection",
                    buyerName: null,
                    notes: r.notes ?? null,
                    voided: false,
                    isReversal: false,
                    transferGroupId: null,
                    unitLabel: "",
                    peerProjectName: null,
                  }}
                />
              )
            }
            const unitLabel =
              r.unitId && r.category === "sale"
                ? (unitLabels.get((r.unitId as ObjectId).toHexString()) ?? "")
                : ""
            return (
              <LedgerRow
                key={id}
                row={{
                  _id: id,
                  occurredAt: r.occurredAt.toISOString(),
                  kind: r.kind,
                  category: r.category,
                  amount: r.amount,
                  description: r.description,
                  buyerName: r.buyerName ?? null,
                  notes: r.notes ?? null,
                  voided: r.voided === true,
                  isReversal: r.reversalOf != null,
                  transferGroupId:
                    r.transferGroupId ? r.transferGroupId.toHexString() : null,
                  unitLabel,
                  peerProjectName:
                    otherProjectByRowId.get(id) ?? null,
                }}
                linkedMaterial={linkedMaterials?.get(id)}
              />
            )
          })}
        </tbody>
      </table>
      </div>
    </Card>
  )
}
