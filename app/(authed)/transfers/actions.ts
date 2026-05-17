"use server"

import { ObjectId } from "mongodb"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/session"
import type { ActionResult } from "@/lib/projects/schemas"
import {
  CreateMoneyTransferInputSchema,
  ReverseTransferInputSchema,
} from "@/lib/transfers/schemas"
import {
  createMoneyTransfer,
  reverseMoneyTransfer,
  TransferNotFoundError,
  CannotReverseTransferError,
  AlreadyReversedError,
} from "@/lib/transactions/repository"
import { getProject } from "@/lib/projects/repository"
import { CreateMaterialTransferInputSchema } from "@/lib/transfers/schemas"
import {
  createMaterialTransfer,
  reverseMaterialTransfer,
  InsufficientStockError,
  InsufficientStockForReversalError,
  getMaterial,
} from "@/lib/materials/repository"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fieldError(parsed: { success: false; error: { issues?: any[] } }) {
  const first = parsed.error.issues?.[0]
  return {
    error: (first?.message as string | undefined) ?? "Invalid input",
    field: (
      first?.path
        ?.filter((p: unknown) => typeof p === "string" || typeof p === "number")
        .join(".") || undefined
    ) as string | undefined,
  }
}

export async function createMoneyTransferAction(
  raw: unknown
): Promise<
  ActionResult<{
    transferGroupId: string
    sourceTxId: string
    destTxId: string
  }>
> {
  const user = await requireAdmin()
  const parsed = CreateMoneyTransferInputSchema.safeParse(raw)
  if (!parsed.success) {
    const fe = fieldError(parsed)
    return { ok: false, error: fe.error, field: fe.field }
  }

  const { sourceProjectId, destProjectId, amount, occurredAt, description, notes } =
    parsed.data

  if (sourceProjectId === destProjectId) {
    return {
      ok: false,
      error: "Source and destination must be different projects.",
      field: "destProjectId",
    }
  }
  if (!ObjectId.isValid(sourceProjectId) || !ObjectId.isValid(destProjectId)) {
    return { ok: false, error: "Invalid project id." }
  }

  const sourceProject = await getProject(sourceProjectId)
  const destProject = await getProject(destProjectId)
  if (!sourceProject) {
    return { ok: false, error: "Source project not found.", field: "sourceProjectId" }
  }
  if (!destProject) {
    return { ok: false, error: "Destination project not found.", field: "destProjectId" }
  }

  try {
    const { transferGroupId, sourceTxId, destTxId } = await createMoneyTransfer(
      {
        sourceProjectId: new ObjectId(sourceProjectId),
        destProjectId: new ObjectId(destProjectId),
        amount,
        occurredAt,
        description,
        notes,
        sourceProjectName: sourceProject.name,
        destProjectName: destProject.name,
      },
      user.id
    )
    revalidatePath("/transfers")
    revalidatePath(`/projects/${sourceProjectId}`)
    revalidatePath(`/projects/${destProjectId}`)
    revalidatePath("/financials")
    revalidatePath("/audit")
    return {
      ok: true,
      data: {
        transferGroupId: transferGroupId.toHexString(),
        sourceTxId: sourceTxId.toHexString(),
        destTxId: destTxId.toHexString(),
      },
    }
  } catch (err) {
    console.error("createMoneyTransferAction failed", err)
    return {
      ok: false,
      error: "Could not create transfer. Please try again.",
    }
  }
}

export async function reverseMoneyTransferAction(
  raw: unknown
): Promise<ActionResult<{ sourceRevId: string; destRevId: string }>> {
  const user = await requireAdmin()
  const parsed = ReverseTransferInputSchema.safeParse(raw)
  if (!parsed.success) {
    const fe = fieldError(parsed)
    return { ok: false, error: fe.error, field: fe.field }
  }

  const { transferGroupId, occurredAt, notes } = parsed.data
  if (!ObjectId.isValid(transferGroupId)) {
    return { ok: false, error: "Invalid transfer id." }
  }

  try {
    const { sourceRevId, destRevId, sourceProjectId, destProjectId } = await reverseMoneyTransfer(
      new ObjectId(transferGroupId),
      { occurredAt, notes },
      user.id
    )
    revalidatePath("/transfers")
    revalidatePath("/financials")
    revalidatePath(`/projects/${sourceProjectId.toHexString()}`)
    revalidatePath(`/projects/${destProjectId.toHexString()}`)
    revalidatePath("/audit")
    return {
      ok: true,
      data: {
        sourceRevId: sourceRevId.toHexString(),
        destRevId: destRevId.toHexString(),
      },
    }
  } catch (err) {
    if (err instanceof AlreadyReversedError) {
      return { ok: false, error: "This transfer has already been reversed." }
    }
    if (err instanceof CannotReverseTransferError) {
      return {
        ok: false,
        error: "A leg of this transfer is voided; cannot reverse.",
      }
    }
    if (err instanceof TransferNotFoundError) {
      return { ok: false, error: "Transfer not found." }
    }
    console.error("reverseMoneyTransferAction failed", err)
    return {
      ok: false,
      error: "Could not reverse transfer. Please try again.",
    }
  }
}

