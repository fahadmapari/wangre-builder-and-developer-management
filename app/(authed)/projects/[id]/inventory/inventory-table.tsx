import { ObjectId } from "mongodb"
import { Card } from "@/components/ui/card"
import {
  listUnitsForProject,
  type UnitFilters,
} from "@/lib/projects/repository"
import type { UnitStatus, UnitType } from "@/lib/projects/schemas"
import type { Role } from "@/types"
import { UnitRow } from "./unit-row"

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
              <UnitRow
                key={String(u._id)}
                unit={{
                  _id: String(u._id),
                  number: u.number,
                  type: u.type,
                  floor: u.floor ?? null,
                  areaSqft: u.areaSqft,
                  salePrice: u.salePrice,
                  notes: u.notes ?? null,
                  status: u.status,
                  buyerName: u.buyerName ?? null,
                  soldPriceTotal: u.soldPriceTotal ?? null,
                  soldAt: u.soldAt ? u.soldAt.toISOString() : null,
                }}
                projectId={projectId}
                role={role}
              />
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
