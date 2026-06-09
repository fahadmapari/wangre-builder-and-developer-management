import { Card } from "@/components/ui/card"
import { Pagination } from "@/components/pagination"
import type { MaterialTransferRow as MaterialTransferRowData } from "@/lib/transfers/schemas"
import { MaterialTransferRow } from "./material-transfer-row"

export function MaterialTransfersTable({
  rows,
  page,
  pageSize,
  total,
  searchParams,
}: {
  rows: MaterialTransferRowData[]
  page: number
  pageSize: number
  total: number
  searchParams: Record<string, string | string[] | undefined>
}) {
  if (rows.length === 0) {
    return (
      <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
        No material transfers in this date range.
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <Card className="overflow-hidden border border-border ring-0">
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
            {rows.map((r) => (
              <MaterialTransferRow
                key={r.transferGroupId}
                row={{
                  transferGroupId: r.transferGroupId,
                  sourceMovId: r.sourceMovId,
                  occurredAt: r.occurredAt.toISOString(),
                  sourceProjectName: r.sourceProjectName,
                  destProjectName: r.destProjectName,
                  materialName: r.materialName,
                  materialUnit: r.materialUnit,
                  materialUnitOther: r.materialUnitOther,
                  qty: r.qty,
                  status: r.status,
                  reversedAt: r.reversedAt ? r.reversedAt.toISOString() : null,
                  createdByName: r.createdByName,
                }}
              />
            ))}
          </tbody>
        </table>
      </Card>
      <Pagination
        current={page}
        total={total}
        pageSize={pageSize}
        searchParams={searchParams}
        pageKey="materialPage"
        pageSizeKey="materialPageSize"
      />
    </div>
  )
}
