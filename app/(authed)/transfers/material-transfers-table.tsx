import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { MaterialTransferRow } from "@/lib/transfers/schemas"
import type { MaterialUnit } from "@/lib/materials/schemas"
import { HistorySheet } from "@/app/(authed)/components/history-sheet"
import { ReverseTransferButton } from "./reverse-transfer-dialog"

function fmtDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function formatUnit(unit: MaterialUnit, unitOther?: string): string {
  if (unit === "other") return unitOther || "—"
  if (unit === "m2") return "m²"
  if (unit === "m3") return "m³"
  return unit
}

export function MaterialTransfersTable({
  rows,
  page,
  pageSize,
  total,
  searchParams,
}: {
  rows: MaterialTransferRow[]
  page: number
  pageSize: number
  total: number
  searchParams: Record<string, string | string[] | undefined>
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  if (rows.length === 0) {
    return (
      <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
        No material transfers in this date range.
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
                    <div className="flex items-center justify-end gap-2">
                      <HistorySheet
                        entityType="movement"
                        entityId={r.sourceMovId}
                        trigger={
                          <Button variant="ghost" size="sm">
                            History
                          </Button>
                        }
                      />
                      {r.status === "active" ? (
                        <ReverseTransferButton
                          transferGroupId={r.transferGroupId}
                          kind="material"
                          summary={`${r.sourceProjectName} → ${r.destProjectName} · ${r.qty} ${unitLabel} ${r.materialName}`}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
      <MaterialPagination
        current={page}
        totalPages={totalPages}
        searchParams={searchParams}
      />
    </div>
  )
}

function MaterialPagination({
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
    if (k === "materialPage") continue
    if (typeof v === "string") base.set(k, v)
  }
  const hrefFor = (p: number) => {
    const q = new URLSearchParams(base)
    q.set("materialPage", String(p))
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
