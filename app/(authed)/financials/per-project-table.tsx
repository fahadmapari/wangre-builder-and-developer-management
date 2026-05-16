import Link from "next/link"
import { Card } from "@/components/ui/card"
import type { PerProjectTotals } from "@/lib/transactions/repository"

const INR = new Intl.NumberFormat("en-IN")

function fmt(n: number): string {
  return `${n < 0 ? "−" : ""}₹${INR.format(Math.abs(n))}`
}

export function PerProjectTable({ rows }: { rows: PerProjectTotals[] }) {
  if (rows.length === 0) {
    return (
      <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
        No transactions in this date range across any project.
      </Card>
    )
  }
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Project</th>
            <th className="px-4 py-3 text-right">Revenue</th>
            <th className="px-4 py-3 text-right">Expenses</th>
            <th className="px-4 py-3 text-right">Net</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.projectId} className="border-b border-border last:border-0">
              <td className="px-4 py-3">
                <Link
                  href={`/projects/${r.projectId}?tab=financials`}
                  className="hover:underline"
                >
                  {r.projectName}
                </Link>
              </td>
              <td className="px-4 py-3 text-right font-mono">
                ₹{INR.format(r.revenue)}
                {r.transfersIn > 0 ? (
                  <div className="text-xs text-muted-foreground font-sans">
                    incl. ₹{INR.format(r.transfersIn)} transfers in
                  </div>
                ) : null}
              </td>
              <td className="px-4 py-3 text-right font-mono">
                ₹{INR.format(r.expenses)}
                {r.transfersOut > 0 ? (
                  <div className="text-xs text-muted-foreground font-sans">
                    incl. ₹{INR.format(r.transfersOut)} transfers out
                  </div>
                ) : null}
              </td>
              <td
                className={
                  "px-4 py-3 text-right font-mono " +
                  (r.net < 0 ? "text-destructive" : "")
                }
              >
                {fmt(r.net)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
