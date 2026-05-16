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
    const { sourceRevId, destRevId } = await reverseMoneyTransfer(
      new ObjectId(transferGroupId),
      { occurredAt, notes },
      user.id
    )
    revalidatePath("/transfers")
    revalidatePath("/financials")
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
      const msg =
        err.reason === "is-voided"
          ? "A leg of this transfer is voided; cannot reverse."
          : "Only original transfers can be reversed (this row is itself a reversal)."
      return { ok: false, error: msg }
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
