import { ObjectId } from "mongodb"
import { notFound } from "next/navigation"
import { requireAuth } from "@/lib/auth/session"
import {
  countSoldUnits,
  getProject,
  listProjects,
} from "@/lib/projects/repository"
import {
  sumProjectRevenue,
  listLedger,
  computeTotals,
} from "@/lib/transactions/repository"
import { listProjectMaterials, listCatalog } from "@/lib/materials/repository"
import type { Transaction } from "@/lib/transactions/schemas"
import type { Material, MaterialMovement } from "@/lib/materials/schemas"
import {
  parseLedgerFilters,
  defaultLedgerFrom,
  defaultLedgerTo,
} from "@/lib/transactions/filters"
import { getDb } from "@/lib/db/client"
import { Badge } from "@/components/ui/badge"
import { ProjectTabs } from "./project-tabs"
import { InventoryFilters } from "./inventory/inventory-filters"
import {
  InventoryTable,
  type InventoryFilterParams,
} from "./inventory/inventory-table"
import { MaterialsTable } from "./materials/materials-table"
import { FinancialsView } from "./financials/financials-view"

const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  under_construction: "Under construction",
  completed: "Completed",
  on_hold: "On hold",
}

const INR = new Intl.NumberFormat("en-IN")

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function parsePage(raw: string | undefined): number {
  if (!raw) return 1
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return 1
  return n
}

const LEDGER_PAGE_SIZE = 50
const UNITS_PAGE_SIZE = 50

// Build a Map<transactionId, { name, unit, qty, projectName }> for purchase
// rows on the current page, so the Reverse dialog can pre-fill the helper
// text. Non-purchase rows have no entry; the dialog hides the checkbox.
async function loadLinkedMaterials(
  rows: Array<{ _id: ObjectId; category: string }>,
  projectName: string
): Promise<Map<string, { name: string; unit: string; qty: number; projectName: string }>> {
  const purchaseIds = rows
    .filter((r) => r.category === "purchase")
    .map((r) => r._id)
  if (purchaseIds.length === 0) return new Map()
  const db = getDb()
  const movs = await db
    .collection<MaterialMovement>("materialMovements")
    .find(
      { transactionId: { $in: purchaseIds }, category: "purchase" },
      { projection: { transactionId: 1, materialId: 1, qty: 1 } }
    )
    .toArray()
  const materialIds = [
    ...new Set(movs.map((m) => m.materialId.toHexString())),
  ].map((s) => new ObjectId(s))
  if (materialIds.length === 0) return new Map()
  const materials = await db
    .collection<Material>("materials")
    .find(
      { _id: { $in: materialIds } },
      { projection: { name: 1, unit: 1, unitOther: 1 } }
    )
    .toArray()
  const matById = new Map(materials.map((m) => [m._id.toHexString(), m]))
  const out = new Map<
    string,
    { name: string; unit: string; qty: number; projectName: string }
  >()
  for (const mov of movs) {
    if (!mov.transactionId) continue
    const mat = matById.get(mov.materialId.toHexString())
    if (!mat) continue
    out.set(mov.transactionId.toHexString(), {
      name: mat.name,
      unit: mat.unit === "other" ? mat.unitOther ?? "unit" : mat.unit,
      qty: mov.qty,
      projectName,
    })
  }
  return out
}

