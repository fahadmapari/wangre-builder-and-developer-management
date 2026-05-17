import { ObjectId } from "mongodb"
import { getDb } from "@/lib/db/client"
import type {
  AuditEvent,
  AuditFilters,
  AuditAction,
  AuditEntityType,
} from "./schemas"

// ──────────────────────────────────────────────────────────────────────────
// Per-collection projection helpers. Each returns an array of AuditEvents
// in their "raw" shape — actorName/projectName are filled in later by the
// bulk denormalization step in listAuditEvents.
// ──────────────────────────────────────────────────────────────────────────

type RawEvent = Omit<AuditEvent, "actorName" | "actorRole" | "projectName">

function endOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(23, 59, 59, 999)
  return out
}

function inRange(d: Date | undefined, from: Date, to: Date): boolean {
  if (!d) return false
  return d >= from && d <= to
}

async function fetchTransactionEvents(filters: AuditFilters): Promise<RawEvent[]> {
  const db = getDb()
  const to = endOfDay(filters.to)
  const baseQuery: Record<string, unknown> = {
    $or: [
      { createdAt: { $gte: filters.from, $lte: to } },
      { voidedAt: { $gte: filters.from, $lte: to } },
    ],
  }
  if (filters.projectId) baseQuery.projectId = filters.projectId
  const rows = await db
    .collection<{
      _id: ObjectId
      projectId: ObjectId
      category: string
      kind: string
      amount: number
      description: string
      reversalOf?: ObjectId
      voided?: boolean
      voidedAt?: Date
      voidedBy?: ObjectId
      createdBy: ObjectId
      createdAt: Date
    }>("transactions")
    .find(baseQuery)
    .toArray()
  const out: RawEvent[] = []
  for (const r of rows) {
    // Created or reversed event (one or the other, from createdAt)
    if (inRange(r.createdAt, filters.from, to)) {
      const action: AuditAction = r.reversalOf ? "reversed" : "created"
      out.push({
        id: `transaction:${r._id.toHexString()}:${action}`,
        occurredAt: r.createdAt,
        actorId: r.createdBy,
        action,
        entityType: "transaction",
        entityId: r._id,
        projectId: r.projectId,
        summary: summarizeTransaction(r, action),
        refUrl: `/projects/${r.projectId.toHexString()}/financials`,
      })
    }
    // Voided event (independent, from voidedAt)
    if (r.voidedAt && r.voidedBy && inRange(r.voidedAt, filters.from, to)) {
      out.push({
        id: `transaction:${r._id.toHexString()}:voided`,
        occurredAt: r.voidedAt,
        actorId: r.voidedBy,
        action: "voided",
        entityType: "transaction",
        entityId: r._id,
        projectId: r.projectId,
        summary: `Voided ${r.kind} (₹${r.amount.toLocaleString("en-IN")}): ${r.description}`,
        refUrl: `/projects/${r.projectId.toHexString()}/financials`,
      })
    }
  }
  return out
}

function summarizeTransaction(
  r: {
    category: string
    kind: string
    amount: number
    description: string
  },
  action: AuditAction
): string {
  const amount = `₹${r.amount.toLocaleString("en-IN")}`
  const verb = action === "created" ? "Created" : "Reversed"
  return `${verb} ${r.category} (${amount}): ${r.description}`
}

async function fetchMovementEvents(filters: AuditFilters): Promise<RawEvent[]> {
  const db = getDb()
  const to = endOfDay(filters.to)
  const baseQuery: Record<string, unknown> = {
    $or: [
      { createdAt: { $gte: filters.from, $lte: to } },
      { voidedAt: { $gte: filters.from, $lte: to } },
    ],
  }
  if (filters.projectId) baseQuery.projectId = filters.projectId
  const rows = await db
    .collection<{
      _id: ObjectId
      projectId: ObjectId
      materialId: ObjectId
      category: string
      kind: string
      qty: number
      reversalOf?: ObjectId
      voided?: boolean
      voidedAt?: Date
      voidedBy?: ObjectId
      createdBy: ObjectId
      createdAt: Date
    }>("materialMovements")
    .find(baseQuery)
    .toArray()
  const out: RawEvent[] = []
  for (const r of rows) {
    if (inRange(r.createdAt, filters.from, to)) {
      const action: AuditAction = r.reversalOf ? "reversed" : "created"
      out.push({
        id: `movement:${r._id.toHexString()}:${action}`,
        occurredAt: r.createdAt,
        actorId: r.createdBy,
        action,
        entityType: "movement",
        entityId: r._id,
        projectId: r.projectId,
        summary: `${action === "created" ? "Created" : "Reversed"} ${r.category} (${r.qty}, ${r.kind})`,
        refUrl: `/projects/${r.projectId.toHexString()}/materials`,
      })
    }
    if (r.voidedAt && r.voidedBy && inRange(r.voidedAt, filters.from, to)) {
      out.push({
        id: `movement:${r._id.toHexString()}:voided`,
        occurredAt: r.voidedAt,
        actorId: r.voidedBy,
        action: "voided",
        entityType: "movement",
        entityId: r._id,
        projectId: r.projectId,
        summary: `Voided ${r.category} (${r.qty}, ${r.kind})`,
        refUrl: `/projects/${r.projectId.toHexString()}/materials`,
      })
    }
  }
  return out
}

