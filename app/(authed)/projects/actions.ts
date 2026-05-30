"use server"

import { ObjectId } from "mongodb"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/session"
import {
  CreateProjectInputSchema,
  UpdateProjectInputSchema,
  ExpandProjectCapacityInputSchema,
  type ActionResult,
} from "@/lib/projects/schemas"
import { createProjectWithUnits } from "@/lib/projects/repository"
import client, { getDb } from "@/lib/db/client"
import { withUpdateMeta } from "@/lib/audit/update-meta"
import {
  generateApartmentNumbers,
  generateParkingNumbers,
} from "@/lib/projects/generation"

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

export async function expandProjectCapacity(
  raw: unknown
): Promise<ActionResult<void>> {
  const user = await requireAdmin()

  const parsed = ExpandProjectCapacityInputSchema.safeParse(raw)
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
  const projectId = new ObjectId(input.projectId)

  const session = client.startSession()
  try {
    // Sentinel error used to abort the transaction on validation failure so we
    // don't commit an empty-but-non-zero-overhead transaction, and so future
    // writes added above the guard can't accidentally commit alongside an
    // error outcome.
    class ExpandValidationError extends Error {
      constructor(public outcome: ActionResult<void>) {
        super("validation")
      }
    }
    await session.withTransaction(async () => {
      const db = client.db()
      const project = await db
        .collection("projects")
        .findOne({ _id: projectId }, { session })
      if (!project) {
        throw new ExpandValidationError({ ok: false, error: "Project not found" })
      }
      if (
        project.startingUnitNumber === undefined ||
        project.unitsPerFloor === undefined ||
        project.parkingPrefix === undefined
      ) {
        throw new ExpandValidationError({
          ok: false,
          error:
            "Project is missing numbering params. Run scripts/migrate-phase-10.mjs first.",
        })
      }

      const now = new Date()
      const createdBy = new ObjectId(user.id)
      const newUnitDocs: Record<string, unknown>[] = []

      // ── APARTMENT CONTINUATION ──
      // Reuses generateApartmentNumbers from lib/projects/generation.ts with
      // startOffset = project.totalUnits so that continuation unit numbers are
      // byte-identical to what createProject would have produced if totalUnits
      // had been higher at creation time. Keep the two in sync.
      if (input.additionalUnits > 0) {
        const apartments = generateApartmentNumbers({
          total: input.additionalUnits,
          startingUnitNumber: project.startingUnitNumber as number,
          unitsPerFloor: project.unitsPerFloor as number,
          startOffset: project.totalUnits ?? 0,
        })
        for (const apt of apartments) {
          newUnitDocs.push({
            projectId,
            type: "apartment",
            number: apt.number,
            floor: apt.floor,
            areaSqft: 0,
            salePrice: 0,
            status: "available",
            notes: "",
            createdBy,
            createdAt: now,
            updatedAt: now,
          })
        }
      }

      // ── PARKING CONTINUATION ──
      // Reuses generateParkingNumbers from lib/projects/generation.ts with
      // startFrom = project.totalParkings + 1 so continuation numbers pick up
      // where createProject left off (e.g. P001–P003 already exist → P004…).
      if (input.additionalParkings > 0) {
        const parkings = generateParkingNumbers({
          total: input.additionalParkings,
          prefix: project.parkingPrefix as string,
          startFrom: (project.totalParkings ?? 0) + 1,
        })
        for (const p of parkings) {
          newUnitDocs.push({
            projectId,
            type: "parking",
            number: p.number,
            floor: p.floor,
            areaSqft: 0,
            salePrice: 0,
            status: "available",
            notes: "",
            createdBy,
            createdAt: now,
            updatedAt: now,
          })
        }
      }

      if (newUnitDocs.length > 0) {
        await db.collection("units").insertMany(newUnitDocs, { session })
      }

      await db.collection("projects").findOneAndUpdate(
        { _id: projectId },
        {
          $inc: {
            totalUnits: input.additionalUnits,
            totalParkings: input.additionalParkings,
          },
          $set: withUpdateMeta({}, user.id),
        },
        { session }
      )
    })

    revalidatePath(`/projects/${input.projectId}`)
    revalidatePath(`/projects/${input.projectId}/inventory`)
    revalidatePath("/projects")
    revalidatePath("/audit")
    return { ok: true, data: undefined }
  } catch (e) {
    if (e instanceof Error && e.message === "validation") {
      // ExpandValidationError carries a structured outcome on `.outcome`.
      const maybeOutcome = (e as Error & { outcome?: ActionResult<void> }).outcome
      if (maybeOutcome) return maybeOutcome
    }
    console.error("[expandProjectCapacity]", e)
    return { ok: false, error: "Failed to expand project capacity" }
  } finally {
    await session.endSession()
  }
}
