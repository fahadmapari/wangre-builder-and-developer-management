import { notFound } from "next/navigation"
import { requireAuth } from "@/lib/auth/session"
import { getProject } from "@/lib/projects/repository"
import { Badge } from "@/components/ui/badge"
import { ProjectTabs } from "./project-tabs"

const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  under_construction: "Under construction",
  completed: "Completed",
  on_hold: "On hold",
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireAuth()
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()

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
          <Tile
            label="Total apartments"
            value={String(project.totalUnits)}
          />
          <Tile
            label="Total parkings"
            value={String(project.totalParkings)}
          />
          <Tile
            label="Sold"
            value="—"
            muted
            hint="Available after first sale (Phase 3)"
          />
          <Tile
            label="Revenue"
            value="—"
            muted
            hint="Available after first sale (Phase 3)"
          />
          <Tile
            label="Created"
            value={project.createdAt.toLocaleDateString()}
          />
        </div>
      </header>
      <ProjectTabs role={user.role} />
    </div>
  )
}

function Tile({
  label,
  value,
  muted,
  hint,
}: {
  label: string
  value: string
  muted?: boolean
  hint?: string
}) {
  return (
    <div
      className={
        "flex flex-col gap-1 rounded-lg border border-border p-3 " +
        (muted ? "bg-muted/30 text-muted-foreground" : "bg-card")
      }
      title={hint}
    >
      <span className="text-xs uppercase tracking-wide">{label}</span>
      <span className="font-mono text-xl">{value}</span>
    </div>
  )
}
