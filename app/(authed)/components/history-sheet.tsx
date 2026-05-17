"use client"

import { useEffect, useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { getEntityHistoryAction } from "@/app/(authed)/audit/actions"
import type { AuditEvent, AuditEntityType } from "@/lib/audit/schemas"

type HistoryProps = {
  entityType: AuditEntityType
  entityId: string
  trigger: React.ReactNode
}

// Shared body component. Renders the loading/error/list states.
function HistoryBody({
  entityType,
  entityId,
  open,
}: {
  entityType: AuditEntityType
  entityId: string
  open: boolean
}) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; events: AuditEvent[] }
  >({ status: "idle" })

  useEffect(() => {
    if (!open) return
    setState({ status: "loading" })
    getEntityHistoryAction(entityType, entityId).then((res) => {
      if (!res.ok) {
        setState({ status: "error", message: res.error })
      } else {
        setState({ status: "ready", events: res.data })
      }
    })
  }, [open, entityType, entityId])

  if (state.status === "loading" || state.status === "idle") {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (state.status === "error") {
    return (
      <p className="text-sm text-destructive" role="alert">
        {state.message}
      </p>
    )
  }
  if (state.events.length === 0) {
    return <p className="text-sm text-muted-foreground">No history found.</p>
  }
  return (
    <ol className="flex flex-col gap-3">
      {state.events.map((e) => (
        <li
          key={e.id}
          className="flex flex-col gap-1 rounded border border-border bg-card p-3"
        >
          <div className="flex items-center gap-2">
            <Badge variant={actionVariant(e.action)}>{e.action}</Badge>
            <span className="text-sm font-medium">{e.actorName}</span>
            <Badge variant="outline" className="text-xs">
              {e.actorRole === "admin" ? "admin" : "floor manager"}
            </Badge>
            <span
              className="ml-auto text-xs text-muted-foreground"
              title={e.occurredAt.toISOString()}
            >
              {formatRelative(e.occurredAt)}
            </span>
          </div>
          <p className="text-sm">{e.summary}</p>
          {e.projectName ? (
            <p className="text-xs text-muted-foreground">{e.projectName}</p>
          ) : null}
        </li>
      ))}
    </ol>
  )
}

function actionVariant(
  a: AuditEvent["action"]
): "default" | "destructive" | "secondary" {
  if (a === "voided") return "destructive"
  if (a === "reversed") return "secondary"
  return "default"
}

function formatRelative(d: Date): string {
  const diff = Date.now() - d.getTime()
  const m = Math.round(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.round(h / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString()
}

export function HistorySheet({ entityType, entityId, trigger }: HistoryProps) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>History</SheetTitle>
          <SheetDescription>
            Lifecycle events for this entity, newest first.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          <HistoryBody entityType={entityType} entityId={entityId} open={open} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function HistoryDialog({ entityType, entityId, trigger }: HistoryProps) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>History</DialogTitle>
          <DialogDescription>
            Lifecycle events for this entity, newest first.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2">
          <HistoryBody entityType={entityType} entityId={entityId} open={open} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
