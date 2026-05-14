"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/session"
import {
  CreateProjectInputSchema,
  type ActionResult,
} from "@/lib/projects/schemas"
import { createProjectWithUnits } from "@/lib/projects/repository"

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
    return { ok: true, data: { projectId: projectId.toHexString() } }
  } catch (err) {
    console.error("createProject failed", err)
    return {
      ok: false,
      error: "Could not create project. Please try again.",
    }
  }
}
