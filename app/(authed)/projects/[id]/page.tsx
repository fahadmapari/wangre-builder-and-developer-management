import { ObjectId } from "mongodb"
import { notFound } from "next/navigation"
import { requireAuth } from "@/lib/auth/session"
import {
  countSoldUnits,
  getProject,
} from "@/lib/projects/repository"
import { sumProjectRevenue } from "@/lib/transactions/repository"
import { Badge } from "@/components/ui/badge"
import { ProjectTabs } from "./project-tabs"
import { InventoryFilters } from "./inventory/inventory-filters"
import {
  InventoryTable,
  type InventoryFilterParams,
} from "./inventory/inventory-table"
import { MaterialsTable } from "./materials/materials-table"

const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  under_construction: "Under construction",
  completed: "Completed",
  on_hold: "On hold",
}

const INR = new Intl.NumberFormat("en-IN")

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<InventoryFilterParams>
}) {
  const user = await requireAuth()
  const { id } = await params
  const sp = await searchParams

  if (!ObjectId.isValid(id)) notFound()
  const projectObjectId = new ObjectId(id)

  const [project, soldCount, revenue] = await Promise.all([
    getProject(id),
    countSoldUnits(projectObjectId),
    sumProjectRevenue(projectObjectId),
  ])
  if (!project) notFound()

  const totalUnitsAndParkings = project.totalUnits + project.totalParkings

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
          <MaterialsTable projectId={id} role={user.role} />
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
