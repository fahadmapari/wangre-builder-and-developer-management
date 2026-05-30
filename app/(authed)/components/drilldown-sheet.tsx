"use client"

import { useEffect, useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { fetchDrilldownDetail } from "@/lib/drilldown/actions"
import { LastUpdatedLine } from "../catalog/material-meta-line"
import type {
  DrilldownDetail,
  DrilldownEntityType,
} from "@/lib/drilldown/schemas"
import { getEntityHistoryAction } from "@/app/(authed)/audit/actions"
import type { AuditEvent, AuditEntityType } from "@/lib/audit/schemas"

const INR = new Intl.NumberFormat("en-IN")

function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function entityTypeForHistory(t: DrilldownEntityType): AuditEntityType {
  switch (t) {
    case "transaction":
    case "money_transfer":
      return "transaction"
    case "movement":
    case "material_transfer":
      return "movement"
    case "unit":
      return "unit"
  }
}

type DrilldownSheetProps = {
  entityType: DrilldownEntityType
  entityId: string
  role: "admin" | "floor_manager"
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DrilldownSheet({
  entityType,
  entityId,
  role,
  open,
  onOpenChange,
}: DrilldownSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Details</SheetTitle>
          <SheetDescription>
            Full row detail, including audit history.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          <DrilldownBody
            key={open ? `open-${entityId}` : "closed"}
            entityType={entityType}
            entityId={entityId}
            role={role}
            open={open}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function DrilldownBody({
  entityType,
  entityId,
  role,
  open,
}: {
  entityType: DrilldownEntityType
  entityId: string
  role: "admin" | "floor_manager"
  open: boolean
}) {
  const showHistory = role === "admin"
  return (
    <Tabs defaultValue="details">
      <TabsList>
        <TabsTrigger value="details">Details</TabsTrigger>
        {showHistory ? <TabsTrigger value="history">History</TabsTrigger> : null}
      </TabsList>
      <TabsContent value="details" className="mt-4">
        <DetailsTab entityType={entityType} entityId={entityId} open={open} />
      </TabsContent>
      {showHistory ? (
        <TabsContent value="history" className="mt-4">
          <HistoryTab entityType={entityType} entityId={entityId} />
        </TabsContent>
      ) : null}
    </Tabs>
  )
}

function DetailsTab({
  entityType,
  entityId,
  open,
}: {
  entityType: DrilldownEntityType
  entityId: string
  open: boolean
}) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; data: DrilldownDetail }
  >({ status: "loading" })

  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetchDrilldownDetail(entityType, entityId)
      .then((res) => {
        if (cancelled) return
        if (!res.ok) setState({ status: "error", message: res.error })
        else setState({ status: "ready", data: res.data })
      })
      .catch(() => {
        if (cancelled) return
        setState({ status: "error", message: "Could not load detail." })
      })
    return () => {
      cancelled = true
    }
  }, [entityType, entityId, open])

  if (state.status === "loading") {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (state.status === "error") {
    return (
      <p className="text-sm text-destructive" role="alert">
        {state.message}
      </p>
    )
  }
  return <DrilldownDetailView data={state.data} />
}

function HistoryTab({
  entityType,
  entityId,
}: {
  entityType: DrilldownEntityType
  entityId: string
}) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; events: AuditEvent[] }
  >({ status: "loading" })

  useEffect(() => {
    let cancelled = false
    getEntityHistoryAction(entityTypeForHistory(entityType), entityId)
      .then((res) => {
        if (cancelled) return
        if (!res.ok) setState({ status: "error", message: res.error })
        else setState({ status: "ready", events: res.data })
      })
      .catch(() => {
        if (cancelled) return
        setState({ status: "error", message: "Could not load history." })
      })
    return () => {
      cancelled = true
    }
  }, [entityType, entityId])

  if (state.status === "loading") {
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
        </li>
      ))}
    </ol>
  )
}

