import { requireAuth } from "@/lib/auth/session"

export default async function Home() {
  const user = await requireAuth()
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="font-mono">{user.email}</span> with role{" "}
          <span className="font-mono">{user.role}</span>.
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-border bg-card/40 p-6 text-sm text-muted-foreground">
        Project list, financials, materials — coming in the next phase.
      </div>
    </div>
  )
}
