import { ObjectId } from "mongodb"
import client, { getDb } from "@/lib/db/client"
import type { Unit } from "@/lib/projects/schemas"
import type { Transaction } from "./schemas"

/**
 * Atomically marks one available unit as sold and inserts the corresponding
 * income transaction. Uses a conditional updateOne ({_id, status: "available"})
 * so concurrent admin clicks on the same unit produce exactly one sale; the
 * loser sees `matchedCount === 0` and the transaction aborts.
 *
 * Throws on:
 *   - Unit not found / wrong project (caller pre-checks; this is defense-in-depth)
 *   - Concurrent claim (status no longer "available")
 *   - Mongo driver / network errors
 */
export async function markUnitSold(
  input: {
    projectId: ObjectId
    unitId: ObjectId
    salePrice: number
    buyerName: string
    saleDate: Date
    description: string
    notes: string
  },
  userId: string
): Promise<{ transactionId: ObjectId }> {
  const createdBy = new ObjectId(userId)
  const session = client.startSession()
  try {
    let transactionId!: ObjectId
    await session.withTransaction(async () => {
      const db = getDb()
      const units = db.collection<Unit>("units")
      const txns = db.collection<Omit<Transaction, "_id">>("transactions")
      const now = new Date()

      const updateRes = await units.updateOne(
        { _id: input.unitId, projectId: input.projectId, status: "available" },
        {
          $set: {
            status: "sold",
            soldAt: input.saleDate,
            soldPriceTotal: input.salePrice,
            buyerName: input.buyerName,
            updatedAt: now,
          },
        },
        { session }
      )
      if (updateRes.matchedCount === 0) {
        throw new UnitNotAvailableError(
          "Unit is no longer available — someone else may have just sold it. Refresh and try again."
        )
      }

      const txDoc: Omit<Transaction, "_id"> = {
        projectId: input.projectId,
        unitId: input.unitId,
        kind: "income",
        category: "sale",
        amount: input.salePrice,
        currency: "INR",
        description: input.description,
        occurredAt: input.saleDate,
        buyerName: input.buyerName,
        notes: input.notes,
        createdBy,
        createdAt: now,
      }
      const insertRes = await txns.insertOne(txDoc, { session })
      transactionId = insertRes.insertedId
    })
    return { transactionId }
  } finally {
    await session.endSession()
  }
}

/**
 * Atomically un-marks a sold unit (clears soldAt/soldPriceTotal/buyerName,
 * sets status back to "available") and soft-voids the matching active sale
 * transaction.
 *
 * Soft-void semantics: the row stays in the collection; `voided`, `voidedAt`,
 * `voidedBy` are set. Revenue aggregates filter on `voided: { $ne: true }`.
 *
 * The transaction row update is best-effort: if no active sale row exists
 * for this unit (data already corrupted, manual mongosh deletion, etc.) we
 * still restore the unit's status and return a warning flag. The unit's
 * state is the source of truth for inventory.
 */
export async function unmarkUnitSold(
  unitId: ObjectId,
  userId: string
): Promise<{ ledgerRowVoided: boolean }> {
  const voidedBy = new ObjectId(userId)
  const session = client.startSession()
  try {
    let ledgerRowVoided = false
    await session.withTransaction(async () => {
      const db = getDb()
      const units = db.collection<Unit>("units")
      const txns = db.collection<Transaction>("transactions")
      const now = new Date()

      const unitRes = await units.updateOne(
        { _id: unitId, status: "sold" },
        {
          $set: { status: "available", updatedAt: now },
          $unset: { soldAt: "", soldPriceTotal: "", buyerName: "" },
        },
        { session }
      )
      if (unitRes.matchedCount === 0) {
        throw new UnitNotSoldError(
          "Unit is not currently marked sold."
        )
      }

      const txRes = await txns.updateOne(
        {
          unitId,
          kind: "income",
          category: "sale",
          voided: { $ne: true },
        },
        {
          $set: {
            voided: true,
            voidedAt: now,
            voidedBy,
          },
        },
        { session }
      )
      ledgerRowVoided = txRes.matchedCount > 0
    })
    return { ledgerRowVoided }
  } finally {
    await session.endSession()
  }
}

export async function sumProjectRevenue(projectId: ObjectId): Promise<number> {
  const db = getDb()
  const res = await db
    .collection<Transaction>("transactions")
    .aggregate<{ total: number }>([
      {
        $match: {
          projectId,
          kind: "income",
          voided: { $ne: true },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ])
    .toArray()
  return res[0]?.total ?? 0
}

export class UnitNotAvailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UnitNotAvailableError"
  }
}

export class UnitNotSoldError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UnitNotSoldError"
  }
}
