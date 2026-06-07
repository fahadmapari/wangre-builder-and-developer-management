import { Suspense } from "react"
import Link from "next/link"
import { Home, Building2, Building, Hotel, Landmark } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { requireAuth } from "@/lib/auth/session"
import { listProjects } from "@/lib/projects/repository"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { NewProjectButton } from "./new-project-dialog"
import { ProjectFilters } from "./project-filters"

const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  under_construction: "Under construction",
  completed: "Completed",
  on_hold: "On hold",
}

function getBuildingTier(units: number): { Icon: LucideIcon; bg: string } {
  if (units <= 12)  return { Icon: Home,      bg: "bg-amber-400 dark:bg-amber-700" }
  if (units <= 30)  return { Icon: Building2, bg: "bg-emerald-500 dark:bg-emerald-700" }
  if (units <= 80)  return { Icon: Building,  bg: "bg-sky-500 dark:bg-sky-700" }
  if (units <= 200) return { Icon: Hotel,     bg: "bg-indigo-500 dark:bg-indigo-700" }
  return                    { Icon: Landmark, bg: "bg-slate-600 dark:bg-slate-700" }
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>
}) {
  const user = await requireAuth()
  const sp = await searchParams
  const VALID_STATUSES = ["planning", "under_construction", "completed", "on_hold"] as const
  const validStatus = sp.status && (VALID_STATUSES as readonly string[]).includes(sp.status)
    ? sp.status
    : undefined
  const projects = await listProjects({ status: validStatus, search: sp.search })

  const hasFilters =
    (validStatus !== undefined) ||
    ((sp.search?.trim().length ?? 0) >= 2)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {projects.length === 0
              ? hasFilters
                ? "No projects match your filters."
                : "No projects yet."
              : `${projects.length} project${projects.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {user.role === "admin" ? <NewProjectButton /> : null}
      </div>

      <Suspense>
        <ProjectFilters />
      </Suspense>

      {projects.length === 0 ? (
        <Card className="grid place-items-center gap-3 p-12 text-center">
          <p className="text-sm text-muted-foreground">
            {hasFilters ? "No projects match your filters." : "No projects yet."}
          </p>
          {user.role === "admin" && !hasFilters ? (
            <NewProjectButton variant="cta" />
          ) : null}
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const { Icon, bg } = getBuildingTier(p.totalUnits)
            return (
            <li key={String(p._id)}>
              <Link href={`/projects/${String(p._id)}`} className="block">
                <Card className="flex h-full flex-col overflow-hidden transition hover:border-foreground/30">
                  <div className={cn("flex h-24 items-center justify-center", bg)}>
                    <Icon className="h-12 w-12 text-white" />
                  </div>
                  <div className="flex flex-col gap-3 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <h2 className="font-medium leading-tight">{p.name}</h2>
                        {p.isJointVenture && (
                          <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900 dark:text-indigo-300 text-[10px] px-1.5 py-0">
                            JV
                          </Badge>
                        )}
                      </div>
                      <Badge variant="secondary">
                        {STATUS_LABEL[p.status] ?? p.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{p.location}</p>
                    <div className="mt-auto flex items-baseline gap-4 text-xs text-muted-foreground">
                      <span>
                        <span className="font-mono text-foreground">{p.totalUnits}</span>{" "}
                        apartments
                      </span>
                      <span>
                        <span className="font-mono text-foreground">{p.totalParkings}</span>{" "}
                        parkings
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Created {p.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                </Card>
              </Link>
            </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