export async function createMaterialTransferAction(
  raw: unknown
): Promise<
  ActionResult<{
    transferGroupId: string
    sourceMovId: string
    destMovId: string
    sourceRemainingStock: number
  }>
> {
  const user = await requireAdmin()
  const parsed = CreateMaterialTransferInputSchema.safeParse(raw)
  if (!parsed.success) {
    const fe = fieldError(parsed)
    return { ok: false, error: fe.error, field: fe.field }
  }

  const { sourceProjectId, destProjectId, materialId, qty, occurredAt, notes } =
    parsed.data

  if (sourceProjectId === destProjectId) {
    return {
      ok: false,
      error: "Source and destination must be different projects.",
      field: "destProjectId",
    }
  }
  if (
    !ObjectId.isValid(sourceProjectId) ||
    !ObjectId.isValid(destProjectId) ||
    !ObjectId.isValid(materialId)
  ) {
    return { ok: false, error: "Invalid id in input." }
  }

  const sourceProject = await getProject(sourceProjectId)
  const destProject = await getProject(destProjectId)
  const material = await getMaterial(materialId)
  if (!sourceProject) {
    return { ok: false, error: "Source project not found.", field: "sourceProjectId" }
  }
  if (!destProject) {
    return { ok: false, error: "Destination project not found.", field: "destProjectId" }
  }
  if (!material) {
    return { ok: false, error: "Material not found.", field: "materialId" }
  }

  try {
    const result = await createMaterialTransfer(
      {
        sourceProjectId: new ObjectId(sourceProjectId),
        destProjectId: new ObjectId(destProjectId),
        materialId: new ObjectId(materialId),
        qty,
        occurredAt,
        notes,
        sourceProjectName: sourceProject.name,
        destProjectName: destProject.name,
        materialName: material.name,
      },
      user.id
    )
    revalidatePath("/transfers")
    revalidatePath(`/projects/${sourceProjectId}`)
    revalidatePath(`/projects/${destProjectId}`)
    revalidatePath("/audit")
    return {
      ok: true,
      data: {
        transferGroupId: result.transferGroupId.toHexString(),
        sourceMovId: result.sourceMovId.toHexString(),
        destMovId: result.destMovId.toHexString(),
        sourceRemainingStock: result.sourceRemainingStock,
      },
    }
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      return {
        ok: false,
        error: `Insufficient stock — only ${err.available} available.`,
        field: "qty",
      }
    }
    console.error("createMaterialTransferAction failed", err)
    return {
      ok: false,
      error: "Could not create material transfer. Please try again.",
    }
  }
}

export async function reverseMaterialTransferAction(
  raw: unknown
): Promise<ActionResult<{ sourceRevId: string; destRevId: string }>> {
  const user = await requireAdmin()
  const parsed = ReverseTransferInputSchema.safeParse(raw)
  if (!parsed.success) {
    const fe = fieldError(parsed)
    return { ok: false, error: fe.error, field: fe.field }
  }

  const { transferGroupId, occurredAt, notes } = parsed.data
  if (!ObjectId.isValid(transferGroupId)) {
    return { ok: false, error: "Invalid transfer id." }
  }

  try {
    const { sourceRevId, destRevId, sourceProjectId, destProjectId } = await reverseMaterialTransfer(
      new ObjectId(transferGroupId),
      { occurredAt, notes },
      user.id
    )
    revalidatePath("/transfers")
    revalidatePath(`/projects/${sourceProjectId.toHexString()}`)
    revalidatePath(`/projects/${destProjectId.toHexString()}`)
    revalidatePath("/audit")
    return {
      ok: true,
      data: {
        sourceRevId: sourceRevId.toHexString(),
        destRevId: destRevId.toHexString(),
      },
    }
  } catch (err) {
    if (err instanceof InsufficientStockForReversalError) {
      return {
        ok: false,
        error: `Cannot reverse: ${err.projectName} only has ${err.available} remaining.`,
        field: "transferGroupId",
      }
    }
    if (err instanceof AlreadyReversedError) {
      return { ok: false, error: "This transfer has already been reversed." }
    }
    if (err instanceof CannotReverseTransferError) {
      return {
        ok: false,
        error: "A leg of this transfer is voided; cannot reverse.",
      }
    }
    if (err instanceof TransferNotFoundError) {
      return { ok: false, error: "Transfer not found." }
    }
    console.error("reverseMaterialTransferAction failed", err)
    return {
      ok: false,
      error: "Could not reverse material transfer. Please try again.",
    }
  }
}
