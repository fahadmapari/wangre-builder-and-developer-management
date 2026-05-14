import { ObjectId } from "mongodb"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  listUnitsForProject,
  type UnitFilters,
} from "@/lib/projects/repository"
import type { UnitStatus, UnitType } from "@/lib/projects/schemas"
import type { Role } from "@/types"
import { MarkSoldButton } from "./mark-sold-dialog"
import { UnmarkButton } from "./unmark-confirm-dialog"

const INR = new Intl.NumberFormat("en-IN")

function formatRupees(n: number): string {
  return `₹${INR.format(n)}`
}

function formatDate(d?: Date): string {
  return d ? d.toLocaleDateString() : ""
}

export type InventoryFilterParams = {
  type?: string
  status?: string
}

function parseFilters(p: InventoryFilterParams): UnitFilters {
  const types: UnitType[] =
    p.type === "parking"
      ? ["parking"]
      : p.type === "all"
        ? []
        : ["apartment"] // default
  const statuses: UnitStatus[] =
    p.status === "sold"
      ? ["sold"]
      : p.status === "all"
        ? []
        : ["available"] // default
  return { types, statuses }
}

export async function InventoryTable({
  projectId,
  role,
  searchParams,
}: {
  projectId: string
  role: Role
  searchParams: InventoryFilterParams
}) {
  const filters = parseFilters(searchParams)
  const units = await listUnitsForProject(new ObjectId(projectId), filters)

  if (units.length === 0) {
    return (
      <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
        No units match these filters.
      </Card>
    )
  }

  const showActions = role === "admin"

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Number</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Floor</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Buyer</th>
            <th className="px-4 py-3">Sold price</th>
            <th className="px-4 py-3">Sold date</th>
            {showActions ? <th className="px-4 py-3" /> : null}
          </tr>
        </thead>
        <tbody>
          {units.map((u) => (
            <tr key={String(u._id)} className="border-b border-border last:border-0">
              <td className="px-4 py-3 font-mono">{u.number}</td>
              <td className="px-4 py-3 capitalize">{u.type}</td>
              <td className="px-4 py-3 font-mono">{u.floor}</td>
              <td className="px-4 py-3">
                <Badge variant={u.status === "sold" ? "default" : "secondary"}>
                  {u.status === "sold" ? "Sold" : "Available"}
                </Badge>
              </td>
              <td className="px-4 py-3">{u.buyerName ?? ""}</td>
              <td className="px-4 py-3 font-mono">
                {u.soldPriceTotal ? formatRupees(u.soldPriceTotal) : ""}
              </td>
              <td className="px-4 py-3">{formatDate(u.soldAt)}</td>
              {showActions ? (
                <td className="px-4 py-3 text-right">
                  {u.status === "available" ? (
                    <MarkSoldButton
                      projectId={projectId}
                      unitId={String(u._id)}
                      unitType={u.type}
                      unitNumber={u.number}
                    />
                  ) : (
                    <UnmarkButton
                      unitId={String(u._id)}
                      unitType={u.type}
                      unitNumber={u.number}
                    />
                  )}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
