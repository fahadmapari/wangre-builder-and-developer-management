import { Badge } from "@/components/ui/badge"
import type { AuditEvent } from "@/lib/audit/schemas"

export function AuditTable({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No events match the current filters.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr className="text-left">
            <th className="px-3 py-2 font-medium">When</th>
            <th className="px-3 py-2 font-medium">Actor</th>
            <th className="px-3 py-2 font-medium">Action</th>
            <th className="px-3 py-2 font-medium">Entity</th>
            <th className="px-3 py-2 font-medium">Summary</th>
            <th className="px-3 py-2 font-medium">Project</th>
            <th className="px-3 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {events.map((e) => (
            <tr key={e.id} className="hover:bg-muted/30">
              <td className="px-3 py-2 whitespace-nowrap" title={e.occurredAt.toISOString()}>
                {e.occurredAt.toLocaleString()}
              </td>
              <td className="px-3 py-2">
                <span>{e.actorName}</span>
                <Badge variant="outline" className="ml-2 text-xs">
                  {e.actorRole === "admin" ? "admin" : "FM"}
                </Badge>
              </td>
              <td className="px-3 py-2">
                {e.action === "updated" ? (
                  <Badge className="bg-amber-100 text-amber-800">{e.action}</Badge>
                ) : (
                  <Badge variant={actionVariant(e.action)}>{e.action}</Badge>
                )}
              </td>
              <td className="px-3 py-2">{e.entityType}</td>
              <td className="px-3 py-2">{e.summary}</td>
              <td className="px-3 py-2">{e.projectName ?? ""}</td>
              <td className="px-3 py-2 text-right">
                {e.refUrl ? (
                  <a
                    href={e.refUrl}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    View →
                  </a>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function actionVariant(
  a: AuditEvent["action"]
): "default" | "destructive" | "secondary" {
  if (a === "voided") return "destructive"
  if (a === "reversed") return "secondary"
  return "default"
}
