import { ObjectId } from "mongodb"
import client, { getDb } from "@/lib/db/client"
import type { Transaction } from "@/lib/transactions/schemas"
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
  input: UpdateMaterialInput
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

  const patch: Record<string, unknown> = { updatedAt: new Date() }
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
    .updateOne({ _id: materialId }, { $set: patch })
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
