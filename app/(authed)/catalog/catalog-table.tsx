import { Card } from "@/components/ui/card"
import type { Material } from "@/lib/materials/schemas"
import { EditMaterialButton } from "./edit-material-dialog"
import { LastUpdatedLine } from "./material-meta-line"

const INR = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0 })

function formatUnit(m: Material): string {
  if (m.unit === "other") return m.unitOther || "—"
  if (m.unit === "m2") return "m²"
  if (m.unit === "m3") return "m³"
  return m.unit
}

function formatPrice(m: Material): string {
  if (m.unitPrice == null) return "—"
  return `₹${INR.format(m.unitPrice)}`
}

export function CatalogTable({
  materials,
  updaterById,
}: {
  materials: Material[]
  updaterById: Record<string, string>
}) {
  if (materials.length === 0) {
    return (
      <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
        No materials yet. Add the first one to get started.
      </Card>
    )
  }
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Unit</th>
            <th className="px-4 py-3">Unit price</th>
            <th className="px-4 py-3">Notes</th>
            <th className="px-4 py-3">Updated</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {materials.map((m) => (
            <tr key={String(m._id)} className="border-b border-border last:border-0">
              <td className="px-4 py-3">
                <div>{m.name}</div>
                {m.lastUpdatedBy && m.lastUpdatedAt && (
                  <LastUpdatedLine
                    actorName={
                      updaterById[m.lastUpdatedBy.toHexString()] ?? "(unknown)"
                    }
                    at={m.lastUpdatedAt}
                  />
                )}
              </td>
              <td className="px-4 py-3 font-mono">{formatUnit(m)}</td>
              <td className="px-4 py-3 font-mono">{formatPrice(m)}</td>
              <td className="px-4 py-3 max-w-xs truncate text-muted-foreground">
                {m.notes ?? ""}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {m.updatedAt.toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-right">
                <EditMaterialButton
                  material={{
                    _id: String(m._id),
                    name: m.name,
                    unit: m.unit,
                    unitOther: m.unitOther,
                    unitPrice: m.unitPrice,
                    notes: m.notes,
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
