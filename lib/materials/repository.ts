import { ObjectId } from "mongodb"
import client, { getDb } from "@/lib/db/client"
import { withUpdateMeta } from "@/lib/audit/update-meta"
import type { Transaction } from "@/lib/transactions/schemas"
import {
  TransferNotFoundError,
  CannotReverseTransferError,
  AlreadyReversedError,
} from "@/lib/transactions/repository"
import type { Paginated } from "@/lib/transactions/repository"
import type { MaterialTransferRow } from "@/lib/transfers/schemas"
import type { Project } from "@/lib/projects/schemas"
import type {
  CreateMaterialInput,
  Material,
  MaterialMovement,
  ProjectMaterial,
  UpdateMaterialInput,
} from "./schemas"

// ---- Catalog reads ---------------------------------------------------------

export async function listCatalog(): Promise<Material[]> {
  const db = getDb()
  return db
    .collection<Material>("materials")
    .find({})
    .collation({ locale: "en", strength: 2 })
    .sort({ name: 1 })
    .toArray()
}

export async function getMaterial(id: string): Promise<Material | null> {
  if (!ObjectId.isValid(id)) return null
  const db = getDb()
  return db
    .collection<Material>("materials")
    .findOne({ _id: new ObjectId(id) })
}

export async function materialHasMovements(materialId: ObjectId): Promise<boolean> {
  const db = getDb()
  const hit = await db
    .collection<MaterialMovement>("materialMovements")
    .findOne({ materialId }, { projection: { _id: 1 } })
  return hit !== null
}

// ---- Catalog writes --------------------------------------------------------

/**
 * Create a new catalog entry. Both roles may call; the SERVER ACTION layer is
 * responsible for stripping `unitPrice` from FM submissions before invoking
 * this. Repository assumes input is already role-scrubbed.
 */
export async function createMaterial(
  input: CreateMaterialInput,
  userId: string
): Promise<{ materialId: ObjectId }> {
  const createdBy = new ObjectId(userId)
  const db = getDb()
  const now = new Date()
  const doc: Omit<Material, "_id"> = {
    name: input.name,
    unit: input.unit,
    unitOther: input.unit === "other" ? input.unitOther : undefined,
    unitPrice: input.unitPrice ?? null,
    notes: input.notes,
    createdBy,
    createdAt: now,
    updatedAt: now,
  }
  const res = await db
    .collection<Omit<Material, "_id">>("materials")
    .insertOne(doc)
  return { materialId: res.insertedId }
}

/**
 * Update an existing catalog entry. Admin-only at the action layer.
 *
 * Unit-change guard: if `unit` or `unitOther` change and the material already
 * has movements, throw UnitChangeAfterMovementsError. Historical movements
 * store qty but not unit; changing the catalog unit would silently change
 * their meaning.
 *
 * Race note: the guard is a read-then-write without a session-wide lock. A
 * movement inserted between the check and the update will succeed and the
 * unit change will also succeed — leaving exactly one anomalous movement.
 * Acceptable for v1 (admin-only path, rare operation, manual coordination).
 */
export async function updateMaterial(
  input: UpdateMaterialInput,
  userId: string
): Promise<{ matchedCount: number }> {
  if (!ObjectId.isValid(input.materialId)) {
    throw new MaterialNotFoundError("Invalid material id")
  }
  const materialId = new ObjectId(input.materialId)
  const db = getDb()

  const changesUnit =
    input.unit !== undefined || input.unitOther !== undefined
  if (changesUnit) {
    const blocked = await materialHasMovements(materialId)
    if (blocked) {
      throw new UnitChangeAfterMovementsError(
        "Cannot change unit after movements exist for this material."
      )
    }
  }

  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.unit !== undefined) patch.unit = input.unit
  if (input.unit === "other" && input.unitOther !== undefined) {
    patch.unitOther = input.unitOther
  } else if (input.unit !== undefined && input.unit !== "other") {
    patch.unitOther = ""
  }
  if (input.unitPrice !== undefined) patch.unitPrice = input.unitPrice
  if (input.notes !== undefined) patch.notes = input.notes

  const res = await db
    .collection<Material>("materials")
    .updateOne({ _id: materialId }, { $set: withUpdateMeta(patch, userId) })
  return { matchedCount: res.matchedCount }
}

