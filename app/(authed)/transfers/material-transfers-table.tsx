import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { MaterialTransferRow } from "@/lib/transfers/schemas"
import type { MaterialUnit } from "@/lib/materials/schemas"
import { ReverseTransferButton } from "./reverse-transfer-dialog"

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function formatUnit(unit: MaterialUnit, unitOther?: string): string {
  if (unit === "other") return unitOther || "—"
  if (unit === "m2") return "m²"
  if (unit === "m3") return "m³"
  return unit
}

export function MaterialTransfersTable({
  rows,
}: {
  rows: MaterialTransferRow[]
}) {
  if (rows.length === 0) {
    return (
      <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
        No material transfers in this date range.
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
            <th className="px-4 py-3">Material</th>
            <th className="px-4 py-3 text-right">Qty</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Created by</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const unitLabel = formatUnit(r.materialUnit, r.materialUnitOther)
            return (
              <tr
                key={r.transferGroupId}
                className="border-b border-border last:border-0"
              >
                <td className="px-4 py-3 font-mono text-xs">
                  {fmtDate(r.occurredAt)}
                </td>
                <td className="px-4 py-3">
                  <span>{r.sourceProjectName}</span>
                  <span className="px-2 text-muted-foreground">→</span>
                  <span>{r.destProjectName}</span>
                </td>
                <td className="px-4 py-3">{r.materialName}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {r.qty} {unitLabel}
                </td>
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
                  {r.status === "active" ? (
                    <ReverseTransferButton
                      transferGroupId={r.transferGroupId}
                      kind="material"
                      summary={`${r.sourceProjectName} → ${r.destProjectName} · ${r.qty} ${unitLabel} ${r.materialName}`}
                    />
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}
