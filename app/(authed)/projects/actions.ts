"use server"

import { ObjectId } from "mongodb"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/session"
import {
  CreateProjectInputSchema,
  UpdateProjectInputSchema,
  type ActionResult,
} from "@/lib/projects/schemas"
import { createProjectWithUnits } from "@/lib/projects/repository"
import { getDb } from "@/lib/db/client"
import { withUpdateMeta } from "@/lib/audit/update-meta"

export async function createProject(
  raw: unknown
): Promise<ActionResult<{ projectId: string }>> {
  const user = await requireAdmin()
  const parsed = CreateProjectInputSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      error: first?.message ?? "Invalid input",
      field: first?.path.join(".") || undefined,
    }
  }

  try {
    const { projectId } = await createProjectWithUnits(parsed.data, user.id)
    revalidatePath("/projects")
    revalidatePath("/audit")
    return { ok: true, data: { projectId: projectId.toHexString() } }
  } catch (err) {
    console.error("createProject failed", err)
    return {
      ok: false,
      error: "Could not create project. Please try again.",
    }
  }
}

export async function updateProject(
  raw: unknown
): Promise<ActionResult<void>> {
  const user = await requireAdmin()

  const parsed = UpdateProjectInputSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? "Invalid input",
      field: issue?.path?.[0]?.toString(),
    }
  }
  const input = parsed.data

  if (!ObjectId.isValid(input.projectId)) {
    return { ok: false, error: "Invalid project id" }
  }

  const set: Record<string, unknown> = {}
  if (input.name !== undefined) set.name = input.name
  if (input.location !== undefined) set.location = input.location
  if (input.status !== undefined) set.status = input.status
  if (input.notes !== undefined) set.notes = input.notes

  try {
    const db = getDb()
    const result = await db.collection("projects").findOneAndUpdate(
      { _id: new ObjectId(input.projectId) },
      { $set: withUpdateMeta(set, user.id) },
      { returnDocument: "after" }
    )
    if (!result) {
      return { ok: false, error: "Project not found" }
    }
    revalidatePath(`/projects/${input.projectId}`)
    revalidatePath("/projects")
    revalidatePath("/audit")
    return { ok: true, data: undefined }
  } catch (e) {
    console.error("[updateProject]", e)
    return { ok: false, error: "Failed to update project" }
  }
}