// ---- Per-project stock reads ----------------------------------------------

export type ProjectMaterialListing = {
  projectMaterial: ProjectMaterial | null   // null if no movements yet
  material: Material
  totalSpent: number                        // 0 for FM (caller can strip)
  lastMovementAt: Date | null
}

export async function listProjectMaterials(
  projectId: ObjectId
): Promise<ProjectMaterialListing[]> {
  const db = getDb()
  const pms = await db
    .collection<ProjectMaterial>("projectMaterials")
    .find({ projectId })
    .toArray()

  if (pms.length === 0) return []

  const materialIds = pms.map((pm) => pm.materialId)
  const materials = await db
    .collection<Material>("materials")
    .find({ _id: { $in: materialIds } })
    .toArray()
  const materialsById = new Map(materials.map((m) => [String(m._id), m]))

  // Per-material aggregates: total spent (sum of non-voided purchase amounts)
  // and last movement date.
  const aggregates = await db
    .collection<MaterialMovement>("materialMovements")
    .aggregate<{
      _id: ObjectId
      totalSpent: number
      lastAt: Date
    }>([
      {
        $match: {
          projectId,
          materialId: { $in: materialIds },
          voided: { $ne: true },
        },
      },
      {
        $group: {
          _id: "$materialId",
          totalSpent: {
            $sum: {
              $cond: [
                { $eq: ["$category", "purchase"] },
                { $ifNull: ["$amount", 0] },
                0,
              ],
            },
          },
          lastAt: { $max: "$occurredAt" },
        },
      },
    ])
    .toArray()
  const aggsById = new Map(aggregates.map((a) => [String(a._id), a]))

  return pms.flatMap((pm) => {
    const material = materialsById.get(String(pm.materialId))
    if (!material) return [] // catalog row deleted (shouldn't happen in Phase 4)
    const agg = aggsById.get(String(pm.materialId))
    return [{
      projectMaterial: pm,
      material,
      totalSpent: agg?.totalSpent ?? 0,
      lastMovementAt: agg?.lastAt ?? null,
    }]
  })
}

export async function listMovementsForMaterial(
  projectId: ObjectId,
  materialId: ObjectId
): Promise<MaterialMovement[]> {
  const db = getDb()
  return db
    .collection<MaterialMovement>("materialMovements")
    .find({ projectId, materialId })
    .sort({ occurredAt: -1, createdAt: -1 })
    .toArray()
}

/**
 * Paginated version of listMovementsForMaterial. Used by the movements sheet's
 * client-side pagination via /api/movements.
 */
export async function listMovements(
  projectId: ObjectId,
  materialId: ObjectId,
  page: number,
  pageSize: number,
): Promise<Paginated<MaterialMovement>> {
  const db = getDb()
  const coll = db.collection<MaterialMovement>("materialMovements")
  const query = { projectId, materialId }
  const skip = (page - 1) * pageSize
  const [rows, total] = await Promise.all([
    coll.find(query).sort({ occurredAt: -1, createdAt: -1 }).skip(skip).limit(pageSize).toArray(),
    coll.countDocuments(query),
  ])
  return { rows, total }
}

// ---- Movement writes -------------------------------------------------------

/**
 * Admin-only at the action layer. Atomically:
 *   1. Upsert projectMaterials with $inc stockOnHand += qty
 *   2. Insert one transactions row (kind: expense, category: purchase)
 *   3. Insert one materialMovements row (kind: in, category: purchase) with
 *      transactionId pointing at the row from step 2
 *
 * amount on the transactions row is rounded to whole rupees to preserve the
 * Phase 3 int() invariant. unitPriceAtMovement on the movement row is the
 * un-rounded decimal — the historical record.
 */
