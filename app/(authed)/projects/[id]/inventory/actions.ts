"use server"

import { ObjectId } from "mongodb"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/session"
import type { ActionResult } from "@/lib/projects/schemas"
import {
  MarkUnitSoldInputSchema,
  UnmarkUnitSoldInputSchema,
} from "@/lib/transactions/schemas"
import {
  markUnitSold as markUnitSoldRepo,
  unmarkUnitSold as unmarkUnitSoldRepo,
  UnitNotAvailableError,
  UnitNotSoldError,
} from "@/lib/transactions/repository"

export async function markUnitSold(
  raw: unknown
): Promise<ActionResult<{ transactionId: string }>> {
  const user = await requireAdmin()
  const parsed = MarkUnitSoldInputSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      error: first?.message ?? "Invalid input",
      field: first?.path.join(".") || undefined,
    }
  }

  const { projectId, unitId, salePrice, buyerName, saleDate, description, notes } =
    parsed.data

  if (!ObjectId.isValid(projectId) || !ObjectId.isValid(unitId)) {
    return { ok: false, error: "Invalid project or unit id." }
  }

  try {
    const { transactionId } = await markUnitSoldRepo(
      {
        projectId: new ObjectId(projectId),
        unitId: new ObjectId(unitId),
        salePrice,
        buyerName,
        saleDate,
        description,
        notes,
      },
      user.id
    )
    revalidatePath(`/projects/${projectId}`)
    return { ok: true, data: { transactionId: transactionId.toHexString() } }
  } catch (err) {
    if (err instanceof UnitNotAvailableError) {
      return { ok: false, error: err.message }
    }
    console.error("markUnitSold failed", err)
    return {
      ok: false,
      error: "Could not record sale. Please try again.",
    }
  }
}

export async function unmarkUnitSold(
  raw: unknown
): Promise<ActionResult<{ warningMissingLedgerRow: boolean }>> {
  const user = await requireAdmin()
  const parsed = UnmarkUnitSoldInputSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: "Invalid input" }
  }

  const { unitId } = parsed.data
  if (!ObjectId.isValid(unitId)) {
    return { ok: false, error: "Invalid unit id." }
  }

  try {
    const { ledgerRowVoided } = await unmarkUnitSoldRepo(
      new ObjectId(unitId),
      user.id
    )
    if (!ledgerRowVoided) {
      console.warn(
        "unmarkUnitSold: no active ledger row for unit",
        unitId
      )
    }
    // revalidatePath needs the project id, which the action's caller doesn't
    // pass. revalidate the whole projects tree — cheap and safe for v1.
    revalidatePath("/projects", "layout")
    return {
      ok: true,
      data: { warningMissingLedgerRow: !ledgerRowVoided },
    }
  } catch (err) {
    if (err instanceof UnitNotSoldError) {
      return { ok: false, error: err.message }
    }
    console.error("unmarkUnitSold failed", err)
    return {
      ok: false,
      error: "Could not unmark sale. Please try again.",
    }
  }
}
