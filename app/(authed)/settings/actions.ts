"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/session"
import { AddAllowedEmailSchema, UpdateUserRoleSchema } from "@/lib/settings/schemas"
import type { ActionResult } from "@/lib/projects/schemas"
import {
  upsertAllowedEmail,
  deleteAllowedEmailByEmail,
  updateUserRoleInDb,
  deleteUserById,
  deleteSessionsByUserId,
  getUserIdByEmail,
  getUserById,
  getAllowedEmailByEmail,
} from "@/lib/settings/repository"

export async function addAllowedEmail(
  raw: unknown
): Promise<ActionResult<void>> {
  const currentUser = await requireAdmin()

  const parsed = AddAllowedEmailSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      error: first?.message ?? "Invalid input",
      field: first?.path.join(".") || undefined,
    }
  }

  await upsertAllowedEmail(
    parsed.data.email,
    parsed.data.role,
    currentUser.email ?? ""
  )
  revalidatePath("/settings")
  return { ok: true, data: undefined }
}

export async function removeAllowedEmail(
  email: string
): Promise<ActionResult<void>> {
  const currentUser = await requireAdmin()

  if (currentUser.email?.toLowerCase() === email.toLowerCase()) {
    return { ok: false, error: "You cannot remove yourself from the access list." }
  }

  const userId = await getUserIdByEmail(email)
  if (userId) {
    await deleteSessionsByUserId(userId)
  }
  await deleteAllowedEmailByEmail(email)
  revalidatePath("/settings")
  return { ok: true, data: undefined }
}

export async function updateUserRole(
  raw: unknown
): Promise<ActionResult<void>> {
  const currentUser = await requireAdmin()

  const parsed = UpdateUserRoleSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: "Invalid input" }
  }

  const { userId, role } = parsed.data
  await updateUserRoleInDb(userId, role)

  // Keep allowedEmails in sync
  const user = await getUserById(userId)
  if (user?.email) {
    const entry = await getAllowedEmailByEmail(user.email)
    if (entry) {
      await upsertAllowedEmail(user.email, role, currentUser.email ?? "system")
    }
  }

  revalidatePath("/settings")
  return { ok: true, data: undefined }
}

export async function removeUser(userId: string): Promise<ActionResult<void>> {
  const currentUser = await requireAdmin()

  const target = await getUserById(userId)
  if (!target) return { ok: false, error: "User not found." }

  if (currentUser.id === userId) {
    return { ok: false, error: "You cannot remove your own account." }
  }

  await deleteSessionsByUserId(userId)
  await deleteUserById(userId)
  if (target.email) {
    await deleteAllowedEmailByEmail(target.email)
  }
  revalidatePath("/settings")
  return { ok: true, data: undefined }
}
