"use server"

import { ObjectId } from "mongodb"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/session"
import type { ActionResult } from "@/lib/projects/schemas"
import { EditUnitInputSchema } from "@/lib/projects/schemas"
import {
  MarkUnitSoldInputSchema,
  UnmarkUnitSoldInputSchema,
} from "@/lib/transactions/schemas"
import { getDb } from "@/lib/db/client"
import { withUpdateMeta } from "@/lib/audit/update-meta"
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
    revalidatePath("/audit")
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
    revalidatePath("/audit")
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

export async function editUnit(
  raw: unknown
): Promise<ActionResult<void>> {
  const user = await requireAdmin()

  const parsed = EditUnitInputSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? "Invalid input",
      field: issue?.path?.[0]?.toString(),
    }
  }
  const input = parsed.data

  if (!ObjectId.isValid(input.unitId)) {
    return { ok: false, error: "Invalid unit id" }
  }
  const unitId = new ObjectId(input.unitId)

  try {
    const db = getDb()
    const unit = await db.collection<{ _id: ObjectId; projectId: ObjectId; number: string; status: "available" | "sold" }>("units").findOne({ _id: unitId })
    if (!unit) {
      return { ok: false, error: "Unit not found" }
    }

    // Block salePrice edits on sold units.
    if (input.salePrice !== undefined && unit.status === "sold") {
      return {
        ok: false,
        error: "Cannot change list price of a sold unit",
        field: "salePrice",
      }
    }

    // Pre-write uniqueness check for `number` within the same project.
    // Race-acceptable: admin-only, low edit volume.
    if (input.number !== undefined && input.number !== unit.number) {
      const collision = await db.collection("units").findOne({
        projectId: unit.projectId,
        number: input.number,
        _id: { $ne: unitId },
      })
      if (collision) {
        return {
          ok: false,
          error: `Number "${input.number}" already used in this project`,
          field: "number",
        }
      }
    }

    const set: Record<string, unknown> = {}
    if (input.number !== undefined) set.number = input.number
    if (input.floor !== undefined) set.floor = input.floor
    if (input.areaSqft !== undefined) set.areaSqft = input.areaSqft
    if (input.salePrice !== undefined) set.salePrice = input.salePrice
    if (input.notes !== undefined) set.notes = input.notes

    await db.collection("units").findOneAndUpdate(
      { _id: unitId },
      { $set: withUpdateMeta(set, user.id) }
    )

    const projectIdHex = unit.projectId.toHexString()
    revalidatePath(`/projects/${projectIdHex}`)
    revalidatePath(`/projects/${projectIdHex}/inventory`)
    revalidatePath("/audit")
    return { ok: true, data: undefined }
  } catch (e) {
    console.error("[editUnit]", e)
    return { ok: false, error: "Failed to update unit" }
  }
}
