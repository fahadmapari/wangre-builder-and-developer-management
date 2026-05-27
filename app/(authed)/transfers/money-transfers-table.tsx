import { Card } from "@/components/ui/card"
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
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  if (rows.length === 0) {
    return (
      <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
        No money transfers in this date range.
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <Card className="overflow-hidden">
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
      <MoneyPagination
        current={page}
        totalPages={totalPages}
        searchParams={searchParams}
      />
    </div>
  )
}

function MoneyPagination({
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
    if (k === "moneyPage") continue
    if (typeof v === "string") base.set(k, v)
  }
  const hrefFor = (p: number) => {
    const q = new URLSearchParams(base)
    q.set("moneyPage", String(p))
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
