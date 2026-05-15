import { ObjectId } from "mongodb"
import client, { getDb } from "@/lib/db/client"
import type { Unit, Project } from "@/lib/projects/schemas"
import type { Transaction, TransactionKind, LedgerFilters } from "./schemas"

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

// ──────────────────────────────────────────────────────────────────────────
// Phase 5 — ledger reads
// ──────────────────────────────────────────────────────────────────────────

function buildLedgerMatch(filters: LedgerFilters): Record<string, unknown> {
  const match: Record<string, unknown> = {
    occurredAt: { $gte: filters.from, $lte: endOfDay(filters.to) },
  }
  if (filters.kind !== "all") match.kind = filters.kind
  if (filters.category !== "all") match.category = filters.category
  if (!filters.includeVoided) match.voided = { $ne: true }
  return match
}

function endOfDay(d: Date): Date {
  const e = new Date(d)
  e.setHours(23, 59, 59, 999)
  return e
}

/**
 * Returns the filtered ledger for a single project. Newest first.
 */
export async function listLedger(
  projectId: ObjectId,
  filters: LedgerFilters
): Promise<Transaction[]> {
  const db = getDb()
  const match = { ...buildLedgerMatch(filters), projectId }
  return db
    .collection<Transaction>("transactions")
    .find(match)
    .sort({ occurredAt: -1, _id: -1 })
    .toArray()
}

export type FinancialTotals = {
  revenue: number
  expenses: number
  net: number
}

/**
 * Computes Revenue / Expenses / Net over the filter window. Reversal rows
 * subtract from their own kind's total via $cond on reversalOf. Voided rows
 * are filtered out unless includeVoided=true, so "what you see is what you
 * sum" — ledger and tiles always agree.
 */
export async function computeTotals(
  projectId: ObjectId,
  filters: LedgerFilters
): Promise<FinancialTotals> {
  const db = getDb()
  const match = { ...buildLedgerMatch(filters), projectId }
  const rows = await db
    .collection<Transaction>("transactions")
    .aggregate<{ _id: TransactionKind; total: number }>([
      { $match: match },
      {
        $group: {
          _id: "$kind",
          total: {
            $sum: {
              $cond: [
                { $eq: ["$reversalOf", null] },
                "$amount",
                { $multiply: ["$amount", -1] },
              ],
            },
          },
        },
      },
    ])
    .toArray()
  let revenue = 0
  let expenses = 0
  for (const r of rows) {
    if (r._id === "income") revenue = r.total
    else if (r._id === "expense") expenses = r.total
  }
  return { revenue, expenses, net: revenue - expenses }
}

export type PerProjectTotals = FinancialTotals & {
  projectId: string
  projectName: string
}

export type CrossProjectTotals = {
  overall: FinancialTotals
  perProject: PerProjectTotals[]
}

/**
 * Cross-project totals for the global /financials view. Date-range only — no
 * kind/category filter is offered in the global view.
 */