export async function recordPurchase(
  input: {
    projectId: ObjectId
    materialId: ObjectId
    qty: number
    unitPriceAtMovement: number
    occurredAt: Date
    notes: string
    materialName: string
  },
  userId: string
): Promise<{ transactionId: ObjectId; movementId: ObjectId }> {
  const createdBy = new ObjectId(userId)
  const amount = Math.round(input.qty * input.unitPriceAtMovement)
  const session = client.startSession()
  try {
    let transactionId!: ObjectId
    let movementId!: ObjectId
    await session.withTransaction(async () => {
      const db = getDb()
      const pms = db.collection<ProjectMaterial>("projectMaterials")
      const txns = db.collection<Omit<Transaction, "_id">>("transactions")
      const movs = db.collection<Omit<MaterialMovement, "_id">>("materialMovements")
      const now = new Date()

      await pms.updateOne(
        { projectId: input.projectId, materialId: input.materialId },
        {
          $inc: { stockOnHand: input.qty },
          $set: { updatedAt: now },
          $setOnInsert: {
            projectId: input.projectId,
            materialId: input.materialId,
            createdAt: now,
          },
        },
        { session, upsert: true }
      )

      const txDoc: Omit<Transaction, "_id"> = {
        projectId: input.projectId,
        unitId: null,
        kind: "expense",
        category: "purchase",
        amount,
        currency: "INR",
        description: `Purchase: ${input.materialName}`,
        occurredAt: input.occurredAt,
        notes: input.notes,
        createdBy,
        createdAt: now,
      }
      const txRes = await txns.insertOne(txDoc, { session })
      transactionId = txRes.insertedId

      const movDoc: Omit<MaterialMovement, "_id"> = {
        projectId: input.projectId,
        materialId: input.materialId,
        kind: "in",
        category: "purchase",
        qty: input.qty,
        unitPriceAtMovement: input.unitPriceAtMovement,
        amount,
        notes: input.notes,
        transactionId,
        occurredAt: input.occurredAt,
        createdBy,
        createdAt: now,
      }
      const movRes = await movs.insertOne(movDoc, { session })
      movementId = movRes.insertedId
    })
    return { transactionId, movementId }
  } finally {
    await session.endSession()
  }
}

/**
 * Both roles at the action layer. Race-safe atomic decrement: conditional
 * findOneAndUpdate matches only if stockOnHand >= qty. If the match fails,
 * we read the current stock (or 0 if no projectMaterials row exists) and
 * throw InsufficientStockError so the action layer can surface a clean
 * "Only N available" message.
 */
export async function logConsumption(
  input: {
    projectId: ObjectId
    materialId: ObjectId
    qty: number
    purpose: string
    occurredAt: Date
    notes: string
  },
  userId: string
): Promise<{ movementId: ObjectId; remainingStock: number }> {
  const createdBy = new ObjectId(userId)
  const session = client.startSession()
  try {
    let movementId!: ObjectId
    let remainingStock = 0
    await session.withTransaction(async () => {
      const db = getDb()
      const pms = db.collection<ProjectMaterial>("projectMaterials")
      const movs = db.collection<Omit<MaterialMovement, "_id">>("materialMovements")
      const now = new Date()

      const decremented = await pms.findOneAndUpdate(
        {
          projectId: input.projectId,
          materialId: input.materialId,
          stockOnHand: { $gte: input.qty },
        },
        {
          $inc: { stockOnHand: -input.qty },
          $set: { updatedAt: now },
        },
        { session, returnDocument: "after" }
      )

      if (!decremented) {
        const current = await pms.findOne(
          { projectId: input.projectId, materialId: input.materialId },
          { session }
        )
        const available = current?.stockOnHand ?? 0
        throw new InsufficientStockError(available)
      }
      remainingStock = decremented.stockOnHand

      const movDoc: Omit<MaterialMovement, "_id"> = {
        projectId: input.projectId,
        materialId: input.materialId,
        kind: "out",
        category: "consumption",
        qty: input.qty,
        purpose: input.purpose,
        notes: input.notes,
        occurredAt: input.occurredAt,
        createdBy,
        createdAt: now,
      }
      const movRes = await movs.insertOne(movDoc, { session })
      movementId = movRes.insertedId
    })
    return { movementId, remainingStock }
  } finally {
    await session.endSession()
  }
}

/**
 * Both roles at the action layer. Atomic increment via upsert; tolerates
 * returns recorded before any matching purchase (real-world data is messy).
 * No ledger write — returns are not a cash event.
 */
