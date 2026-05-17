"use server"

import { ObjectId } from "mongodb"
import { revalidatePath } from "next/cache"
import { requireAdmin, requireAuth } from "@/lib/auth/session"
import type { ActionResult } from "@/lib/projects/schemas"
import {
  LogConsumptionInputSchema,
  LogReturnInputSchema,
  RecordPurchaseInputSchema,
} from "@/lib/materials/schemas"
import {
  getMaterial,
  logConsumption as logConsumptionRepo,
  logReturn as logReturnRepo,
  recordPurchase as recordPurchaseRepo,
  InsufficientStockError,
} from "@/lib/materials/repository"

export async function recordPurchase(
  raw: unknown
): Promise<ActionResult<{ transactionId: string; movementId: string }>> {
  const user = await requireAdmin()
  const parsed = RecordPurchaseInputSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      error: first?.message ?? "Invalid input",
      field: first?.path.join(".") || undefined,
    }
  }

  const { projectId, materialId, qty, unitPriceAtMovement, occurredAt, notes } =
    parsed.data
  if (!ObjectId.isValid(projectId) || !ObjectId.isValid(materialId)) {
    return { ok: false, error: "Invalid project or material id." }
  }

  // Need the material's display name for the auto-generated transaction
  // description. A separate read is acceptable — it runs before the
  // withTransaction, so any cache miss here is harmless.
  const material = await getMaterial(materialId)
  if (!material) {
    return { ok: false, error: "Material not found." }
  }

  try {
    const { transactionId, movementId } = await recordPurchaseRepo(
      {
        projectId: new ObjectId(projectId),
        materialId: new ObjectId(materialId),
        qty,
        unitPriceAtMovement,
        occurredAt,
        notes,
        materialName: material.name,
      },
      user.id
    )
    revalidatePath(`/projects/${projectId}`)
    revalidatePath("/audit")
    return {
      ok: true,
      data: {
        transactionId: transactionId.toHexString(),
        movementId: movementId.toHexString(),
      },
    }
  } catch (err) {
    console.error("recordPurchase failed", err)
    return {
      ok: false,
      error: "Could not record purchase. Please try again.",
    }
  }
}

export async function logConsumption(
  raw: unknown
): Promise<ActionResult<{ movementId: string; remainingStock: number }>> {
  const user = await requireAuth()
  const parsed = LogConsumptionInputSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      error: first?.message ?? "Invalid input",
      field: first?.path.join(".") || undefined,
    }
  }

  const { projectId, materialId, qty, purpose, occurredAt, notes } = parsed.data
  if (!ObjectId.isValid(projectId) || !ObjectId.isValid(materialId)) {
    return { ok: false, error: "Invalid project or material id." }
  }

  try {
    const { movementId, remainingStock } = await logConsumptionRepo(
      {
        projectId: new ObjectId(projectId),
        materialId: new ObjectId(materialId),
        qty,
        purpose,
        occurredAt,
        notes,
      },
      user.id
    )
    revalidatePath(`/projects/${projectId}`)
    revalidatePath("/audit")
    return {
      ok: true,
      data: { movementId: movementId.toHexString(), remainingStock },
    }
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      return {
        ok: false,
        error: `Only ${err.available} available — refresh and try again.`,
        field: "qty",
      }
    }
    console.error("logConsumption failed", err)
    return {
      ok: false,
      error: "Could not log consumption. Please try again.",
    }
  }
}

export async function logReturn(
  raw: unknown
): Promise<ActionResult<{ movementId: string }>> {
  const user = await requireAuth()
  const parsed = LogReturnInputSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      error: first?.message ?? "Invalid input",
      field: first?.path.join(".") || undefined,
    }
  }

  const { projectId, materialId, qty, purpose, occurredAt, notes } = parsed.data
  if (!ObjectId.isValid(projectId) || !ObjectId.isValid(materialId)) {
    return { ok: false, error: "Invalid project or material id." }
  }

  try {
    const { movementId } = await logReturnRepo(
      {
        projectId: new ObjectId(projectId),
        materialId: new ObjectId(materialId),
        qty,
        purpose,
        occurredAt,
        notes,
      },
      user.id
    )
    revalidatePath(`/projects/${projectId}`)
    revalidatePath("/audit")
    return { ok: true, data: { movementId: movementId.toHexString() } }
  } catch (err) {
    console.error("logReturn failed", err)
    return {
      ok: false,
      error: "Could not log return. Please try again.",
    }
  }
}