export async function listCrossProjectTotals(
  range: { from: Date; to: Date }
): Promise<CrossProjectTotals> {
  const db = getDb()
  const match = {
    occurredAt: { $gte: range.from, $lte: endOfDay(range.to) },
    voided: { $ne: true },
  }

  const grouped = await db
    .collection<Transaction>("transactions")
    .aggregate<{ _id: { projectId: ObjectId; kind: TransactionKind }; total: number }>([
      { $match: match },
      {
        $group: {
          _id: { projectId: "$projectId", kind: "$kind" },
          total: {
            $sum: {
              $cond: [
                { $eq: ["$reversalOf", null] },
                "$amount",
                { $multiply: ["$amount", -1] },
              ],
            },
          },
        },
      },
    ])
    .toArray()

  const byProject = new Map<string, { revenue: number; expenses: number }>()
  for (const row of grouped) {
    const key = row._id.projectId.toHexString()
    const entry = byProject.get(key) ?? { revenue: 0, expenses: 0 }
    if (row._id.kind === "income") entry.revenue = row.total
    else if (row._id.kind === "expense") entry.expenses = row.total
    byProject.set(key, entry)
  }

  // Attach project names. Read all projects (Phase 2 list is small) and join.
  const projects = await db
    .collection<Project>("projects")
    .find({})
    .project<{ _id: ObjectId; name: string }>({ name: 1 })
    .toArray()
  const nameById = new Map(projects.map((p) => [p._id.toHexString(), p.name]))

  const perProject: PerProjectTotals[] = []
  let overallRevenue = 0
  let overallExpenses = 0
  for (const [pid, totals] of byProject) {
    perProject.push({
      projectId: pid,
      projectName: nameById.get(pid) ?? "(unknown project)",
      revenue: totals.revenue,
      expenses: totals.expenses,
      net: totals.revenue - totals.expenses,
    })
    overallRevenue += totals.revenue
    overallExpenses += totals.expenses
  }

  // Sort by absolute net descending so most-active projects float to the top.
  perProject.sort((a, b) => Math.abs(b.net) - Math.abs(a.net))

  return {
    overall: {
      revenue: overallRevenue,
      expenses: overallExpenses,
      net: overallRevenue - overallExpenses,
    },
    perProject,
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Phase 5 — ledger writes (void + reverse)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Soft-void an ad-hoc transaction. Race-safe via conditional update on
 * category + voided + reversalOf $exists:false. Throws TransactionNotFoundError
 * if no row matches (covers: deleted, not adhoc, already voided, is a reversal).
 */
export async function voidTransaction(
  transactionId: ObjectId,
  userId: string
): Promise<void> {
  const voidedBy = new ObjectId(userId)
  const db = getDb()
  const now = new Date()
  const res = await db
    .collection<Transaction>("transactions")
    .updateOne(
      {
        _id: transactionId,
        category: "adhoc",
        voided: { $ne: true },
        reversalOf: { $exists: false },
      },
      {
        $set: {
          voided: true,
          voidedAt: now,
          voidedBy,
        },
      }
    )
  if (res.matchedCount === 0) {
    throw new TransactionNotFoundError(
      "Transaction not found, already voided, or not voidable."
    )
  }
}

/**
 * Insert a reversing entry. withTransaction wraps the read + insert so two
 * concurrent reversers see deterministic ordering (the second succeeds but
 * produces a duplicate reversal row — documented as known in the spec).
 *
 * Preconditions checked inside the transaction:
 *   - original exists
 *   - original not voided
 *   - original is not itself a reversal
 *   - original is not a transfer (Phase 6 territory)
 */
export async function reverseTransaction(
  transactionId: ObjectId,
  override: { occurredAt?: Date; notes?: string },
  userId: string
): Promise<{ reversalId: ObjectId }> {
  const createdBy = new ObjectId(userId)
  const session = client.startSession()
  try {
    let reversalId!: ObjectId
    await session.withTransaction(async () => {
      const db = getDb()
      const coll = db.collection<Transaction>("transactions")
      const insertColl = db.collection<Omit<Transaction, "_id">>("transactions")

      const original = await coll.findOne(
        { _id: transactionId },
        { session }
      )
      if (!original) {
        throw new CannotReverseError("not-found")
      }
      if (original.voided === true) {
        throw new CannotReverseError("is-voided")
      }
      if (original.reversalOf) {
        throw new CannotReverseError("is-reversal")
      }
      if (
        original.category === "transfer_in" ||
        original.category === "transfer_out"
      ) {
        throw new CannotReverseError("is-transfer")
      }

      const now = new Date()
      const occurredAt = override.occurredAt ?? now
      const reversalDoc: Omit<Transaction, "_id"> = {
        projectId: original.projectId,
        unitId: original.unitId,
        kind: original.kind,
        category: original.category,
        amount: original.amount,
        currency: "INR",
        description: `Reversal of: ${original.description}`,
        occurredAt,
        buyerName: original.buyerName,
        notes: override.notes ?? "",
        reversalOf: original._id,
        createdBy,
        createdAt: now,
      }
      const res = await insertColl.insertOne(reversalDoc, { session })
      reversalId = res.insertedId
    })
    return { reversalId }
  } finally {
    await session.endSession()
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Phase 5 — error classes
// ──────────────────────────────────────────────────────────────────────────

export class TransactionNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TransactionNotFoundError"
  }
}

export class TransactionAlreadyVoidedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TransactionAlreadyVoidedError"
  }
}

export type CannotReverseReason =
  | "not-found"
  | "is-voided"
  | "is-reversal"
  | "is-transfer"

export class CannotReverseError extends Error {
  readonly reason: CannotReverseReason
  constructor(reason: CannotReverseReason) {
    super(`Cannot reverse: ${reason}`)
    this.name = "CannotReverseError"
    this.reason = reason
  }
}