export async function logReturn(
  input: {
    projectId: ObjectId
    materialId: ObjectId
    qty: number
    purpose: string
    occurredAt: Date
    notes: string
  },
  userId: string
): Promise<{ movementId: ObjectId }> {
  const createdBy = new ObjectId(userId)
  const session = client.startSession()
  try {
    let movementId!: ObjectId
    await session.withTransaction(async () => {
      const db = getDb()
      const pms = db.collection<ProjectMaterial>("projectMaterials")
      const movs = db.collection<Omit<MaterialMovement, "_id">>("materialMovements")
      const now = new Date()

      await pms.updateOne(
        { projectId: input.projectId, materialId: input.materialId },
        {
          $inc: { stockOnHand: input.qty },
          $set: { updatedAt: now },
          $setOnInsert: {
            projectId: input.projectId,
            materialId: input.materialId,
            createdAt: now,
          },
        },
        { session, upsert: true }
      )

      const movDoc: Omit<MaterialMovement, "_id"> = {
        projectId: input.projectId,
        materialId: input.materialId,
        kind: "in",
        category: "return",
        qty: input.qty,
        purpose: input.purpose || undefined,
        notes: input.notes,
        occurredAt: input.occurredAt,
        createdBy,
        createdAt: now,
      }
      const movRes = await movs.insertOne(movDoc, { session })
      movementId = movRes.insertedId
    })
    return { movementId }
  } finally {
    await session.endSession()
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Phase 6 — material transfers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Atomically transfer material stock between two projects.
 *
 *   source: kind="out", category="transfer_out"  + stock decrement (race-safe)
 *   dest:   kind="in",  category="transfer_in"   + stock upsert/increment
 *
 * Both movement rows share a fresh `transferGroupId`. Project + material names
 * are denormalized into description strings by the caller.
 *
 * Same-project guard is the action layer's responsibility.
 *
 * Throws InsufficientStockError if source `stockOnHand < qty`.
 *
 * No ledger write — material movements are not cash events (Phase 4 precedent).
 */
export async function createMaterialTransfer(
  input: {
    sourceProjectId: ObjectId
    destProjectId: ObjectId
    materialId: ObjectId
    qty: number
    occurredAt: Date
    notes: string
    sourceProjectName: string
    destProjectName: string
    materialName: string
  },
  userId: string
): Promise<{
  transferGroupId: ObjectId
  sourceMovId: ObjectId
  destMovId: ObjectId
  sourceRemainingStock: number
}> {
  const createdBy = new ObjectId(userId)
  const transferGroupId = new ObjectId()
  const session = client.startSession()
  try {
    let sourceMovId!: ObjectId
    let destMovId!: ObjectId
    let sourceRemainingStock = 0
    await session.withTransaction(async () => {
      const db = getDb()
      const pms = db.collection<ProjectMaterial>("projectMaterials")
      const movs = db.collection<Omit<MaterialMovement, "_id">>("materialMovements")
      const now = new Date()

      // Source: conditional decrement (race-safe, same as logConsumption)
      const decremented = await pms.findOneAndUpdate(
        {
          projectId: input.sourceProjectId,
          materialId: input.materialId,
          stockOnHand: { $gte: input.qty },
        },
        {
          $inc: { stockOnHand: -input.qty },
          $set: { updatedAt: now },
        },
        { session, returnDocument: "after" }
      )
      if (!decremented) {
        const current = await pms.findOne(
          {
            projectId: input.sourceProjectId,
            materialId: input.materialId,
          },
          { session }
        )
        const available = current?.stockOnHand ?? 0
        throw new InsufficientStockError(available)
      }
      sourceRemainingStock = decremented.stockOnHand

      // Destination: unconditional upsert/increment (same pattern as recordPurchase)
      await pms.updateOne(
        { projectId: input.destProjectId, materialId: input.materialId },
        {
          $inc: { stockOnHand: input.qty },
          $set: { updatedAt: now },
          $setOnInsert: {
            projectId: input.destProjectId,
            materialId: input.materialId,
            createdAt: now,
          },
        },
        { session, upsert: true }
      )

      const sourceMovDoc: Omit<MaterialMovement, "_id"> = {
        projectId: input.sourceProjectId,
        materialId: input.materialId,
        kind: "out",
        category: "transfer_out",
        qty: input.qty,
        notes: input.notes || undefined,
        transferGroupId,
        occurredAt: input.occurredAt,
        createdBy,
        createdAt: now,
      }
      const sourceRes = await movs.insertOne(sourceMovDoc, { session })
      sourceMovId = sourceRes.insertedId

      const destMovDoc: Omit<MaterialMovement, "_id"> = {
        projectId: input.destProjectId,
        materialId: input.materialId,
        kind: "in",
        category: "transfer_in",
        qty: input.qty,
        notes: input.notes || undefined,
        transferGroupId,
        occurredAt: input.occurredAt,
        createdBy,
        createdAt: now,
      }
      const destRes = await movs.insertOne(destMovDoc, { session })
      destMovId = destRes.insertedId
    })
    return { transferGroupId, sourceMovId, destMovId, sourceRemainingStock }
  } finally {
    await session.endSession()
  }
}

/**
 * Reverse a material transfer atomically:
 *   - Source project: stockOnHand += qty (unconditional upsert, can't fail)
 *   - Destination project: stockOnHand -= qty (race-safe conditional; throws
 *     InsufficientStockForReversalError if dest has consumed/transferred-out
 *     stock since the original transfer)
 *   - Insert two new materialMovements rows (reversal pair) sharing the same
 *     transferGroupId as the original pair, each with reversalOf pointing at
 *     its corresponding original leg.
 *
 * Inside withTransaction the same already-reversed guard pattern from
 * reverseMoneyTransfer applies: any existing row with reversalOf pointing at
 * either leg → AlreadyReversedError.
 */
export async function reverseMaterialTransfer(
  transferGroupId: ObjectId,
  override: { occurredAt?: Date; notes?: string },
  userId: string
): Promise<{
  sourceRevId: ObjectId
  destRevId: ObjectId
  sourceProjectId: ObjectId
  destProjectId: ObjectId
}> {
  const createdBy = new ObjectId(userId)
  const session = client.startSession()
  try {
    let sourceRevId!: ObjectId
    let destRevId!: ObjectId
    let sourceProjectId: ObjectId | null = null
    let destProjectId: ObjectId | null = null
    await session.withTransaction(async () => {
      const db = getDb()
      const movs = db.collection<MaterialMovement>("materialMovements")
      const insertColl = db.collection<Omit<MaterialMovement, "_id">>("materialMovements")
      const pms = db.collection<ProjectMaterial>("projectMaterials")

      const legs = await movs.find({ transferGroupId }, { session }).toArray()
      const originals = legs.filter((l) => !l.reversalOf)
      if (originals.length !== 2) {
        throw new TransferNotFoundError(
          "Material transfer not found or not a valid pair of originals."
        )
      }

      const sourceLeg = originals.find((l) => l.category === "transfer_out")
      const destLeg = originals.find((l) => l.category === "transfer_in")
      if (!sourceLeg || !destLeg) {
        throw new TransferNotFoundError(
          "Material transfer group missing expected source or destination leg."
        )
      }

      sourceProjectId = sourceLeg.projectId
      destProjectId = destLeg.projectId

      if (sourceLeg.voided === true || destLeg.voided === true) {
        throw new CannotReverseTransferError("is-voided")
      }

      const existingReversal = await movs.findOne(
        { reversalOf: { $in: [sourceLeg._id, destLeg._id] } },
        { session }
      )
      if (existingReversal) {
        throw new AlreadyReversedError(
          "This material transfer has already been reversed."
        )
      }

      const qty = sourceLeg.qty
      const now = new Date()
      const occurredAt = override.occurredAt ?? now
      const notes = override.notes || undefined

      // Source: restore stock (unconditional upsert; can't fail).
      await pms.updateOne(
        { projectId: sourceLeg.projectId, materialId: sourceLeg.materialId },
        {
          $inc: { stockOnHand: qty },
          $set: { updatedAt: now },
          $setOnInsert: {
            projectId: sourceLeg.projectId,
            materialId: sourceLeg.materialId,
            createdAt: now,
          },
        },
        { session, upsert: true }
      )

      // Destination: conditional decrement (can fail if stock was used since).
      const destDecremented = await pms.findOneAndUpdate(
        {
          projectId: destLeg.projectId,
          materialId: destLeg.materialId,
          stockOnHand: { $gte: qty },
        },
        {
          $inc: { stockOnHand: -qty },
          $set: { updatedAt: now },
        },
        { session, returnDocument: "after" }
      )
      if (!destDecremented) {
        const current = await pms.findOne(
          { projectId: destLeg.projectId, materialId: destLeg.materialId },
          { session }
        )
        const available = current?.stockOnHand ?? 0
        const destProject = await db
          .collection<{ _id: ObjectId; name: string }>("projects")
          .findOne({ _id: destLeg.projectId }, { session })
        throw new InsufficientStockForReversalError(
          available,
          destLeg.projectId,
          destProject?.name ?? "(unknown project)"
        )
      }

      const sourceRevDoc: Omit<MaterialMovement, "_id"> = {
        projectId: sourceLeg.projectId,
        materialId: sourceLeg.materialId,
        kind: "in",
        category: "transfer_in",
        qty,
        notes,
        reversalOf: sourceLeg._id,
        transferGroupId,
        occurredAt,
        createdBy,
        createdAt: now,
      }
      const sourceRes = await insertColl.insertOne(sourceRevDoc, { session })
      sourceRevId = sourceRes.insertedId

      const destRevDoc: Omit<MaterialMovement, "_id"> = {
        projectId: destLeg.projectId,
        materialId: destLeg.materialId,
        kind: "out",
        category: "transfer_out",
        qty,
        notes,
        reversalOf: destLeg._id,
        transferGroupId,
        occurredAt,
        createdBy,
        createdAt: now,
      }
      const destRes = await insertColl.insertOne(destRevDoc, { session })
      destRevId = destRes.insertedId
    })
    if (!sourceProjectId || !destProjectId) {
      throw new TransferNotFoundError("Material transfer group missing project IDs.")
    }
    return { sourceRevId, destRevId, sourceProjectId, destProjectId }
  } finally {
    await session.endSession()
  }
}

// ---- Errors ----------------------------------------------------------------

export class InsufficientStockError extends Error {
  readonly available: number
  constructor(available: number) {
    super(`Insufficient stock (only ${available} available)`)
    this.name = "InsufficientStockError"
    this.available = available
  }
}

export class UnitChangeAfterMovementsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UnitChangeAfterMovementsError"
  }
}

