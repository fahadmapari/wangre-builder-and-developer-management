import Link from "next/link"
import { requireAuth } from "@/lib/auth/session"
import { listProjects } from "@/lib/projects/repository"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { NewProjectButton } from "./new-project-dialog"

const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  under_construction: "Under construction",
  completed: "Completed",
  on_hold: "On hold",
}

export default async function ProjectsPage() {
  const user = await requireAuth()
  const projects = await listProjects()

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {projects.length === 0
              ? "No projects yet."
              : `${projects.length} project${projects.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {user.role === "admin" ? <NewProjectButton /> : null}
      </div>

      {projects.length === 0 ? (
        <Card className="grid place-items-center gap-3 p-12 text-center">
          <p className="text-sm text-muted-foreground">No projects yet.</p>
          {user.role === "admin" ? <NewProjectButton variant="cta" /> : null}
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <li key={String(p._id)}>
              <Link
                href={`/projects/${String(p._id)}`}
                className="block"
              >
                <Card className="flex h-full flex-col gap-3 p-5 transition hover:border-foreground/30">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-medium leading-tight">{p.name}</h2>
                    <Badge variant="secondary">
                      {STATUS_LABEL[p.status] ?? p.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{p.location}</p>
                  <div className="mt-auto flex items-baseline gap-4 text-xs text-muted-foreground">
                    <span>
                      <span className="font-mono text-foreground">
                        {p.totalUnits}
                      </span>{" "}
                      apartments
                    </span>
                    <span>
                      <span className="font-mono text-foreground">
                        {p.totalParkings}
                      </span>{" "}
                      parkings
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Created {p.createdAt.toLocaleDateString()}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
