import Link from "next/link"
import { requireAuth } from "@/lib/auth/session"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { UserMenu } from "./user-menu"

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireAuth()
  const roleLabel = user.role === "admin" ? "Admin" : "Floor manager"
  const roleVariant = user.role === "admin" ? "default" : "secondary"

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 font-mono text-sm font-semibold">
            <span className="grid size-7 place-items-center rounded-md border border-border bg-card text-xs">
              W
            </span>
            Wangre
          </Link>
          {user.role === "admin" ? (
            <Link
              href="/catalog"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Catalog
            </Link>
          ) : null}
          <Separator orientation="vertical" className="h-5" />
          <Badge variant={roleVariant}>{roleLabel}</Badge>
        </div>
        <UserMenu
          email={user.email ?? ""}
          name={user.name ?? null}
          image={user.image ?? null}
        />
      </header>
      <main className="flex-1 bg-background">{children}</main>
    </div>
  )
}