function actionVariant(
  a: AuditEvent["action"],
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

function DrilldownDetailView({ data }: { data: DrilldownDetail }) {
  switch (data.entityType) {
    case "transaction":
      switch (data.kind) {
        case "sale":
          return (
            <DetailGrid>
              <Row label="Date" value={fmtDate(data.occurredAt)} />
              <Row label="Amount" value={`₹${INR.format(data.amount)}`} />
              <Row label="Buyer" value={data.buyerName || "—"} />
              <Row label="Unit" value={data.unitLabel ?? "—"} />
              <Row label="Description" value={data.description || "—"} />
              {data.linkedMovement ? (
                <Row
                  label="Linked stock"
                  value={`${data.linkedMovement.materialName} · ${data.linkedMovement.qty} ${data.linkedMovement.unitLabel}`}
                />
              ) : null}
              <StatusRow voided={data.voided} isReversal={data.isReversal} />
            </DetailGrid>
          )
        case "purchase":
          return (
            <DetailGrid>
              <Row label="Date" value={fmtDate(data.occurredAt)} />
              <Row label="Amount" value={`₹${INR.format(data.amount)}`} />
              <Row label="Description" value={data.description || "—"} />
              {data.linkedMovement ? (
                <Row
                  label="Linked stock"
                  value={`${data.linkedMovement.materialName} · ${data.linkedMovement.qty} · ${data.linkedMovement.projectName}`}
                />
              ) : null}
              <StatusRow voided={data.voided} isReversal={data.isReversal} />
            </DetailGrid>
          )
        case "transfer":
          return (
            <DetailGrid>
              <Row label="Date" value={fmtDate(data.occurredAt)} />
              <Row label="Amount" value={`₹${INR.format(data.amount)}`} />
              <Row label="Direction" value={data.direction === "in" ? "In" : "Out"} />
              <Row label="Peer project" value={data.peerProjectName} />
              <Row label="Transfer group" value={data.transferGroupId.slice(0, 8)} />
              {data.isReversal ? <Row label="Status" value="Reversal" /> : null}
              {data.reversedAt ? (
                <Row label="Reversed at" value={fmtDate(data.reversedAt)} />
              ) : null}
            </DetailGrid>
          )
        case "adhoc":
          return (
            <DetailGrid>
              <Row label="Date" value={fmtDate(data.occurredAt)} />
              <Row label="Amount" value={`₹${INR.format(data.amount)}`} />
              <Row label="Kind" value={data.txKind === "income" ? "Income" : "Expense"} />
              <Row label="Description" value={data.description || "—"} />
              {data.notes ? <Row label="Notes" value={data.notes} /> : null}
              <StatusRow voided={data.voided} isReversal={data.isReversal} />
            </DetailGrid>
          )
      }
    case "movement":
      return (
        <DetailGrid>
          <Row label="Date" value={fmtDate(data.occurredAt)} />
          <Row label="Material" value={data.materialName} />
          <Row label="Qty" value={`${data.qty} ${data.unitLabel}`} />
          <Row label="Category" value={data.category.replace("_", " ")} />
          {data.amount != null ? (
            <Row label="Amount" value={`₹${INR.format(data.amount)}`} />
          ) : null}
          {data.purpose ? <Row label="Purpose" value={data.purpose} /> : null}
          {data.notes ? <Row label="Notes" value={data.notes} /> : null}
          {data.peerProjectName ? (
            <Row label="Peer project" value={data.peerProjectName} />
          ) : null}
          {data.voided ? <Row label="Status" value="Voided" /> : null}
        </DetailGrid>
      )
    case "unit":
      return (
        <div className="flex flex-col gap-3">
          <DetailGrid>
            <Row label="Type" value={data.type === "apartment" ? "Apartment" : "Parking"} />
            <Row label="Number" value={data.number} />
            {data.floor != null ? <Row label="Floor" value={String(data.floor)} /> : null}
            <Row label="Status" value={data.status === "sold" ? "Sold" : "Available"} />
            {data.soldPriceTotal != null ? (
              <Row label="Sold price" value={`₹${INR.format(data.soldPriceTotal)}`} />
            ) : null}
            {data.buyerName ? <Row label="Buyer" value={data.buyerName} /> : null}
            {data.soldAt ? <Row label="Sold on" value={fmtDate(data.soldAt)} /> : null}
          </DetailGrid>
          {data.lastUpdatedBy && (
            <LastUpdatedLine
              actorName={data.lastUpdatedBy.actorName}
              at={data.lastUpdatedBy.at}
            />
          )}
        </div>
      )
    case "money_transfer":
      return (
        <DetailGrid>
          <Row label="From" value={data.sourceProjectName} />
          <Row label="To" value={data.destProjectName} />
          <Row label="Amount" value={`₹${INR.format(data.amount)}`} />
          <Row label="Date" value={fmtDate(data.occurredAt)} />
          <Row label="Status" value={data.status === "reversed" ? "Reversed" : "Active"} />
          {data.reversedAt ? (
            <Row label="Reversed at" value={fmtDate(data.reversedAt)} />
          ) : null}
        </DetailGrid>
      )
    case "material_transfer":
      return (
        <DetailGrid>
          <Row label="From" value={data.sourceProjectName} />
          <Row label="To" value={data.destProjectName} />
          <Row label="Material" value={data.materialName} />
          <Row label="Qty" value={`${data.qty} ${data.unitLabel}`} />
          <Row label="Date" value={fmtDate(data.occurredAt)} />
          <Row label="Status" value={data.status === "reversed" ? "Reversed" : "Active"} />
          {data.reversedAt ? (
            <Row label="Reversed at" value={fmtDate(data.reversedAt)} />
          ) : null}
        </DetailGrid>
      )
  }
}

function DetailGrid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">{children}</dl>
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </>
  )
}

function StatusRow({ voided, isReversal }: { voided: boolean; isReversal: boolean }) {
  if (!voided && !isReversal) return null
  return (
    <>
      <dt className="text-muted-foreground">Status</dt>
      <dd>
        {voided ? (
          <Badge variant="destructive">Voided</Badge>
        ) : (
          <Badge variant="secondary">Reversal</Badge>
        )}
      </dd>
    </>
  )
}
