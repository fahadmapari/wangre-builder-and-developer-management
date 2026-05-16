import { ObjectId } from "mongodb"
import { notFound } from "next/navigation"
import { requireAuth } from "@/lib/auth/session"
import {
  countSoldUnits,
  getProject,
} from "@/lib/projects/repository"
import {
  sumProjectRevenue,
  listLedger,
  computeTotals,
} from "@/lib/transactions/repository"
import { listProjectMaterials, listCatalog } from "@/lib/materials/repository"
import type {
  LedgerFilters,
  LedgerKindFilter,
  LedgerCategoryFilter,
} from "@/lib/transactions/schemas"
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

function startOfYear(): Date {
  const d = new Date()
  d.setMonth(0, 1)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfYear(): Date {
  const d = new Date()
  d.setMonth(11, 31)
  d.setHours(23, 59, 59, 999)
  return d
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function parseDate(raw: string | undefined, fallback: Date): Date {
  if (!raw) return fallback
  const d = new Date(raw + "T00:00:00")
  if (Number.isNaN(d.getTime())) return fallback
  return d
}

function parseKind(raw: string | undefined): LedgerKindFilter {
  return raw === "income" || raw === "expense" ? raw : "all"
}

function parseCategory(raw: string | undefined): LedgerCategoryFilter {
  switch (raw) {
    case "sale":
    case "purchase":
    case "adhoc":
    case "transfer_in":
    case "transfer_out":
      return raw
    default:
      return "all"
  }
}

type AllSearchParams = InventoryFilterParams & {
  from?: string
  to?: string
  kind?: string
  category?: string
  voided?: string
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

  const defaultFromDate = startOfYear()
  const defaultToDate = endOfYear()
  const ledgerFilters: LedgerFilters = {
    from: parseDate(sp.from, defaultFromDate),
    to: parseDate(sp.to, defaultToDate),
    kind: parseKind(sp.kind),
    category: parseCategory(sp.category),
    includeVoided: sp.voided === "all",
  }

  const [project, soldCount, revenue, materialRows, catalog, ledgerRows, totals] =
    await Promise.all([
      getProject(id),
      countSoldUnits(projectObjectId),
      sumProjectRevenue(projectObjectId),
      listProjectMaterials(projectObjectId),
      listCatalog(),
      isAdmin ? listLedger(projectObjectId, ledgerFilters) : Promise.resolve([]),
      isAdmin
        ? computeTotals(projectObjectId, ledgerFilters)
        : Promise.resolve({ revenue: 0, expenses: 0, net: 0, transfersIn: 0, transfersOut: 0 }),
    ])
  if (!project) notFound()

  const totalUnitsAndParkings = project.totalUnits + project.totalParkings
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
            />
          </div>
        }
        materials={
          <MaterialsTable
            projectId={id}
            role={user.role}
            rows={materialRows}
            catalog={catalogForPicker}
          />
        }
        financials={
          isAdmin ? (
            <FinancialsView
              projectId={id}
              rows={ledgerRows}
              totals={totals}
              defaultFrom={isoDate(defaultFromDate)}
              defaultTo={isoDate(defaultToDate)}
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
