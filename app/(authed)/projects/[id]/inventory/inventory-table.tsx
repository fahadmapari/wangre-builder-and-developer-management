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
        : ["apartment"]
  const statuses: UnitStatus[] =
    p.status === "sold"
      ? ["sold"]
      : p.status === "all"
        ? []
        : ["available"]
  return { types, statuses }
}

export async function InventoryTable({
  projectId,
  role,
  searchParams,
  page,
  pageSize,
  currentSearchParams,
}: {
  projectId: string
  role: Role
  searchParams: InventoryFilterParams
  page: number
  pageSize: number
  currentSearchParams: Record<string, string | string[] | undefined>
}) {
  const filters = parseFilters(searchParams)
  const { rows: units, total } = await listUnitsForProject(
    new ObjectId(projectId),
    filters,
    page,
    pageSize,
  )

  if (units.length === 0) {
    return (
      <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
        No units match these filters.
      </Card>
    )
  }

  const showActions = role === "admin"
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="flex flex-col gap-3">
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
      <UnitsPagination
        current={page}
        totalPages={totalPages}
        searchParams={currentSearchParams}
      />
    </div>
  )
}

function UnitsPagination({
  current,
  totalPages,
  searchParams,
}: {
  current: number
  totalPages: number
  searchParams: Record<string, string | string[] | undefined>
}) {
  if (totalPages <= 1) return null
  const base = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (k === "unitsPage") continue
    if (typeof v === "string") base.set(k, v)
  }
  const hrefFor = (p: number) => {
    const q = new URLSearchParams(base)
    q.set("unitsPage", String(p))
    return `?${q.toString()}`
  }
  return (
    <nav className="flex items-center gap-3 text-sm">
      <PaginationLink href={hrefFor(current - 1)} disabled={current <= 1} label="← Prev" />
      <span className="text-muted-foreground">
        Page {current} of {totalPages}
      </span>
      <PaginationLink
        href={hrefFor(current + 1)}
        disabled={current >= totalPages}
        label="Next →"
      />
    </nav>
  )
}

function PaginationLink({ href, disabled, label }: { href: string; disabled: boolean; label: string }) {
  if (disabled) {
    return <span className="text-muted-foreground">{label}</span>
  }
  return (
    <a className="text-primary hover:underline" href={href}>
      {label}
    </a>
  )
}