type AllSearchParams = InventoryFilterParams & {
  from?: string
  to?: string
  kind?: string
  category?: string
  voided?: string
  search?: string
  page?: string
  unitsPage?: string
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<AllSearchParams>
}) {
  const user = await requireAuth()
  const { id } = await params
  const sp = await searchParams

  if (!ObjectId.isValid(id)) notFound()
  const projectObjectId = new ObjectId(id)
  const isAdmin = user.role === "admin"

  const filters = parseLedgerFilters(sp)
  const page = parsePage(sp.page)
  const defaultFromIso = isoDate(defaultLedgerFrom())
  const defaultToIso = isoDate(defaultLedgerTo())

  const exportParams = new URLSearchParams()
  exportParams.set("projectId", id)
  exportParams.set("from", isoDate(filters.from))
  exportParams.set("to", isoDate(filters.to))
  if (filters.kind !== "all") exportParams.set("kind", filters.kind)
  if (filters.category !== "all") exportParams.set("category", filters.category)
  exportParams.set("voided", filters.includeVoided ? "all" : "active")
  if (filters.search) exportParams.set("search", filters.search)
  const ledgerExportHref = `/api/export/ledger?${exportParams.toString()}`

  const [project, soldCount, revenue, materialRows, catalog, ledgerResult, totals, allProjects] =
    await Promise.all([
      getProject(id),
      countSoldUnits(projectObjectId),
      sumProjectRevenue(projectObjectId),
      listProjectMaterials(projectObjectId),
      listCatalog(),
      isAdmin
        ? listLedger(projectObjectId, filters, page, LEDGER_PAGE_SIZE)
        : Promise.resolve({ rows: [], total: 0 }),
      isAdmin
        ? computeTotals(projectObjectId, filters)
        : Promise.resolve({ revenue: 0, expenses: 0, net: 0, transfersIn: 0, transfersOut: 0 }),
      listProjects(),
    ])
  if (!project) notFound()

  const ledgerRows = ledgerResult.rows
  const ledgerTotal = ledgerResult.total

  // Compute peer-project lookup for transfer badge in ledger
  const transferGroupIds = ledgerRows
    .filter((r) => r.transferGroupId)
    .map((r) => r.transferGroupId!)

  const otherProjectByRowId = new Map<string, string>()
  if (transferGroupIds.length > 0) {
    const db = getDb()
    const peerRows = await db
      .collection<Transaction>("transactions")
      .find({
        transferGroupId: { $in: transferGroupIds },
        projectId: { $ne: projectObjectId },
      })
      .project<{ _id: ObjectId; transferGroupId?: ObjectId; projectId: ObjectId }>({
        transferGroupId: 1,
        projectId: 1,
      })
      .toArray()
    const peerProjectByGroup = new Map<string, ObjectId>()
    for (const peer of peerRows) {
      if (peer.transferGroupId) {
        peerProjectByGroup.set(peer.transferGroupId.toHexString(), peer.projectId)
      }
    }
    const peerProjectIds = [...new Set(peerProjectByGroup.values())]
    const peerProjects = await db
      .collection<{ _id: ObjectId; name: string }>("projects")
      .find({ _id: { $in: peerProjectIds } })
      .project<{ _id: ObjectId; name: string }>({ name: 1 })
      .toArray()
    const peerProjectNameById = new Map(
      peerProjects.map((p) => [p._id.toHexString(), p.name])
    )
    for (const row of ledgerRows) {
      if (!row.transferGroupId) continue
      const peerId = peerProjectByGroup.get(row.transferGroupId.toHexString())
      if (!peerId) continue
      const peerName =
        peerProjectNameById.get(peerId.toHexString()) ?? "(unknown project)"
      otherProjectByRowId.set(row._id.toHexString(), peerName)
    }
  }

  // Phase 7 — prefetch linkedMaterial for purchase rows so the Reverse dialog
  // can show "decrements {project}'s {material} by {qty} {unit}" without an
  // extra round trip on click. Only computed for admins (non-admins get an
  // empty ledger anyway).
  const linkedMaterials = isAdmin
    ? await loadLinkedMaterials(ledgerRows, project.name)
    : new Map<
        string,
        { name: string; unit: string; qty: number; projectName: string }
      >()

  const totalUnitsAndParkings = project.totalUnits + project.totalParkings
  const projectsForPicker = allProjects.map((p) => ({
    id: p._id.toHexString(),
    name: p.name,
  }))
  const catalogForPicker = catalog.map((m) => ({
    materialId: String(m._id),
    name: m.name,
    unit: m.unit,
    unitOther: m.unitOther ?? "",
    unitPrice: m.unitPrice,
  }))

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {project.name}
            </h1>
            <p className="text-sm text-muted-foreground">{project.location}</p>
          </div>
          <Badge variant="secondary">
            {STATUS_LABEL[project.status] ?? project.status}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Tile label="Total apartments" value={String(project.totalUnits)} />
          <Tile label="Total parkings" value={String(project.totalParkings)} />
          <Tile
            label="Sold"
            value={`${soldCount} / ${totalUnitsAndParkings}`}
          />
          <Tile label="Revenue" value={`₹${INR.format(revenue)}`} />
          <Tile
            label="Created"
            value={project.createdAt.toLocaleDateString()}
          />
        </div>
      </header>
      <ProjectTabs
        role={user.role}
        inventory={
          <div className="flex flex-col gap-2">
            <InventoryFilters />
            <InventoryTable
              projectId={id}
              role={user.role}
              searchParams={sp}
              page={parsePage(sp.unitsPage)}
              pageSize={UNITS_PAGE_SIZE}
              currentSearchParams={sp}
            />
          </div>
        }
        materials={
          <MaterialsTable
            projectId={id}
            role={user.role}
            rows={materialRows}
            catalog={catalogForPicker}
            projects={projectsForPicker}
          />
        }
        financials={
          isAdmin ? (
            <FinancialsView
              projectId={id}
              rows={ledgerRows}
              totals={totals}
              defaultFrom={defaultFromIso}
              defaultTo={defaultToIso}
              projects={projectsForPicker}
              otherProjectByRowId={otherProjectByRowId}
              linkedMaterials={linkedMaterials}
              search={filters.search}
              ledgerExportHref={ledgerExportHref}
              page={page}
              pageSize={LEDGER_PAGE_SIZE}
              total={ledgerTotal}
              currentSearchParams={sp}
            />
          ) : undefined
        }
      />
    </div>
  )
}

function Tile({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3">
      <span className="text-xs uppercase tracking-wide">{label}</span>
      <span className="font-mono text-xl">{value}</span>
    </div>
  )
}
