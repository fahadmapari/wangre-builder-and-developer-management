import { redirect } from "next/navigation"
import { auth } from "@/auth"
import type { Role } from "@/types"

export async function getCurrentUser() {
  const session = await auth()
  return session?.user ?? null
}

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  return user
}

export async function requireRole(...allowed: Role[]) {
  const user = await requireAuth()
  if (!allowed.includes(user.role)) {
    // Floor managers hitting an admin-only action should land on the authed home,
    // not the login screen — they're authenticated, just not authorized.
    redirect("/")
  }
  return user
}

export const requireAdmin = () => requireRole("admin")
