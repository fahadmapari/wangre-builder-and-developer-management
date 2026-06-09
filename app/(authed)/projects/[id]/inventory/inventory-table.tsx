import { ObjectId } from "mongodb"
import { Card } from "@/components/ui/card"
import { Pagination } from "@/components/pagination"
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
  isJointVentureProject,
}: {
  projectId: string
  role: Role
  searchParams: InventoryFilterParams
  page: number
  pageSize: number
  currentSearchParams: Record<string, string | string[] | undefined>
  isJointVentureProject: boolean
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

  return (
    <div className="flex min-h-0 h-full flex-col gap-3">
      <Card className="min-h-0 flex-1 overflow-hidden border border-border py-0 ring-0">
        <div className="h-full overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
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
                  isJointVentureUnit: u.isJointVentureUnit ?? false,
                }}
                projectId={projectId}
                role={role}
                isJointVentureProject={isJointVentureProject}
              />
            ))}
          </tbody>
        </table>
        </div>
      </Card>
      <Pagination
        current={page}
        total={total}
        pageSize={pageSize}
        searchParams={currentSearchParams}
        pageKey="unitsPage"
        pageSizeKey="unitsPageSize"
      />
    </div>
  )
}
