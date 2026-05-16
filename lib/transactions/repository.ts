import { ObjectId } from "mongodb"
import client, { getDb } from "@/lib/db/client"
import type { Unit, Project } from "@/lib/projects/schemas"
import type { MoneyTransferRow } from "@/lib/transfers/schemas"
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
  revenue: number       // unchanged. INCLUDES transfer_in rows (Phase 5 semantics preserved).
  expenses: number      // unchanged. INCLUDES transfer_out rows.
  net: number           // unchanged. revenue - expenses.
  transfersIn: number   // Phase 6 — subset of revenue: sum of transfer_in rows over the same window.
  transfersOut: number  // Phase 6 — subset of expenses: sum of transfer_out rows over the same window.
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
  const [bundle] = await db
    .collection<Transaction>("transactions")
    .aggregate<{
      byKind: { _id: TransactionKind; total: number }[]
      byTransferCategory: { _id: "transfer_in" | "transfer_out"; total: number }[]
    }>([
      { $match: match },
      {
        $facet: {
          byKind: [
            {
              $group: {
                _id: "$kind",
                total: {
                  $sum: {
                    $cond: [
                      { $ifNull: ["$reversalOf", false] },
                      { $multiply: ["$amount", -1] },
                      "$amount",
                    ],
                  },
                },
              },
            },
          ],
          byTransferCategory: [
            {
              $match: {
                category: { $in: ["transfer_in", "transfer_out"] },
              },
            },
            {
              $group: {
                _id: "$category",
                total: {
                  $sum: {
                    $cond: [
                      { $ifNull: ["$reversalOf", false] },
                      { $multiply: ["$amount", -1] },
                      "$amount",
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    ])
    .toArray()

  let revenue = 0
  let expenses = 0
  for (const r of bundle?.byKind ?? []) {
    if (r._id === "income") revenue = r.total
    else if (r._id === "expense") expenses = r.total
  }
  let transfersIn = 0
  let transfersOut = 0
  for (const r of bundle?.byTransferCategory ?? []) {
    if (r._id === "transfer_in") transfersIn = r.total
    else if (r._id === "transfer_out") transfersOut = r.total
  }
  return {
    revenue,
    expenses,
    net: revenue - expenses,
    transfersIn,
    transfersOut,
  }
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

  type ByKindRow = {
    _id: { projectId: ObjectId; kind: TransactionKind }
    total: number
  }
  type ByTransferRow = {
    _id: { projectId: ObjectId; category: "transfer_in" | "transfer_out" }
    total: number
  }

  const [bundle] = await db
    .collection<Transaction>("transactions")
    .aggregate<{
      byKind: ByKindRow[]
      byTransferCategory: ByTransferRow[]
    }>([
      { $match: match },
      {
        $facet: {
          byKind: [
            {
              $group: {
                _id: { projectId: "$projectId", kind: "$kind" },
                total: {
                  $sum: {
                    $cond: [
                      { $ifNull: ["$reversalOf", false] },
                      { $multiply: ["$amount", -1] },
                      "$amount",
                    ],
                  },
                },
              },
            },
          ],
          byTransferCategory: [
            {
              $match: {
                category: { $in: ["transfer_in", "transfer_out"] },
              },
            },
            {
              $group: {
                _id: { projectId: "$projectId", category: "$category" },
                total: {
                  $sum: {
                    $cond: [
                      { $ifNull: ["$reversalOf", false] },
                      { $multiply: ["$amount", -1] },
                      "$amount",
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    ])
    .toArray()

  type PerProjectAcc = {
    revenue: number
    expenses: number
    transfersIn: number
    transfersOut: number
  }
  const byProject = new Map<string, PerProjectAcc>()
  const ensure = (key: string): PerProjectAcc => {
    const existing = byProject.get(key)
    if (existing) return existing
    const created: PerProjectAcc = {
      revenue: 0,
      expenses: 0,
      transfersIn: 0,
      transfersOut: 0,
    }
    byProject.set(key, created)
    return created
  }

  for (const row of bundle?.byKind ?? []) {
    const key = row._id.projectId.toHexString()
    const acc = ensure(key)
    if (row._id.kind === "income") acc.revenue = row.total
    else if (row._id.kind === "expense") acc.expenses = row.total
  }
  for (const row of bundle?.byTransferCategory ?? []) {
    const key = row._id.projectId.toHexString()
    const acc = ensure(key)
    if (row._id.category === "transfer_in") acc.transfersIn = row.total
    else if (row._id.category === "transfer_out") acc.transfersOut = row.total
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
  let overallTransfersIn = 0
  let overallTransfersOut = 0
  for (const [pid, totals] of byProject) {
    perProject.push({
      projectId: pid,
      projectName: nameById.get(pid) ?? "(unknown project)",
      revenue: totals.revenue,
      expenses: totals.expenses,
      net: totals.revenue - totals.expenses,
      transfersIn: totals.transfersIn,
      transfersOut: totals.transfersOut,
    })
    overallRevenue += totals.revenue
    overallExpenses += totals.expenses
    overallTransfersIn += totals.transfersIn
    overallTransfersOut += totals.transfersOut
  }

  // Sort by absolute net descending so most-active projects float to the top.
  perProject.sort((a, b) => Math.abs(b.net) - Math.abs(a.net))

  return {
    overall: {
      revenue: overallRevenue,
      expenses: overallExpenses,
      net: overallRevenue - overallExpenses,
      transfersIn: overallTransfersIn,
      transfersOut: overallTransfersOut,
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
        notes: override.notes || undefined,
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
// Phase 6 — money transfers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Atomically write the two paired ledger rows for a money transfer.
 *
 *   source: kind="expense", category="transfer_out"
 *   dest:   kind="income",  category="transfer_in"
 *
 * Both rows share a fresh `transferGroupId`. Project names are denormalized
 * into the description string by the caller; rename-after-write does not
 * back-fill (consistent with Phase 4's "Purchase: {materialName}").
 *
 * Same-project guard is the action layer's responsibility (cheap pre-session
 * check). This function does not re-check; callers must.
 */
export async function createMoneyTransfer(
  input: {
    sourceProjectId: ObjectId
    destProjectId: ObjectId
    amount: number
    occurredAt: Date
    description: string
    notes: string
    sourceProjectName: string
    destProjectName: string
  },
  userId: string
): Promise<{ transferGroupId: ObjectId; sourceTxId: ObjectId; destTxId: ObjectId }> {
  const createdBy = new ObjectId(userId)
  const transferGroupId = new ObjectId()
  const session = client.startSession()
  try {
    let sourceTxId!: ObjectId
    let destTxId!: ObjectId
    await session.withTransaction(async () => {
      const db = getDb()
      const txns = db.collection<Omit<Transaction, "_id">>("transactions")
      const now = new Date()

      const sourceDoc: Omit<Transaction, "_id"> = {
        projectId: input.sourceProjectId,
        unitId: null,
        kind: "expense",
        category: "transfer_out",
        amount: input.amount,
        currency: "INR",
        description: `Transfer to ${input.destProjectName}: ${input.description}`,
        occurredAt: input.occurredAt,
        notes: input.notes || undefined,
        transferGroupId,
        createdBy,
        createdAt: now,
      }
      const sourceRes = await txns.insertOne(sourceDoc, { session })
      sourceTxId = sourceRes.insertedId

      const destDoc: Omit<Transaction, "_id"> = {
        projectId: input.destProjectId,
        unitId: null,
        kind: "income",
        category: "transfer_in",
        amount: input.amount,
        currency: "INR",
        description: `Transfer from ${input.sourceProjectName}: ${input.description}`,
        occurredAt: input.occurredAt,
        notes: input.notes || undefined,
        transferGroupId,
        createdBy,
        createdAt: now,
      }
      const destRes = await txns.insertOne(destDoc, { session })
      destTxId = destRes.insertedId
    })
    return { transferGroupId, sourceTxId, destTxId }
  } finally {
    await session.endSession()
  }
}

/**
 * Reverse a money transfer atomically. Inserts two new ledger rows (a "reversal
 * pair") sharing the same transferGroupId as the original pair. Each reversal
 * leg carries reversalOf pointing to its corresponding original leg.
 *
 * Inside withTransaction:
 *   1. Find both legs by transferGroupId. Expect exactly 2 rows.
 *   2. Reject if either leg already has reversalOf (meaning the looked-up rows
 *      are themselves reversals) or voided=true.
 *   3. Reject if any row in the collection has reversalOf pointing to either leg
 *      (already-reversed guard — serialized via the surrounding withTransaction).
 *   4. Insert two reversal rows: swapped kind/category, same amount, same
 *      transferGroupId, reversalOf pointing to the matching original leg.
 */
export async function reverseMoneyTransfer(
  transferGroupId: ObjectId,
  override: { occurredAt?: Date; notes?: string },
  userId: string
): Promise<{ sourceRevId: ObjectId; destRevId: ObjectId }> {
  const createdBy = new ObjectId(userId)
  const session = client.startSession()
  try {
    let sourceRevId!: ObjectId
    let destRevId!: ObjectId
    await session.withTransaction(async () => {
      const db = getDb()
      const coll = db.collection<Transaction>("transactions")
      const insertColl = db.collection<Omit<Transaction, "_id">>("transactions")

      const legs = await coll.find({ transferGroupId }, { session }).toArray()
      // Filter to ONLY the originals — a reversed group has 4 rows; we want the 2
      // without reversalOf. If we find != 2 originals, throw.
      const originals = legs.filter((l) => !l.reversalOf)
      if (originals.length !== 2) {
        throw new TransferNotFoundError(
          "Transfer not found or not a valid pair of originals."
        )
      }

      const sourceLeg = originals.find((l) => l.category === "transfer_out")
      const destLeg = originals.find((l) => l.category === "transfer_in")
      if (!sourceLeg || !destLeg) {
        throw new TransferNotFoundError(
          "Transfer group missing expected source or destination leg."
        )
      }

      if (sourceLeg.voided === true || destLeg.voided === true) {
        throw new CannotReverseTransferError("is-voided")
      }

      // Already-reversed guard: any row pointing reversalOf at either leg.
      const existingReversal = await coll.findOne(
        { reversalOf: { $in: [sourceLeg._id, destLeg._id] } },
        { session }
      )
      if (existingReversal) {
        throw new AlreadyReversedError(
          "This transfer has already been reversed."
        )
      }

      const now = new Date()
      const occurredAt = override.occurredAt ?? now
      const notes = override.notes || undefined

      // Reversal of source leg (originally expense/transfer_out) becomes
      // income/transfer_in for the source project — it gets the money back.
      const sourceRevDoc: Omit<Transaction, "_id"> = {
        projectId: sourceLeg.projectId,
        unitId: null,
        kind: "income",
        category: "transfer_in",
        amount: sourceLeg.amount,
        currency: "INR",
        description: `Reversal — ${sourceLeg.description}`,
        occurredAt,
        notes,
        reversalOf: sourceLeg._id,
        transferGroupId,
        createdBy,
        createdAt: now,
      }
      const sourceRes = await insertColl.insertOne(sourceRevDoc, { session })
      sourceRevId = sourceRes.insertedId

      const destRevDoc: Omit<Transaction, "_id"> = {
        projectId: destLeg.projectId,
        unitId: null,
        kind: "expense",
        category: "transfer_out",
        amount: destLeg.amount,
        currency: "INR",
        description: `Reversal — ${destLeg.description}`,
        occurredAt,
        notes,
        reversalOf: destLeg._id,
        transferGroupId,
        createdBy,
        createdAt: now,
      }
      const destRes = await insertColl.insertOne(destRevDoc, { session })
      destRevId = destRes.insertedId
    })
    return { sourceRevId, destRevId }
  } finally {
    await session.endSession()
  }
}

/**
 * List money transfers across all projects within a date range.
 *
 * Groups rows in the `transactions` collection by `transferGroupId`. Each
 * active transfer is a 2-row group (source + dest, neither with reversalOf);
 * each reversed transfer is a 4-row group (2 originals + 2 reversals).
 *
 * Returns one row per group, taking metadata from the source leg (kind=expense,
 * category=transfer_out). Status is "reversed" iff any row in the group has
 * reversalOf set.
 *
 * Date range applies to the source leg's `occurredAt`. Reversed-but-original-
 * before-window groups are still returned if their original date is in range.
 */
export async function listMoneyTransfers(
  range: { from: Date; to: Date }
): Promise<MoneyTransferRow[]> {
  const db = getDb()
  const fromDate = range.from
  const toDate = endOfDay(range.to)

  const candidates = await db
    .collection<Transaction>("transactions")
    .aggregate<{ _id: ObjectId }>([
      {
        $match: {
          transferGroupId: { $exists: true },
          category: { $in: ["transfer_in", "transfer_out"] },
          occurredAt: { $gte: fromDate, $lte: toDate },
          reversalOf: { $exists: false },
        },
      },
      { $group: { _id: "$transferGroupId" } },
    ])
    .toArray()
  const groupIds = candidates.map((c) => c._id)
  if (groupIds.length === 0) return []

  const allRows = await db
    .collection<Transaction>("transactions")
    .find({ transferGroupId: { $in: groupIds } })
    .toArray()

  const byGroup = new Map<string, Transaction[]>()
  for (const row of allRows) {
    const key = row.transferGroupId!.toHexString()
    const bucket = byGroup.get(key) ?? []
    bucket.push(row)
    byGroup.set(key, bucket)
  }

  const projectIds = new Set<string>()
  const userIds = new Set<string>()
  for (const row of allRows) {
    projectIds.add(row.projectId.toHexString())
    userIds.add(row.createdBy.toHexString())
  }
  const projectsList = await db
    .collection<Project>("projects")
    .find({ _id: { $in: [...projectIds].map((id) => new ObjectId(id)) } })
    .project<{ _id: ObjectId; name: string }>({ name: 1 })
    .toArray()
  const projectNameById = new Map(
    projectsList.map((p) => [p._id.toHexString(), p.name])
  )
  const usersList = await db
    .collection<{ _id: ObjectId; name?: string; email?: string }>("users")
    .find({ _id: { $in: [...userIds].map((id) => new ObjectId(id)) } })
    .project<{ _id: ObjectId; name?: string; email?: string }>({ name: 1, email: 1 })
    .toArray()
  const userNameById = new Map(
    usersList.map((u) => [u._id.toHexString(), u.name ?? u.email ?? null])
  )

  const result: MoneyTransferRow[] = []
  for (const [groupKey, rows] of byGroup) {
    const originals = rows.filter((r) => !r.reversalOf)
    const reversals = rows.filter((r) => r.reversalOf)
    const sourceLeg = originals.find((r) => r.category === "transfer_out")
    const destLeg = originals.find((r) => r.category === "transfer_in")
    if (!sourceLeg || !destLeg) continue

    const reversedAt =
      reversals.length > 0
        ? reversals.reduce(
            (min, r) => (min === null || r.createdAt < min ? r.createdAt : min),
            null as Date | null
          )
        : null

    result.push({
      transferGroupId: groupKey,
      occurredAt: sourceLeg.occurredAt,
      sourceProjectId: sourceLeg.projectId.toHexString(),
      sourceProjectName:
        projectNameById.get(sourceLeg.projectId.toHexString()) ??
        "(unknown project)",
      destProjectId: destLeg.projectId.toHexString(),
      destProjectName:
        projectNameById.get(destLeg.projectId.toHexString()) ??
        "(unknown project)",
      amount: sourceLeg.amount,
      description: sourceLeg.description,
      status: reversals.length > 0 ? "reversed" : "active",
      reversedAt,
      createdBy: sourceLeg.createdBy.toHexString(),
      createdByName:
        userNameById.get(sourceLeg.createdBy.toHexString()) ?? null,
    })
  }

  result.sort((a, b) => {
    const d = b.occurredAt.getTime() - a.occurredAt.getTime()
    if (d !== 0) return d
    return b.transferGroupId.localeCompare(a.transferGroupId)
  })
  return result
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

// ──────────────────────────────────────────────────────────────────────────
// Phase 6 — transfer error classes
// ──────────────────────────────────────────────────────────────────────────

export class TransferNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TransferNotFoundError"
  }
}

export class AlreadyReversedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AlreadyReversedError"
  }
}

export type CannotReverseTransferReason = "not-original" | "is-voided"

export class CannotReverseTransferError extends Error {
  readonly reason: CannotReverseTransferReason
  constructor(reason: CannotReverseTransferReason) {
    super(`Cannot reverse transfer: ${reason}`)
    this.name = "CannotReverseTransferError"
    this.reason = reason
  }
}
