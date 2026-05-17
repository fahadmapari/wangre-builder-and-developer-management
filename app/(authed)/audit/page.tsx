import { ObjectId } from "mongodb"
import { requireAdmin } from "@/lib/auth/session"
import { listAuditEvents } from "@/lib/audit/repository"
import type {
  AuditAction,
  AuditEntityType,
  AuditFilters,
} from "@/lib/audit/schemas"
import { getDb } from "@/lib/db/client"
import { AuditFiltersForm } from "./audit-filters"
import { AuditTable } from "./audit-table"

const VALID_ACTIONS: AuditAction[] = ["created", "voided", "reversed"]
const VALID_ENTITY_TYPES: AuditEntityType[] = [
  "transaction",
  "movement",
  "project",
  "unit",
  "material",
]

function parseLocalDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return isNaN(d.getTime()) ? null : d
}

function parseFilters(searchParams: Record<string, string | string[] | undefined>): AuditFilters {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const fromRaw = first(searchParams.from)
  const toRaw = first(searchParams.to)
  const actorRaw = first(searchParams.actor)
  const actionRaw = first(searchParams.action)
  const entityTypeRaw = first(searchParams.entityType)
  const projectRaw = first(searchParams.project)
  const pageRaw = first(searchParams.page)
  const pageSizeRaw = first(searchParams.pageSize)
  const parsedFrom = fromRaw ? parseLocalDate(fromRaw) : null
  const parsedTo = toRaw ? parseLocalDate(toRaw) : null
  return {
    from: parsedFrom ?? monthStart,
    to: parsedTo ?? now,
    actorId: actorRaw && ObjectId.isValid(actorRaw) ? new ObjectId(actorRaw) : undefined,
    action: actionRaw && VALID_ACTIONS.includes(actionRaw as AuditAction)
      ? (actionRaw as AuditAction)
      : undefined,
    entityType:
      entityTypeRaw && VALID_ENTITY_TYPES.includes(entityTypeRaw as AuditEntityType)
        ? (entityTypeRaw as AuditEntityType)
        : undefined,
    projectId:
      projectRaw && ObjectId.isValid(projectRaw)
        ? new ObjectId(projectRaw)
        : undefined,
    page: pageRaw ? Math.max(1, parseInt(pageRaw, 10) || 1) : 1,
    pageSize: pageSizeRaw ? Math.min(200, parseInt(pageSizeRaw, 10) || 50) : 50,
  }
}

function first(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0]
  return v
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAdmin()
  const sp = await searchParams
  const filters = parseFilters(sp)

  // Load filter-form options (users + projects)
  const db = getDb()
  const [users, projects] = await Promise.all([
    db
      .collection<{ _id: ObjectId; name?: string; email?: string; role?: string }>("users")
      .find({}, { projection: { name: 1, email: 1, role: 1 } })
      .sort({ name: 1 })
      .limit(500)
      .toArray(),
    db
      .collection<{ _id: ObjectId; name: string }>("projects")
      .find({}, { projection: { name: 1 } })
      .sort({ name: 1 })
      .limit(500)
      .toArray(),
  ])

  const { events, total } = await listAuditEvents(filters)
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize))

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Audit</h1>
        <p className="text-sm text-muted-foreground">
          {total} event{total === 1 ? "" : "s"} · page {filters.page} of {totalPages}
        </p>
      </header>
      <AuditFiltersForm
        currentFilters={filters}
        users={users.map((u) => ({
          id: u._id.toHexString(),
          label: u.name ?? u.email ?? "(unknown)",
        }))}
        projects={projects.map((p) => ({
          id: p._id.toHexString(),
          label: p.name,
        }))}
      />
      <AuditTable events={events} />
      <Pagination current={filters.page} total={totalPages} searchParams={sp} />
    </div>
  )
}

function Pagination({ current, total, searchParams }: { current: number; total: number; searchParams: Record<string, string | string[] | undefined> }) {
  if (total <= 1) return null
  const base = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === "string") base.set(k, v)
  }
  const hrefFor = (p: number) => {
    const q = new URLSearchParams(base)
    q.set("page", String(p))
    return `?${q.toString()}`
  }
  return (
    <nav className="flex items-center gap-3 text-sm">
      <PaginationLink href={hrefFor(current - 1)} disabled={current <= 1} label="← Prev" />
      <span className="text-muted-foreground">
        Page {current} of {total}
      </span>
      <PaginationLink href={hrefFor(current + 1)} disabled={current >= total} label="Next →" />
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
