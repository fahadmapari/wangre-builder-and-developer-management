"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin, requireAuth } from "@/lib/auth/session"
import type { ActionResult } from "@/lib/projects/schemas"
import {
  CreateMaterialInputSchema,
  UpdateMaterialInputSchema,
} from "@/lib/materials/schemas"
import {
  createMaterial as createMaterialRepo,
  updateMaterial as updateMaterialRepo,
  UnitChangeAfterMovementsError,
  MaterialNotFoundError,
} from "@/lib/materials/repository"

/**
 * Both roles. FMs cannot set unitPrice — stripped from raw input before
 * validation. Admin can set unitPrice freely.
 */
export async function createMaterial(
  raw: unknown
): Promise<ActionResult<{ materialId: string }>> {
  const user = await requireAuth()

  // FM-side strip: a malicious or buggy FM client cannot smuggle unitPrice in.
  let cleaned = raw
  if (user.role !== "admin" && raw && typeof raw === "object") {
    const { unitPrice: _drop, ...rest } = raw as Record<string, unknown>
    cleaned = rest
  }

  const parsed = CreateMaterialInputSchema.safeParse(cleaned)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      error: first?.message ?? "Invalid input",
      field: first?.path.join(".") || undefined,
    }
  }

  try {
    const { materialId } = await createMaterialRepo(parsed.data, user.id)
    // Catalog is global; both the catalog page and any project's Materials tab
    // could be showing a stale list.
    revalidatePath("/catalog")
    revalidatePath("/projects", "layout")
    return { ok: true, data: { materialId: materialId.toHexString() } }
  } catch (err) {
    console.error("createMaterial failed", err)
    return {
      ok: false,
      error: "Could not create material. Please try again.",
    }
  }
}

/**
 * Admin only. Unit-change guard surfaces as a typed error → user-friendly
 * message, not a generic failure.
 */
export async function updateMaterial(
  raw: unknown
): Promise<ActionResult<{ updated: boolean }>> {
  await requireAdmin()
  const parsed = UpdateMaterialInputSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      error: first?.message ?? "Invalid input",
      field: first?.path.join(".") || undefined,
    }
  }

  try {
    const { matchedCount } = await updateMaterialRepo(parsed.data)
    if (matchedCount === 0) {
      return { ok: false, error: "Material not found." }
    }
    revalidatePath("/catalog")
    revalidatePath("/projects", "layout")
    return { ok: true, data: { updated: true } }
  } catch (err) {
    if (err instanceof UnitChangeAfterMovementsError) {
      return { ok: false, error: err.message, field: "unit" }
    }
    if (err instanceof MaterialNotFoundError) {
      return { ok: false, error: err.message }
    }
    console.error("updateMaterial failed", err)
    return {
      ok: false,
      error: "Could not update material. Please try again.",
    }
  }
}
