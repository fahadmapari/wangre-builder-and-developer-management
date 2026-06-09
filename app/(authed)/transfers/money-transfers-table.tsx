import { Card } from "@/components/ui/card"
import { Pagination } from "@/components/pagination"
import type { MoneyTransferRow as MoneyTransferRowData } from "@/lib/transfers/schemas"
import { MoneyTransferRow } from "./money-transfer-row"

export function MoneyTransfersTable({
  rows,
  page,
  pageSize,
  total,
  searchParams,
}: {
  rows: MoneyTransferRowData[]
  page: number
  pageSize: number
  total: number
  searchParams: Record<string, string | string[] | undefined>
}) {
  if (rows.length === 0) {
    return (
      <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
        No money transfers in this date range.
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
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created by</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <MoneyTransferRow
                key={r.transferGroupId}
                row={{
                  transferGroupId: r.transferGroupId,
                  sourceTxId: r.sourceTxId,
                  occurredAt: r.occurredAt.toISOString(),
                  sourceProjectName: r.sourceProjectName,
                  destProjectName: r.destProjectName,
                  amount: r.amount,
                  description: r.description,
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
        pageKey="moneyPage"
        pageSizeKey="moneyPageSize"
      />
    </div>
  )
}