export class MaterialNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MaterialNotFoundError"
  }
}

export class InsufficientStockForReversalError extends Error {
  readonly available: number
  readonly projectId: ObjectId
  readonly projectName: string
  constructor(available: number, projectId: ObjectId, projectName: string) {
    super(
      `Insufficient stock in ${projectName} for reversal (only ${available} available)`
    )
    this.name = "InsufficientStockForReversalError"
    this.available = available
    this.projectId = projectId
    this.projectName = projectName
  }
}

/**
 * List material transfers across all projects within a date range, paginated.
 *
 * Same shape as listMoneyTransfers but on the materialMovements collection.
 * One row per transferGroupId; status reflects whether the group has any
 * reversal legs. Date range matches against any original leg's occurredAt.
 *
 * Results are paginated at the aggregation level for performance.
 */
export async function listMaterialTransfers(
  range: { from: Date; to: Date },
  page: number,
  pageSize: number,
): Promise<Paginated<MaterialTransferRow>> {
  const db = getDb()
  const fromDate = new Date(range.from)
  const toDate = new Date(range.to)
  toDate.setHours(23, 59, 59, 999)
  const skip = (page - 1) * pageSize

  type CandFacet = {
    rows: Array<{
      _id: ObjectId
      transferGroupId: ObjectId
      occurredAt: Date
    }>
    total: { n: number }[]
  }
  const candFacets = await db
    .collection<MaterialMovement>("materialMovements")
    .aggregate<CandFacet>([
      {
        $match: {
          transferGroupId: { $exists: true },
          category: "transfer_out",
          occurredAt: { $gte: fromDate, $lte: toDate },
          reversalOf: { $exists: false },
        },
      },
      { $sort: { occurredAt: -1, _id: -1 } },
      {
        $facet: {
          rows: [
            { $skip: skip },
            { $limit: pageSize },
            { $project: { _id: 1, transferGroupId: 1, occurredAt: 1 } },
          ],
          total: [{ $count: "n" }],
        },
      },
    ])
    .toArray()
  const facet = candFacets[0]
  const sourceLegs = facet?.rows ?? []
  const total = facet?.total[0]?.n ?? 0
  if (sourceLegs.length === 0) return { rows: [], total }

  const groupIds = sourceLegs.map((s) => s.transferGroupId)
  const allRows = await db
    .collection<MaterialMovement>("materialMovements")
    .find({ transferGroupId: { $in: groupIds } })
    .toArray()

  const byGroup = new Map<string, MaterialMovement[]>()
  for (const row of allRows) {
    const key = row.transferGroupId!.toHexString()
    const bucket = byGroup.get(key) ?? []
    bucket.push(row)
    byGroup.set(key, bucket)
  }

  const projectIds = new Set<string>()
  const materialIds = new Set<string>()
  const userIds = new Set<string>()
  for (const row of allRows) {
    projectIds.add(row.projectId.toHexString())
    materialIds.add(row.materialId.toHexString())
    userIds.add(row.createdBy.toHexString())
  }
  const projectsList = await db
    .collection<Project>("projects")
    .find({ _id: { $in: [...projectIds].map((id) => new ObjectId(id)) } })
    .project<{ _id: ObjectId; name: string }>({ name: 1 })
    .toArray()
  const projectNameById = new Map(
    projectsList.map((p) => [p._id.toHexString(), p.name]),
  )
  const materialsList = await db
    .collection<Material>("materials")
    .find({ _id: { $in: [...materialIds].map((id) => new ObjectId(id)) } })
    .toArray()
  const materialById = new Map(
    materialsList.map((m) => [m._id.toHexString(), m]),
  )
  const usersList = await db
    .collection<{ _id: ObjectId; name?: string; email?: string }>("users")
    .find({ _id: { $in: [...userIds].map((id) => new ObjectId(id)) } })
    .project<{ _id: ObjectId; name?: string; email?: string }>({ name: 1, email: 1 })
    .toArray()
  const userNameById = new Map(
    usersList.map((u) => [u._id.toHexString(), u.name ?? u.email ?? null]),
  )

  const rows: MaterialTransferRow[] = []
  for (const source of sourceLegs) {
    const groupKey = source.transferGroupId.toHexString()
    const legs = byGroup.get(groupKey)
    if (!legs) continue
    const originals = legs.filter((r) => !r.reversalOf)
    const reversals = legs.filter((r) => r.reversalOf)
    const sourceLeg = originals.find((r) => r.category === "transfer_out")
    const destLeg = originals.find((r) => r.category === "transfer_in")
    if (!sourceLeg || !destLeg) continue

    const material = materialById.get(sourceLeg.materialId.toHexString())
    if (!material) continue

    const reversedAt =
      reversals.length > 0
        ? reversals.reduce(
            (min, r) => (min === null || r.createdAt < min ? r.createdAt : min),
            null as Date | null,
          )
        : null

    rows.push({
      transferGroupId: groupKey,
      sourceMovId: sourceLeg._id.toHexString(),
      occurredAt: sourceLeg.occurredAt,
      sourceProjectId: sourceLeg.projectId.toHexString(),
      sourceProjectName:
        projectNameById.get(sourceLeg.projectId.toHexString()) ??
        "(unknown project)",
      destProjectId: destLeg.projectId.toHexString(),
      destProjectName:
        projectNameById.get(destLeg.projectId.toHexString()) ??
        "(unknown project)",
      materialId: sourceLeg.materialId.toHexString(),
      materialName: material.name,
      materialUnit: material.unit,
      materialUnitOther: material.unitOther,
      qty: sourceLeg.qty,
      status: reversals.length > 0 ? "reversed" : "active",
      reversedAt,
      createdBy: sourceLeg.createdBy.toHexString(),
      createdByName:
        userNameById.get(sourceLeg.createdBy.toHexString()) ?? null,
    })
  }
  return { rows, total }
}