async function fetchProjectEvents(filters: AuditFilters): Promise<RawEvent[]> {
  const db = getDb()
  const to = endOfDay(filters.to)
  const baseQuery: Record<string, unknown> = {
    createdAt: { $gte: filters.from, $lte: to },
  }
  if (filters.projectId) baseQuery._id = filters.projectId
  const rows = await db
    .collection<{
      _id: ObjectId
      name: string
      createdBy: ObjectId
      createdAt: Date
    }>("projects")
    .find(baseQuery)
    .toArray()
  return rows.map((r) => ({
    id: `project:${r._id.toHexString()}:created`,
    occurredAt: r.createdAt,
    actorId: r.createdBy,
    action: "created" as AuditAction,
    entityType: "project" as AuditEntityType,
    entityId: r._id,
    projectId: r._id,
    summary: `Created project: ${r.name}`,
    refUrl: `/projects/${r._id.toHexString()}`,
  }))
}

async function fetchUnitEvents(filters: AuditFilters): Promise<RawEvent[]> {
  const db = getDb()
  const to = endOfDay(filters.to)
  const baseQuery: Record<string, unknown> = {
    createdAt: { $gte: filters.from, $lte: to },
  }
  if (filters.projectId) baseQuery.projectId = filters.projectId
  const rows = await db
    .collection<{
      _id: ObjectId
      projectId: ObjectId
      type: string
      number: string
      createdBy: ObjectId
      createdAt: Date
    }>("units")
    .find(baseQuery)
    .toArray()
  return rows.map((r) => ({
    id: `unit:${r._id.toHexString()}:created`,
    occurredAt: r.createdAt,
    actorId: r.createdBy,
    action: "created" as AuditAction,
    entityType: "unit" as AuditEntityType,
    entityId: r._id,
    projectId: r.projectId,
    summary: `Created ${r.type}: ${r.number}`,
    refUrl: `/projects/${r.projectId.toHexString()}`,
  }))
}

async function fetchMaterialEvents(filters: AuditFilters): Promise<RawEvent[]> {
  const db = getDb()
  const to = endOfDay(filters.to)
  // Materials catalog has no projectId. If the user filtered by project, no
  // materials catalog events match — return [].
  if (filters.projectId) return []
  const rows = await db
    .collection<{
      _id: ObjectId
      name: string
      createdBy: ObjectId
      createdAt: Date
    }>("materials")
    .find({ createdAt: { $gte: filters.from, $lte: to } })
    .toArray()
  return rows.map((r) => ({
    id: `material:${r._id.toHexString()}:created`,
    occurredAt: r.createdAt,
    actorId: r.createdBy,
    action: "created" as AuditAction,
    entityType: "material" as AuditEntityType,
    entityId: r._id,
    summary: `Added material to catalog: ${r.name}`,
  }))
}

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

export async function listAuditEvents(
  filters: AuditFilters
): Promise<{ events: AuditEvent[]; total: number }> {
  // Decide which collections are in scope based on entityType filter.
  const fetchers: Array<Promise<RawEvent[]>> = []
  const wantsType = (t: AuditEntityType) =>
    !filters.entityType || filters.entityType === t
  if (wantsType("transaction")) fetchers.push(fetchTransactionEvents(filters))
  if (wantsType("movement")) fetchers.push(fetchMovementEvents(filters))
  if (wantsType("project")) fetchers.push(fetchProjectEvents(filters))
  if (wantsType("unit")) fetchers.push(fetchUnitEvents(filters))
  if (wantsType("material")) fetchers.push(fetchMaterialEvents(filters))

  const chunks = await Promise.all(fetchers)
  let raw = chunks.flat()

  // Apply post-projection filters that are easier here than in the queries.
  if (filters.actorId) {
    const actorHex = filters.actorId.toHexString()
    raw = raw.filter((e) => e.actorId.toHexString() === actorHex)
  }
  if (filters.action) {
    raw = raw.filter((e) => e.action === filters.action)
  }

  // Sort newest first
  raw.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())

  // Bulk denormalize actor and project names
  const denormalized = await denormalize(raw)

  // Paginate
  const total = denormalized.length
  const start = (filters.page - 1) * filters.pageSize
  const events = denormalized.slice(start, start + filters.pageSize)
  return { events, total }
}

async function denormalize(raw: RawEvent[]): Promise<AuditEvent[]> {
  if (raw.length === 0) return []
  const db = getDb()
  const actorIds = [...new Set(raw.map((e) => e.actorId.toHexString()))].map(
    (s) => new ObjectId(s)
  )
  const projectIds = [
    ...new Set(raw.map((e) => e.projectId?.toHexString()).filter((x): x is string => !!x)),
  ].map((s) => new ObjectId(s))
  const [users, projects] = await Promise.all([
    actorIds.length === 0
      ? Promise.resolve([] as Array<{ _id: ObjectId; name?: string; email?: string; role?: string }>)
      : db
          .collection<{ _id: ObjectId; name?: string; email?: string; role?: string }>("users")
          .find({ _id: { $in: actorIds } }, { projection: { name: 1, email: 1, role: 1 } })
          .toArray(),
    projectIds.length === 0
      ? Promise.resolve([] as Array<{ _id: ObjectId; name: string }>)
      : db
          .collection<{ _id: ObjectId; name: string }>("projects")
          .find({ _id: { $in: projectIds } }, { projection: { name: 1 } })
          .toArray(),
  ])
  const userById = new Map(users.map((u) => [u._id.toHexString(), u]))
  const projectById = new Map(projects.map((p) => [p._id.toHexString(), p.name]))
  return raw.map((e) => {
    const u = userById.get(e.actorId.toHexString())
    const actorName = u?.name ?? u?.email ?? "(unknown)"
    const actorRole: "admin" | "floor_manager" =
      u?.role === "admin" ? "admin" : "floor_manager"
    return {
      ...e,
      actorName,
      actorRole,
      projectName: e.projectId
        ? projectById.get(e.projectId.toHexString())
        : undefined,
    }
  })
}
