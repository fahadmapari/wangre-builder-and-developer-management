# Phase 6 — Inter-Project Transfers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-05-16-phase-6-transfers-design.md`](../superpowers/specs/2026-05-16-phase-6-transfers-design.md) (committed in `b39cdfc`).

**Goal:** Ship admin-only inter-project money + material transfers with paired reversal. Surfaced via per-project triggers (Financials and Materials tabs) and a new top-level admin route `/transfers` with two tabs (Money | Material).

**Architecture:** Two distinct flows — money writes paired `transactions` rows; material writes paired `materialMovements` rows plus paired `projectMaterials.stockOnHand` adjustments — both atomic via `client.startSession()` + `session.withTransaction(...)`. A `transferGroupId: ObjectId` field on both row types (sparse-indexed in each collection) links each pair. Reversal inserts a second pair into the same group with each leg carrying `reversalOf` pointing to its corresponding original leg; an "already reversed" check inside `withTransaction` provides race safety stronger than Phase 5's reversal flow. Phase 5's `FinancialTotals` is extended with `transfersIn`/`transfersOut` fields and Phase 5's per-project + global tiles render a subtitle when non-zero, but Phase 5's underlying revenue/expense math is unchanged.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript, native `mongodb` driver with transactions (Atlas replica set at `wangredev`), Zod, Tailwind v4 + shadcn/ui radix-nova. No new shadcn primitives.

**Branch:** Cut `feat/phase-6-transfers` from local `master` (currently `b39cdfc`, the spec commit). Do **not** push to origin until the user explicitly asks.

**Verification approach:** The project has no automated test suite. Phase 4 and Phase 5 verified via manual T-tasks + `pnpm tsc --noEmit` + `pnpm lint`. Phase 6 follows the same precedent. After each code change task, run `pnpm tsc --noEmit` (fast) and commit. UI tasks are visually verified by running the dev server; backend tasks are smoke-tested via `mongosh` or `pnpm dev` browser interaction. Concrete T-tasks executed in batch at Task 24.

---

## File Structure

**Create:**
- `lib/transfers/schemas.ts` — Zod input schemas + display row types shared by repos, actions, and UI.
- `app/(authed)/transfers/page.tsx` — admin-only top-level route, two tabs container.
- `app/(authed)/transfers/actions.ts` — four server actions: `createMoneyTransferAction`, `reverseMoneyTransferAction`, `createMaterialTransferAction`, `reverseMaterialTransferAction`.
- `app/(authed)/transfers/money-transfer-dialog.tsx` — client component; accepts optional `lockedSource` prop for per-project trigger reuse.
- `app/(authed)/transfers/material-transfer-dialog.tsx` — client component; accepts `lockedSource` and `lockedMaterial`.
- `app/(authed)/transfers/reverse-transfer-dialog.tsx` — client component; shared between money + material reversal.
- `app/(authed)/transfers/money-transfers-table.tsx` — server component; consumes `listMoneyTransfers`.
- `app/(authed)/transfers/material-transfers-table.tsx` — server component; consumes `listMaterialTransfers`.

**Modify:**
- `lib/transactions/schemas.ts` — add `transferGroupId?: ObjectId` field on `Transaction` type.
- `lib/transactions/repository.ts` — add `createMoneyTransfer`, `reverseMoneyTransfer`, `listMoneyTransfers`; extend `FinancialTotals` with `transfersIn`/`transfersOut`; extend `computeTotals` and `listCrossProjectTotals` to populate them; add `TransferNotFoundError`, `AlreadyReversedError`, `CannotReverseTransferError` error classes.
- `lib/materials/schemas.ts` — add `transferGroupId?: ObjectId` and `reversalOf?: ObjectId` fields on `MaterialMovement` type.
- `lib/materials/repository.ts` — add `createMaterialTransfer`, `reverseMaterialTransfer`, `listMaterialTransfers`; add `InsufficientStockForReversalError` error class.
- `scripts/init-db.mjs` — append three sparse indexes (`transactions.transferGroupId`, `materialMovements.transferGroupId`, `materialMovements.reversalOf`).
- `app/(authed)/layout.tsx` — add admin-only "Transfers" link in header nav (alongside existing "Financials" link).
- `app/(authed)/projects/[id]/financials/financials-view.tsx` — add `transfersIn`/`transfersOut` subtitle on Revenue and Expenses tiles; add "Transfer money to another project" button to the toolbar row.
- `app/(authed)/projects/[id]/financials/ledger-table.tsx` — add `↔ {OtherProjectName}` badge on transfer rows.
- `app/(authed)/projects/[id]/materials/materials-table.tsx` — add admin-only "Transfer to another project" row action button.
- `app/(authed)/financials/page.tsx` — pass `transfersIn`/`transfersOut` into the overall tiles and per-project table.
- `app/(authed)/financials/per-project-table.tsx` — render transfer subtitle inside Revenue/Expenses cells.

**Add via `npx shadcn@latest add`:** none (all primitives already installed).

---

## Task 1 — Cut the feature branch

**Files:** none.

- [ ] **Step 1: Verify clean state on `master`**

```bash
git status
git log --oneline -3
```

Expected: working tree clean, HEAD at `b39cdfc` (the Phase 6 design-doc commit).

- [ ] **Step 2: Cut the branch**

```bash
git checkout -b feat/phase-6-transfers
```

Expected: `Switched to a new branch 'feat/phase-6-transfers'`.

- [ ] **Step 3: No commit yet.**

Subsequent tasks commit onto the branch. Do not push.

---

## Task 2 — Schema + index foundations (transactions, materialMovements, init-db)

**Files:**
- Modify: `lib/transactions/schemas.ts`
- Modify: `lib/materials/schemas.ts`
- Modify: `scripts/init-db.mjs`

- [ ] **Step 1: Add `transferGroupId` to `Transaction` type**

Open `lib/transactions/schemas.ts`. Find the `Transaction` type around line 120. Add the new field after `reversalOf`:

```ts
export type Transaction = {
  _id: ObjectId
  projectId: ObjectId
  unitId: ObjectId | null
  kind: TransactionKind
  category: TransactionCategory
  amount: number
  currency: "INR"
  description: string
  occurredAt: Date
  buyerName?: string
  notes?: string
  voided?: boolean
  voidedAt?: Date
  voidedBy?: ObjectId
  reversalOf?: ObjectId       // Phase 5 — FK to original when this row is a reversal
  transferGroupId?: ObjectId  // Phase 6 — shared by both legs of a transfer (and both legs of its reversal)
  createdBy: ObjectId
  createdAt: Date
}
```

- [ ] **Step 2: Add `transferGroupId` and `reversalOf` to `MaterialMovement` type**

Open `lib/materials/schemas.ts`. Find the `MaterialMovement` type around line 160. Add the two new fields:

```ts
export type MaterialMovement = {
  _id: ObjectId
  projectId: ObjectId
  materialId: ObjectId
  kind: MovementKind
  category: MovementCategory
  qty: number
  unitPriceAtMovement?: number
  amount?: number
  purpose?: string
  notes?: string
  transactionId?: ObjectId | null
  voided?: boolean
  voidedAt?: Date
  voidedBy?: ObjectId
  reversalOf?: ObjectId       // Phase 6 — parallels Transaction.reversalOf
  transferGroupId?: ObjectId  // Phase 6 — parallels Transaction.transferGroupId
  occurredAt: Date
  createdBy: ObjectId
  createdAt: Date
}
```

- [ ] **Step 3: Append Phase 6 indexes to `scripts/init-db.mjs`**

Open `scripts/init-db.mjs`. After the existing Phase 5 reversal index block (around line 64), append:

```js
// Phase 6 — transfer pair linkage
await db
  .collection("transactions")
  .createIndex({ transferGroupId: 1 }, { sparse: true })
await db
  .collection("materialMovements")
  .createIndex({ transferGroupId: 1 }, { sparse: true })
await db
  .collection("materialMovements")
  .createIndex({ reversalOf: 1 }, { sparse: true })
```

Also extend the final `console.log` summary so it lists the new indexes — add this to the existing string:

```
"; transactions.transferGroupId sparse; " +
"materialMovements.reversalOf sparse, materialMovements.transferGroupId sparse"
```

- [ ] **Step 4: Run the script against the dev DB to create the indexes**

```bash
node --env-file-if-exists=.env scripts/init-db.mjs
```

Expected: the script prints the index-summary line, including the three new sparse indexes, and exits 0.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/transactions/schemas.ts lib/materials/schemas.ts scripts/init-db.mjs
git commit -m "feat(transfers): add transferGroupId/reversalOf fields + sparse indexes"
```

---

## Task 3 — Create `lib/transfers/schemas.ts`

**Files:**
- Create: `lib/transfers/schemas.ts`

- [ ] **Step 1: Create the file with full contents**

Create `lib/transfers/schemas.ts`:

```ts
import { z } from "zod"
import type { ObjectId } from "mongodb"
import type { MaterialUnit } from "@/lib/materials/schemas"

// ──────────────────────────────────────────────────────────────────────────
// Phase 6 — transfer inputs (server-action layer)
// ──────────────────────────────────────────────────────────────────────────

export const CreateMoneyTransferInputSchema = z.object({
  sourceProjectId: z.string().min(1, "Missing source project"),
  destProjectId: z.string().min(1, "Missing destination project"),
  amount: z.coerce
    .number()
    .int("Whole rupees only")
    .min(1, "Must be at least ₹1")
    .max(100_000_000, "Too large (max ₹10 crore)"),
  occurredAt: z.coerce.date(),
  description: z.string().trim().min(1, "Description required").max(500),
  notes: z.string().max(2000).optional().default(""),
})
export type CreateMoneyTransferInput = z.infer<typeof CreateMoneyTransferInputSchema>

export const CreateMaterialTransferInputSchema = z.object({
  sourceProjectId: z.string().min(1, "Missing source project"),
  destProjectId: z.string().min(1, "Missing destination project"),
  materialId: z.string().min(1, "Missing material"),
  qty: z.coerce
    .number()
    .positive("Must be > 0")
    .max(1_000_000, "Too large"),
  occurredAt: z.coerce.date(),
  notes: z.string().max(2000).optional().default(""),
})
export type CreateMaterialTransferInput = z.infer<typeof CreateMaterialTransferInputSchema>

export const ReverseTransferInputSchema = z.object({
  transferGroupId: z.string().min(1, "Missing transfer"),
  occurredAt: z.coerce.date().optional(),
  notes: z.string().max(2000).optional().default(""),
})
export type ReverseTransferInput = z.infer<typeof ReverseTransferInputSchema>

// ──────────────────────────────────────────────────────────────────────────
// Phase 6 — display row types (used by /transfers tables)
// ──────────────────────────────────────────────────────────────────────────

export type TransferStatus = "active" | "reversed"

export type MoneyTransferRow = {
  transferGroupId: string         // hex
  occurredAt: Date                 // taken from source leg
  sourceProjectId: string          // hex
  sourceProjectName: string
  destProjectId: string            // hex
  destProjectName: string
  amount: number                   // positive whole rupees
  description: string              // user-supplied portion (without the "Transfer to/from" prefix if discoverable, else full source description)
  status: TransferStatus
  reversedAt: Date | null          // earliest createdAt among reversal legs
  createdBy: string                // userId hex
  createdByName: string | null
}

export type MaterialTransferRow = {
  transferGroupId: string
  occurredAt: Date
  sourceProjectId: string
  sourceProjectName: string
  destProjectId: string
  destProjectName: string
  materialId: string
  materialName: string
  materialUnit: MaterialUnit
  materialUnitOther?: string
  qty: number
  status: TransferStatus
  reversedAt: Date | null
  createdBy: string
  createdByName: string | null
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/transfers/schemas.ts
git commit -m "feat(transfers): add transfer Zod schemas and display types"
```

---

## Task 4 — Add transfer error classes to `lib/transactions/repository.ts`

**Files:**
- Modify: `lib/transactions/repository.ts`

- [ ] **Step 1: Append the three new error classes to the end of the file**

Open `lib/transactions/repository.ts`. After the existing `CannotReverseError` class at the bottom of the file, append:

```ts
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/transactions/repository.ts
git commit -m "feat(transfers): add transfer error classes"
```

---

## Task 5 — Implement `createMoneyTransfer`

**Files:**
- Modify: `lib/transactions/repository.ts`

- [ ] **Step 1: Append the function to the file**

Open `lib/transactions/repository.ts`. After the existing `reverseTransaction` function and before the Phase 5 error classes section, add a new section header and the function:

```ts
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/transactions/repository.ts
git commit -m "feat(transfers): implement createMoneyTransfer"
```

---

## Task 6 — Implement `reverseMoneyTransfer`

**Files:**
- Modify: `lib/transactions/repository.ts`

- [ ] **Step 1: Append the function after `createMoneyTransfer`**

Add:

```ts
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/transactions/repository.ts
git commit -m "feat(transfers): implement reverseMoneyTransfer with race-safe guard"
```

---

## Task 7 — Implement `listMoneyTransfers`

**Files:**
- Modify: `lib/transactions/repository.ts`

- [ ] **Step 1: Append the function and supporting import**

First ensure the `MoneyTransferRow` import is available. At the top of `lib/transactions/repository.ts`, add to existing imports:

```ts
import type { MoneyTransferRow } from "@/lib/transfers/schemas"
```

Then append at the end of the Phase 6 money transfers section:

```ts
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

  // Pull all rows in the date window (by occurredAt of any leg in the group)
  // — but to be sure we get full groups we instead match by transferGroupId
  // having ANY leg in the window. Two-step query: find candidate groupIds,
  // then fetch all rows in those groups.
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

  // Bucket rows by group
  const byGroup = new Map<string, Transaction[]>()
  for (const row of allRows) {
    const key = row.transferGroupId!.toHexString()
    const bucket = byGroup.get(key) ?? []
    bucket.push(row)
    byGroup.set(key, bucket)
  }

  // Collect distinct projectIds and createdBy userIds for name resolution
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
    if (!sourceLeg || !destLeg) continue // malformed group, skip

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

  // Sort newest first by occurredAt, then by _id-ish (transferGroupId desc)
  result.sort((a, b) => {
    const d = b.occurredAt.getTime() - a.occurredAt.getTime()
    if (d !== 0) return d
    return b.transferGroupId.localeCompare(a.transferGroupId)
  })
  return result
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/transactions/repository.ts
git commit -m "feat(transfers): implement listMoneyTransfers"
```

---

## Task 8 — Extend `FinancialTotals` with `transfersIn`/`transfersOut`

**Files:**
- Modify: `lib/transactions/repository.ts`

- [ ] **Step 1: Extend the `FinancialTotals` type**

Find the existing `FinancialTotals` type around line 214:

```ts
export type FinancialTotals = {
  revenue: number
  expenses: number
  net: number
}
```

Replace it with:

```ts
export type FinancialTotals = {
  revenue: number       // unchanged. INCLUDES transfer_in rows (Phase 5 semantics preserved).
  expenses: number      // unchanged. INCLUDES transfer_out rows.
  net: number           // unchanged. revenue - expenses.
  transfersIn: number   // Phase 6 — subset of revenue: sum of transfer_in rows over the same window.
  transfersOut: number  // Phase 6 — subset of expenses: sum of transfer_out rows over the same window.
}
```

- [ ] **Step 2: Update `computeTotals` to populate the new fields**

Find the existing `computeTotals` function. Replace its body with a `$facet` aggregation that computes both the existing per-kind totals and the new transfer subtotals in one round-trip:

```ts
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
```

- [ ] **Step 3: Update `listCrossProjectTotals` to populate the same fields per project + overall**

Find the existing `listCrossProjectTotals`. Replace its body with:

```ts
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
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: TS may complain that `PerProjectTotals` doesn't include the new fields. It does, because `PerProjectTotals = FinancialTotals & { projectId; projectName }` — and `FinancialTotals` was extended in Step 1. If TS still errors, double-check Step 1 was saved correctly.

- [ ] **Step 5: Commit**

```bash
git add lib/transactions/repository.ts
git commit -m "feat(transfers): extend FinancialTotals with transfersIn/Out"
```

---

## Task 9 — Add `InsufficientStockForReversalError` + implement `createMaterialTransfer`

**Files:**
- Modify: `lib/materials/repository.ts`

- [ ] **Step 1: Append the error class and supporting import**

At the top of `lib/materials/repository.ts`, the existing imports already include the material types. Confirm that `Transaction` import is present — it is, from line 3. No new imports needed at the top.

After the existing `MaterialNotFoundError` class at the bottom of the file, append:

```ts
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
```

- [ ] **Step 2: Append `createMaterialTransfer` after the existing `logReturn` function**

Add a new section header and function:

```ts
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
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/materials/repository.ts
git commit -m "feat(transfers): implement createMaterialTransfer + reversal error class"
```

---

## Task 10 — Implement `reverseMaterialTransfer`

**Files:**
- Modify: `lib/materials/repository.ts`

- [ ] **Step 1: Append the function**

After `createMaterialTransfer`, add:

```ts
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
): Promise<{ sourceRevId: ObjectId; destRevId: ObjectId }> {
  const createdBy = new ObjectId(userId)
  const session = client.startSession()
  try {
    let sourceRevId!: ObjectId
    let destRevId!: ObjectId
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

      // Source: restore stock (unconditional upsert; can't fail). This is the
      // project that LOST stock originally and now gets it back.
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
        // Resolve destination project name for the user-facing message
        const destProject = await db
          .collection<{ _id: ObjectId; name: string }>("projects")
          .findOne({ _id: destLeg.projectId }, { session })
        throw new InsufficientStockForReversalError(
          available,
          destLeg.projectId,
          destProject?.name ?? "(unknown project)"
        )
      }

      // Insert paired reversal movement rows. Swap kind/category per leg.
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
    return { sourceRevId, destRevId }
  } finally {
    await session.endSession()
  }
}
```

The function references `TransferNotFoundError`, `CannotReverseTransferError`, and `AlreadyReversedError` from `lib/transactions/repository.ts`. Add this import at the top of `lib/materials/repository.ts`:

```ts
import {
  TransferNotFoundError,
  CannotReverseTransferError,
  AlreadyReversedError,
} from "@/lib/transactions/repository"
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/materials/repository.ts
git commit -m "feat(transfers): implement reverseMaterialTransfer with race-safe guard"
```

---

## Task 11 — Implement `listMaterialTransfers`

**Files:**
- Modify: `lib/materials/repository.ts`

- [ ] **Step 1: Append the function and supporting imports**

At the top of `lib/materials/repository.ts`, add:

```ts
import type { MaterialTransferRow } from "@/lib/transfers/schemas"
import type { Project } from "@/lib/projects/schemas"
```

Then append at the end of the file:

```ts
/**
 * List material transfers across all projects within a date range.
 *
 * Same shape as listMoneyTransfers but on the materialMovements collection.
 * One row per transferGroupId; status reflects whether the group has any
 * reversal legs. Date range matches against any original leg's occurredAt.
 */
export async function listMaterialTransfers(
  range: { from: Date; to: Date }
): Promise<MaterialTransferRow[]> {
  const db = getDb()
  const fromDate = range.from
  const toDate = new Date(range.to)
  toDate.setHours(23, 59, 59, 999)

  const candidates = await db
    .collection<MaterialMovement>("materialMovements")
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

  // Resolve project, material, user names
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
    projectsList.map((p) => [p._id.toHexString(), p.name])
  )
  const materialsList = await db
    .collection<Material>("materials")
    .find({ _id: { $in: [...materialIds].map((id) => new ObjectId(id)) } })
    .toArray()
  const materialById = new Map(
    materialsList.map((m) => [m._id.toHexString(), m])
  )
  const usersList = await db
    .collection<{ _id: ObjectId; name?: string; email?: string }>("users")
    .find({ _id: { $in: [...userIds].map((id) => new ObjectId(id)) } })
    .project<{ _id: ObjectId; name?: string; email?: string }>({ name: 1, email: 1 })
    .toArray()
  const userNameById = new Map(
    usersList.map((u) => [u._id.toHexString(), u.name ?? u.email ?? null])
  )

  const result: MaterialTransferRow[] = []
  for (const [groupKey, rows] of byGroup) {
    const originals = rows.filter((r) => !r.reversalOf)
    const reversals = rows.filter((r) => r.reversalOf)
    const sourceLeg = originals.find((r) => r.category === "transfer_out")
    const destLeg = originals.find((r) => r.category === "transfer_in")
    if (!sourceLeg || !destLeg) continue

    const material = materialById.get(sourceLeg.materialId.toHexString())
    if (!material) continue

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

  result.sort((a, b) => {
    const d = b.occurredAt.getTime() - a.occurredAt.getTime()
    if (d !== 0) return d
    return b.transferGroupId.localeCompare(a.transferGroupId)
  })
  return result
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/materials/repository.ts
git commit -m "feat(transfers): implement listMaterialTransfers"
```

---

## Task 12 — Money transfer server actions (`createMoneyTransferAction` + `reverseMoneyTransferAction`)

**Files:**
- Create: `app/(authed)/transfers/actions.ts`

- [ ] **Step 1: Create the file with both money actions and the shared field-error helper**

Create `app/(authed)/transfers/actions.ts`:

```ts
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
  await requireAdmin()
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
      (await requireAdmin()).id
    )
    revalidatePath("/transfers")
    revalidatePath("/financials")
    // We could revalidate the specific project paths too, but we don't have the
    // projectIds without an extra read. The /financials revalidate is enough to
    // keep cross-project tiles fresh; per-project Financials tabs revalidate on
    // their own navigation.
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(authed\)/transfers/actions.ts
git commit -m "feat(transfers): add money transfer + reverse server actions"
```

(On Windows PowerShell, escape parens with backticks instead: `app/` + `` `(authed)` `` + `/transfers/actions.ts`. Or use `git add .` if your status is clean of other files.)

---

## Task 13 — Material transfer server actions (`createMaterialTransferAction` + `reverseMaterialTransferAction`)

**Files:**
- Modify: `app/(authed)/transfers/actions.ts`

- [ ] **Step 1: Append the two material actions to the file**

Add new imports at the top of `app/(authed)/transfers/actions.ts`:

```ts
import { CreateMaterialTransferInputSchema } from "@/lib/transfers/schemas"
import {
  createMaterialTransfer,
  reverseMaterialTransfer,
  InsufficientStockError,
  InsufficientStockForReversalError,
  getMaterial,
} from "@/lib/materials/repository"
```

Then append at the bottom of the file:

```ts
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
    const { sourceRevId, destRevId } = await reverseMaterialTransfer(
      new ObjectId(transferGroupId),
      { occurredAt, notes },
      user.id
    )
    revalidatePath("/transfers")
    // Per-project material tabs revalidate on next navigation.
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
      const msg =
        err.reason === "is-voided"
          ? "A leg of this transfer is voided; cannot reverse."
          : "Only original transfers can be reversed (this row is itself a reversal)."
      return { ok: false, error: msg }
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors. If `getMaterial` is not exported from `lib/materials/repository.ts`, it already is (lines 24-30 of that file). The other imports added in Step 1 are all named exports defined in Tasks 9-11.

- [ ] **Step 3: Commit**

```bash
git add app/\(authed\)/transfers/actions.ts
git commit -m "feat(transfers): add material transfer + reverse server actions"
```

---

## Task 14 — `MoneyTransferDialog` client component

**Files:**
- Create: `app/(authed)/transfers/money-transfer-dialog.tsx`

- [ ] **Step 1: Create the file**

Read `app/(authed)/projects/[id]/financials/add-income-dialog.tsx` first to mirror its structure (form layout, dialog state-reset key trick, useTransition pattern, error handling). The MoneyTransferDialog will use the same patterns plus a destination-project `<Select>`.

Create `app/(authed)/transfers/money-transfer-dialog.tsx`:

```tsx
"use client"

import { useState, useTransition } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createMoneyTransferAction } from "./actions"

export type ProjectPickerEntry = { id: string; name: string }

export function MoneyTransferButton({
  projects,
  lockedSource,
}: {
  projects: ProjectPickerEntry[]
  lockedSource?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      key={open ? "open" : "closed"}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {lockedSource ? "Transfer money to another project" : "New money transfer"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <MoneyTransferForm
          projects={projects}
          lockedSource={lockedSource}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function MoneyTransferForm({
  projects,
  lockedSource,
  onDone,
}: {
  projects: ProjectPickerEntry[]
  lockedSource?: string
  onDone: () => void
}) {
  const [sourceProjectId, setSourceProjectId] = useState(lockedSource ?? "")
  const [destProjectId, setDestProjectId] = useState("")
  const [amount, setAmount] = useState("")
  const today = new Date().toISOString().slice(0, 10)
  const [occurredAt, setOccurredAt] = useState(today)
  const [description, setDescription] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const destOptions = projects.filter((p) => p.id !== sourceProjectId)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setErrorField(null)
    startTransition(async () => {
      const result = await createMoneyTransferAction({
        sourceProjectId,
        destProjectId,
        amount,
        occurredAt,
        description,
        notes,
      })
      if (result.ok) {
        onDone()
      } else {
        setError(result.error)
        setErrorField(result.field ?? null)
      }
    })
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Transfer money to another project</DialogTitle>
        <DialogDescription>
          Records paired ledger entries in both projects, atomically.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sourceProjectId">From</Label>
          <Select
            value={sourceProjectId}
            onValueChange={(v) => {
              setSourceProjectId(v)
              if (v === destProjectId) setDestProjectId("")
            }}
            disabled={!!lockedSource}
          >
            <SelectTrigger id="sourceProjectId">
              <SelectValue placeholder="Select source project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="destProjectId">To</Label>
          <Select value={destProjectId} onValueChange={setDestProjectId}>
            <SelectTrigger id="destProjectId">
              <SelectValue placeholder="Select destination project" />
            </SelectTrigger>
            <SelectContent>
              {destOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">Amount (₹)</Label>
          <Input
            id="amount"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="occurredAt">Date</Label>
          <Input
            id="occurredAt"
            type="date"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Working capital top-up"
            required
            maxLength={500}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            rows={3}
          />
        </div>
        {error ? (
          <p className="text-sm text-destructive">
            {errorField ? `${errorField}: ` : ""}
            {error}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Transferring…" : "Transfer"}
        </Button>
      </DialogFooter>
    </form>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(authed\)/transfers/money-transfer-dialog.tsx
git commit -m "feat(transfers): add MoneyTransferDialog client component"
```

---

## Task 15 — `MaterialTransferDialog` client component

**Files:**
- Create: `app/(authed)/transfers/material-transfer-dialog.tsx`

- [ ] **Step 1: Create the file**

Pattern mirrors `MoneyTransferDialog` but with `materialId` + `qty` instead of `amount`/`description`. Read `app/(authed)/projects/[id]/materials/log-consumption-dialog.tsx` for the per-row trigger reference.

Create `app/(authed)/transfers/material-transfer-dialog.tsx`:

```tsx
"use client"

import { useState, useTransition } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ProjectPickerEntry } from "./money-transfer-dialog"
import { createMaterialTransferAction } from "./actions"

export type MaterialPickerEntry = {
  id: string
  name: string
  unitLabel: string
}

export function MaterialTransferButton({
  projects,
  materials,
  lockedSource,
  lockedMaterial,
  triggerLabel,
}: {
  projects: ProjectPickerEntry[]
  materials: MaterialPickerEntry[]
  lockedSource?: string
  lockedMaterial?: string
  triggerLabel?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      key={open ? "open" : "closed"}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {triggerLabel ?? "Transfer to another project"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <MaterialTransferForm
          projects={projects}
          materials={materials}
          lockedSource={lockedSource}
          lockedMaterial={lockedMaterial}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function MaterialTransferForm({
  projects,
  materials,
  lockedSource,
  lockedMaterial,
  onDone,
}: {
  projects: ProjectPickerEntry[]
  materials: MaterialPickerEntry[]
  lockedSource?: string
  lockedMaterial?: string
  onDone: () => void
}) {
  const [sourceProjectId, setSourceProjectId] = useState(lockedSource ?? "")
  const [destProjectId, setDestProjectId] = useState("")
  const [materialId, setMaterialId] = useState(lockedMaterial ?? "")
  const [qty, setQty] = useState("")
  const today = new Date().toISOString().slice(0, 10)
  const [occurredAt, setOccurredAt] = useState(today)
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const destOptions = projects.filter((p) => p.id !== sourceProjectId)
  const pickedMaterial = materials.find((m) => m.id === materialId)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setErrorField(null)
    startTransition(async () => {
      const result = await createMaterialTransferAction({
        sourceProjectId,
        destProjectId,
        materialId,
        qty,
        occurredAt,
        notes,
      })
      if (result.ok) {
        onDone()
      } else {
        setError(result.error)
        setErrorField(result.field ?? null)
      }
    })
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Transfer material to another project</DialogTitle>
        <DialogDescription>
          Moves stock between projects atomically. Source stock decremented;
          destination stock incremented.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sourceProjectId">From</Label>
          <Select
            value={sourceProjectId}
            onValueChange={(v) => {
              setSourceProjectId(v)
              if (v === destProjectId) setDestProjectId("")
            }}
            disabled={!!lockedSource}
          >
            <SelectTrigger id="sourceProjectId">
              <SelectValue placeholder="Select source project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="destProjectId">To</Label>
          <Select value={destProjectId} onValueChange={setDestProjectId}>
            <SelectTrigger id="destProjectId">
              <SelectValue placeholder="Select destination project" />
            </SelectTrigger>
            <SelectContent>
              {destOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="materialId">Material</Label>
          <Select
            value={materialId}
            onValueChange={setMaterialId}
            disabled={!!lockedMaterial}
          >
            <SelectTrigger id="materialId">
              <SelectValue placeholder="Select material" />
            </SelectTrigger>
            <SelectContent>
              {materials.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name} ({m.unitLabel})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="qty">
            Quantity {pickedMaterial ? `(${pickedMaterial.unitLabel})` : ""}
          </Label>
          <Input
            id="qty"
            type="number"
            inputMode="decimal"
            min={0.0001}
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="occurredAt">Date</Label>
          <Input
            id="occurredAt"
            type="date"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            rows={3}
          />
        </div>
        {error ? (
          <p className="text-sm text-destructive">
            {errorField ? `${errorField}: ` : ""}
            {error}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Transferring…" : "Transfer"}
        </Button>
      </DialogFooter>
    </form>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(authed\)/transfers/material-transfer-dialog.tsx
git commit -m "feat(transfers): add MaterialTransferDialog client component"
```

---

## Task 16 — `ReverseTransferDialog` client component

**Files:**
- Create: `app/(authed)/transfers/reverse-transfer-dialog.tsx`

- [ ] **Step 1: Create the file**

Read `app/(authed)/projects/[id]/financials/reverse-confirm-dialog.tsx` for the Phase 5 reversal-dialog style to mirror.

Create `app/(authed)/transfers/reverse-transfer-dialog.tsx`:

```tsx
"use client"

import { useState, useTransition } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  reverseMoneyTransferAction,
  reverseMaterialTransferAction,
} from "./actions"

export type TransferReversalKind = "money" | "material"

export function ReverseTransferButton({
  transferGroupId,
  kind,
  summary,
}: {
  transferGroupId: string
  kind: TransferReversalKind
  summary: string  // e.g. "Sunset → Marina · ₹50,000" or "Sunset → Marina · 50 bag Cement"
}) {
  const [open, setOpen] = useState(false)
  return (
    <AlertDialog
      open={open}
      onOpenChange={setOpen}
      key={open ? "open" : "closed"}
    >
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Reverse
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <ReverseTransferForm
          transferGroupId={transferGroupId}
          kind={kind}
          summary={summary}
          onDone={() => setOpen(false)}
        />
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ReverseTransferForm({
  transferGroupId,
  kind,
  summary,
  onDone,
}: {
  transferGroupId: string
  kind: TransferReversalKind
  summary: string
  onDone: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [occurredAt, setOccurredAt] = useState(today)
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const action =
        kind === "money"
          ? reverseMoneyTransferAction
          : reverseMaterialTransferAction
      const result = await action({
        transferGroupId,
        occurredAt,
        notes,
      })
      if (result.ok) {
        onDone()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <AlertDialogHeader>
        <AlertDialogTitle>Reverse this transfer?</AlertDialogTitle>
        <AlertDialogDescription>
          {summary}
          <br />
          A paired reversal entry will be inserted. Both legs will be undone
          atomically. This cannot itself be reversed — to redo, create a new
          transfer.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="occurredAt">Reversal date</Label>
          <Input
            id="occurredAt"
            type="date"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            rows={3}
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
        <AlertDialogAction type="submit" disabled={isPending}>
          {isPending ? "Reversing…" : "Reverse"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </form>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(authed\)/transfers/reverse-transfer-dialog.tsx
git commit -m "feat(transfers): add ReverseTransferDialog client component"
```

---

## Task 17 — `MoneyTransfersTable` server component

**Files:**
- Create: `app/(authed)/transfers/money-transfers-table.tsx`

- [ ] **Step 1: Create the file**

Create `app/(authed)/transfers/money-transfers-table.tsx`:

```tsx
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { MoneyTransferRow } from "@/lib/transfers/schemas"
import { ReverseTransferButton } from "./reverse-transfer-dialog"

const INR = new Intl.NumberFormat("en-IN")

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function MoneyTransfersTable({ rows }: { rows: MoneyTransferRow[] }) {
  if (rows.length === 0) {
    return (
      <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
        No money transfers in this date range.
      </Card>
    )
  }
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">From → To</th>
            <th className="px-4 py-3 text-right">Amount</th>
            <th className="px-4 py-3">Description</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Created by</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.transferGroupId}
              className="border-b border-border last:border-0"
            >
              <td className="px-4 py-3 font-mono text-xs">{fmtDate(r.occurredAt)}</td>
              <td className="px-4 py-3">
                <span>{r.sourceProjectName}</span>
                <span className="px-2 text-muted-foreground">→</span>
                <span>{r.destProjectName}</span>
              </td>
              <td className="px-4 py-3 text-right font-mono">
                ₹{INR.format(r.amount)}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{r.description}</td>
              <td className="px-4 py-3">
                {r.status === "reversed" ? (
                  <Badge variant="secondary">
                    Reversed{r.reversedAt ? ` on ${fmtDate(r.reversedAt)}` : ""}
                  </Badge>
                ) : (
                  <Badge variant="outline">Active</Badge>
                )}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {r.createdByName ?? "—"}
              </td>
              <td className="px-4 py-3 text-right">
                {r.status === "active" ? (
                  <ReverseTransferButton
                    transferGroupId={r.transferGroupId}
                    kind="money"
                    summary={`${r.sourceProjectName} → ${r.destProjectName} · ₹${INR.format(r.amount)}`}
                  />
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(authed\)/transfers/money-transfers-table.tsx
git commit -m "feat(transfers): add MoneyTransfersTable server component"
```

---

## Task 18 — `MaterialTransfersTable` server component

**Files:**
- Create: `app/(authed)/transfers/material-transfers-table.tsx`

- [ ] **Step 1: Create the file**

Create `app/(authed)/transfers/material-transfers-table.tsx`:

```tsx
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { MaterialTransferRow } from "@/lib/transfers/schemas"
import type { MaterialUnit } from "@/lib/materials/schemas"
import { ReverseTransferButton } from "./reverse-transfer-dialog"

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function formatUnit(unit: MaterialUnit, unitOther?: string): string {
  if (unit === "other") return unitOther || "—"
  if (unit === "m2") return "m²"
  if (unit === "m3") return "m³"
  return unit
}

export function MaterialTransfersTable({
  rows,
}: {
  rows: MaterialTransferRow[]
}) {
  if (rows.length === 0) {
    return (
      <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
        No material transfers in this date range.
      </Card>
    )
  }
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">From → To</th>
            <th className="px-4 py-3">Material</th>
            <th className="px-4 py-3 text-right">Qty</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Created by</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const unitLabel = formatUnit(r.materialUnit, r.materialUnitOther)
            return (
              <tr
                key={r.transferGroupId}
                className="border-b border-border last:border-0"
              >
                <td className="px-4 py-3 font-mono text-xs">
                  {fmtDate(r.occurredAt)}
                </td>
                <td className="px-4 py-3">
                  <span>{r.sourceProjectName}</span>
                  <span className="px-2 text-muted-foreground">→</span>
                  <span>{r.destProjectName}</span>
                </td>
                <td className="px-4 py-3">{r.materialName}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {r.qty} {unitLabel}
                </td>
                <td className="px-4 py-3">
                  {r.status === "reversed" ? (
                    <Badge variant="secondary">
                      Reversed{r.reversedAt ? ` on ${fmtDate(r.reversedAt)}` : ""}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Active</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {r.createdByName ?? "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  {r.status === "active" ? (
                    <ReverseTransferButton
                      transferGroupId={r.transferGroupId}
                      kind="material"
                      summary={`${r.sourceProjectName} → ${r.destProjectName} · ${r.qty} ${unitLabel} ${r.materialName}`}
                    />
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(authed\)/transfers/material-transfers-table.tsx
git commit -m "feat(transfers): add MaterialTransfersTable server component"
```

---

## Task 19 — `/transfers` page + admin nav link

**Files:**
- Create: `app/(authed)/transfers/page.tsx`
- Modify: `app/(authed)/layout.tsx`

- [ ] **Step 1: Create the page**

Create `app/(authed)/transfers/page.tsx`:

```tsx
import { requireAdmin } from "@/lib/auth/session"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { listMoneyTransfers } from "@/lib/transactions/repository"
import { listMaterialTransfers } from "@/lib/materials/repository"
import { listProjects } from "@/lib/projects/repository"
import { listCatalog } from "@/lib/materials/repository"
import { GlobalFilters } from "@/app/(authed)/financials/global-filters"
import { MoneyTransfersTable } from "./money-transfers-table"
import { MaterialTransfersTable } from "./material-transfers-table"
import { MoneyTransferButton } from "./money-transfer-dialog"
import { MaterialTransferButton } from "./material-transfer-dialog"

function startOfYear(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), 0, 1)
}

function parseDate(raw: string | undefined, fallback: Date): Date {
  if (!raw) return fallback
  const d = new Date(raw)
  return isNaN(d.getTime()) ? fallback : d
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function formatUnit(unit: string, unitOther?: string): string {
  if (unit === "other") return unitOther || "—"
  if (unit === "m2") return "m²"
  if (unit === "m3") return "m³"
  return unit
}

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireAdmin()
  const sp = await searchParams
  const defaultFrom = startOfYear()
  const defaultTo = new Date()
  const range = {
    from: parseDate(sp.from, defaultFrom),
    to: parseDate(sp.to, defaultTo),
  }

  const [moneyRows, materialRows, projects, catalog] = await Promise.all([
    listMoneyTransfers(range),
    listMaterialTransfers(range),
    listProjects(),
    listCatalog(),
  ])

  const projectOptions = projects.map((p) => ({
    id: p._id.toHexString(),
    name: p.name,
  }))
  const materialOptions = catalog.map((m) => ({
    id: m._id.toHexString(),
    name: m.name,
    unitLabel: formatUnit(m.unit, m.unitOther),
  }))

  return (
    <div className="flex flex-col gap-4 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Transfers</h1>
        <p className="text-sm text-muted-foreground">
          Inter-project money and material transfers, across all projects.
        </p>
      </header>
      <GlobalFilters defaultFrom={isoDate(defaultFrom)} defaultTo={isoDate(defaultTo)} />
      <Tabs defaultValue="money" className="w-full">
        <TabsList>
          <TabsTrigger value="money">Money</TabsTrigger>
          <TabsTrigger value="material">Material</TabsTrigger>
        </TabsList>
        <TabsContent value="money" className="flex flex-col gap-3">
          <div className="flex justify-end">
            <MoneyTransferButton projects={projectOptions} />
          </div>
          <MoneyTransfersTable rows={moneyRows} />
        </TabsContent>
        <TabsContent value="material" className="flex flex-col gap-3">
          <div className="flex justify-end">
            <MaterialTransferButton
              projects={projectOptions}
              materials={materialOptions}
            />
          </div>
          <MaterialTransfersTable rows={materialRows} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

- [ ] **Step 2: Add the admin-only "Transfers" link to the authed nav**

Open `app/(authed)/layout.tsx`. Find the admin-only nav block (lines 29-45 in the current file — the `{isAdmin ? (<>...</>) : null}` fragment that contains the Catalog and Financials links). Add the Transfers link immediately after the Financials link:

```tsx
{isAdmin ? (
  <>
    <Separator orientation="vertical" className="h-5" />
    <Link
      href="/catalog"
      className="text-sm text-muted-foreground hover:text-foreground"
    >
      Catalog
    </Link>
    <Link
      href="/financials"
      className="text-sm text-muted-foreground hover:text-foreground"
    >
      Financials
    </Link>
    <Link
      href="/transfers"
      className="text-sm text-muted-foreground hover:text-foreground"
    >
      Transfers
    </Link>
  </>
) : null}
```

- [ ] **Step 3: Verify TypeScript compiles and dev server boots**

```bash
pnpm tsc --noEmit
pnpm dev
```

Expected: no TS errors. Open `http://localhost:3000/transfers` in a browser as an admin. The page should render with the two tabs, an empty state ("No money transfers in this date range." / "No material transfers in this date range."), a "New money transfer" / "Transfer to another project" button per tab, and the date-range filter.

Stop the dev server with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add app/\(authed\)/transfers/page.tsx app/\(authed\)/layout.tsx
git commit -m "feat(transfers): add /transfers page and admin nav link"
```

---

## Task 20 — Per-project Financials toolbar: Money transfer button

**Files:**
- Modify: `app/(authed)/projects/[id]/financials/financials-view.tsx`
- Modify: `app/(authed)/projects/[id]/page.tsx` (to thread `projects` list down)

- [ ] **Step 1: Pass the full projects list to FinancialsView**

Open `app/(authed)/projects/[id]/page.tsx`. The page already calls `listProjects` or has access to project data; if not, add a `listProjects()` call to the `Promise.all` that fetches financials data for admin sessions. Then pass `projects` as a prop to `<FinancialsView>`.

Sketch (locate the existing Promise.all in the admin branch around line 100, add `listProjects()`):

```tsx
const [rows, totals, projects] = await Promise.all([
  listLedger(/* ... */),
  computeTotals(/* ... */),
  listProjects(),
])
```

Then later when rendering `<FinancialsView>`, pass:

```tsx
<FinancialsView
  projectId={projectId}
  rows={rows}
  totals={totals}
  defaultFrom={isoDate(defaultFromDate)}
  defaultTo={isoDate(defaultToDate)}
  projects={projects.map((p) => ({
    id: p._id.toHexString(),
    name: p.name,
  }))}
/>
```

Add the import:

```tsx
import { listProjects } from "@/lib/projects/repository"
```

- [ ] **Step 2: Update FinancialsView to render the Money transfer button**

Open `app/(authed)/projects/[id]/financials/financials-view.tsx`. Add the import and the new prop, and render the button in the toolbar row:

```tsx
import { MoneyTransferButton, type ProjectPickerEntry } from "@/app/(authed)/transfers/money-transfer-dialog"
```

Extend the `FinancialsView` prop type:

```tsx
export function FinancialsView({
  projectId,
  rows,
  totals,
  defaultFrom,
  defaultTo,
  projects,
}: {
  projectId: string
  rows: Transaction[]
  totals: FinancialTotals
  defaultFrom: string
  defaultTo: string
  projects: ProjectPickerEntry[]
}) {
```

In the toolbar `<div className="flex gap-2">` that currently holds `AddIncomeButton` + `AddExpenseButton`, add the MoneyTransferButton:

```tsx
<div className="flex gap-2">
  <AddIncomeButton projectId={projectId} />
  <AddExpenseButton projectId={projectId} />
  <MoneyTransferButton projects={projects} lockedSource={projectId} />
</div>
```

- [ ] **Step 3: Verify**

```bash
pnpm tsc --noEmit
pnpm dev
```

Navigate to `/projects/{some-id}` as admin → Financials tab. The toolbar should now show three buttons: Add income, Add expense, Transfer money to another project. Click the transfer button; the dialog opens with the source project pre-selected and disabled. Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add app/\(authed\)/projects/\[id\]/page.tsx app/\(authed\)/projects/\[id\]/financials/financials-view.tsx
git commit -m "feat(transfers): add Money transfer button to Financials tab toolbar"
```

---

## Task 21 — Per-project Materials tab: Material transfer row action

**Files:**
- Modify: `app/(authed)/projects/[id]/materials/materials-table.tsx`
- Modify: `app/(authed)/projects/[id]/page.tsx`

- [ ] **Step 1: Pass the projects list into MaterialsTable**

In `app/(authed)/projects/[id]/page.tsx`, the materials-tab branch already fetches data via `listProjectMaterials` and `listCatalog`. Add `listProjects()` if not already in the Promise.all (it should be after Task 20 — reuse it). Then pass `projects` as a prop to `<MaterialsTable>`:

```tsx
<MaterialsTable
  projectId={projectId}
  role={role}
  rows={pmRows}
  catalog={catalog}
  projects={projects.map((p) => ({
    id: p._id.toHexString(),
    name: p.name,
  }))}
/>
```

- [ ] **Step 2: Add the per-row transfer action**

Open `app/(authed)/projects/[id]/materials/materials-table.tsx`. Add imports:

```tsx
import {
  MaterialTransferButton,
  type MaterialPickerEntry,
} from "@/app/(authed)/transfers/material-transfer-dialog"
import type { ProjectPickerEntry } from "@/app/(authed)/transfers/money-transfer-dialog"
```

Extend the `MaterialsTable` prop type to accept `projects`:

```tsx
export function MaterialsTable({
  projectId,
  role,
  rows,
  catalog,
  projects,
}: {
  projectId: string
  role: Role
  rows: ProjectMaterialListing[]
  catalog: CatalogPickerEntry[]
  projects: ProjectPickerEntry[]
}) {
```

Thread `projects` down to `MaterialRow`. Update its prop signature and the JSX:

```tsx
<MaterialRow
  key={String(r.material._id)}
  row={r}
  projectId={projectId}
  isAdmin={isAdmin}
  showSpent={showSpent}
  role={role}
  projects={projects}
/>
```

Extend `MaterialRow`:

```tsx
function MaterialRow({
  row,
  projectId,
  isAdmin,
  showSpent,
  role,
  projects,
}: {
  row: ProjectMaterialListing
  projectId: string
  isAdmin: boolean
  showSpent: boolean
  role: Role
  projects: ProjectPickerEntry[]
}) {
```

In the row's actions cell (the `<div className="flex flex-wrap justify-end gap-2">` block), add a new admin-only `MaterialTransferButton` after the `RecordPurchaseButton`:

```tsx
{isAdmin ? (
  <MaterialTransferButton
    projects={projects}
    materials={[
      {
        id: String(material._id),
        name: material.name,
        unitLabel,
      } satisfies MaterialPickerEntry,
    ]}
    lockedSource={projectId}
    lockedMaterial={String(material._id)}
    triggerLabel="Transfer to project"
  />
) : null}
```

The MaterialPickerEntry list contains only this row's material since the dialog's material select is pre-locked. We still pass the entry so the dialog can render the chosen label.

- [ ] **Step 3: Verify**

```bash
pnpm tsc --noEmit
pnpm dev
```

Navigate to `/projects/{id}` as admin → Materials tab. Each row's actions cell should now include a "Transfer to project" button (admin only). Click it; the dialog opens with source project + material pre-locked. Floor manager session should not see the new button.

Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add app/\(authed\)/projects/\[id\]/page.tsx app/\(authed\)/projects/\[id\]/materials/materials-table.tsx
git commit -m "feat(transfers): add Material transfer row action to Materials tab"
```

---

## Task 22 — Phase 5 per-project tile subtitle (transfersIn/Out)

**Files:**
- Modify: `app/(authed)/projects/[id]/financials/financials-view.tsx`

- [ ] **Step 1: Update the Tile component and Revenue/Expenses tiles to show subtitle**

Open `financials-view.tsx`. Replace the existing `Tile` component with a version that supports an optional `subtitle`:

```tsx
function Tile({
  label,
  value,
  subtitle,
  tone,
}: {
  label: string
  value: string
  subtitle?: string | null
  tone?: "gain" | "loss"
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={
          "font-mono text-xl " +
          (tone === "loss" ? "text-destructive" : "")
        }
      >
        {value}
      </span>
      {subtitle ? (
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      ) : null}
    </div>
  )
}
```

Then update the three `<Tile>` calls in `FinancialsView` to pass subtitles for Revenue and Expenses:

```tsx
<Tile
  label="Revenue"
  value={`₹${INR.format(totals.revenue)}`}
  subtitle={
    totals.transfersIn > 0
      ? `incl. ₹${INR.format(totals.transfersIn)} transfers in`
      : null
  }
/>
<Tile
  label="Expenses"
  value={`₹${INR.format(totals.expenses)}`}
  subtitle={
    totals.transfersOut > 0
      ? `incl. ₹${INR.format(totals.transfersOut)} transfers out`
      : null
  }
/>
<Tile
  label="Net"
  value={`${totals.net < 0 ? "−" : ""}₹${INR.format(Math.abs(totals.net))}`}
  tone={totals.net < 0 ? "loss" : "gain"}
/>
```

- [ ] **Step 2: Verify**

```bash
pnpm tsc --noEmit
```

Expected: no errors. Visual verification deferred to T-tasks.

- [ ] **Step 3: Commit**

```bash
git add app/\(authed\)/projects/\[id\]/financials/financials-view.tsx
git commit -m "feat(transfers): per-project Financials tiles show transfersIn/Out subtitle"
```

---

## Task 23 — Phase 5 global `/financials` page: tiles + per-project table show transfersIn/Out

**Files:**
- Modify: `app/(authed)/financials/page.tsx`
- Modify: `app/(authed)/financials/per-project-table.tsx`

- [ ] **Step 1: Update the overall tiles in `/financials/page.tsx`**

Open `app/(authed)/financials/page.tsx`. The `Tile` component is locally defined at lines 70-93. Replace it with a subtitle-aware version (same shape as the per-project Tile from Task 22):

```tsx
function Tile({
  label,
  value,
  subtitle,
  tone,
}: {
  label: string
  value: string
  subtitle?: string | null
  tone?: "gain" | "loss"
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={
          "font-mono text-xl " + (tone === "loss" ? "text-destructive" : "")
        }
      >
        {value}
      </span>
      {subtitle ? (
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      ) : null}
    </div>
  )
}
```

Then update the three `<Tile>` calls in the `GlobalFinancialsPage` body (currently lines 56-62) to pass subtitles on Revenue/Expenses:

```tsx
<Tile
  label="Revenue"
  value={`₹${INR.format(overall.revenue)}`}
  subtitle={
    overall.transfersIn > 0
      ? `incl. ₹${INR.format(overall.transfersIn)} transfers in`
      : null
  }
/>
<Tile
  label="Expenses"
  value={`₹${INR.format(overall.expenses)}`}
  subtitle={
    overall.transfersOut > 0
      ? `incl. ₹${INR.format(overall.transfersOut)} transfers out`
      : null
  }
/>
<Tile
  label="Net"
  value={`${overall.net < 0 ? "−" : ""}₹${INR.format(Math.abs(overall.net))}`}
  tone={overall.net < 0 ? "loss" : "gain"}
/>
```

- [ ] **Step 2: Update `per-project-table.tsx` to render the subtitle inside Revenue/Expenses cells**

Read `app/(authed)/financials/per-project-table.tsx`. Locate the cells that render `row.revenue` and `row.expenses`. Add a small muted subtitle line below the amount when `row.transfersIn > 0` / `row.transfersOut > 0`:

```tsx
<td className="px-4 py-3 text-right font-mono">
  ₹{INR.format(row.revenue)}
  {row.transfersIn > 0 ? (
    <div className="text-xs text-muted-foreground font-sans">
      incl. ₹{INR.format(row.transfersIn)} transfers in
    </div>
  ) : null}
</td>
```

Same pattern for Expenses with `transfersOut`.

- [ ] **Step 3: Verify**

```bash
pnpm tsc --noEmit
```

Expected: no errors. Visual check via dev server in T-tasks.

- [ ] **Step 4: Commit**

```bash
git add app/\(authed\)/financials/page.tsx app/\(authed\)/financials/per-project-table.tsx
git commit -m "feat(transfers): /financials tiles and per-project table show transfersIn/Out"
```

---

## Task 24 — Phase 5 ledger-table: `↔ {OtherProject}` badge on transfer rows

**Files:**
- Modify: `app/(authed)/projects/[id]/financials/ledger-table.tsx`
- Modify: `app/(authed)/projects/[id]/page.tsx` (pass `currentProjectId` + project-name map to ledger-table)

- [ ] **Step 1: Determine the "other project" for each transfer row**

A transfer row's "other project" is found by joining via `transferGroupId` — the row with the same transferGroupId but a different `projectId`. To avoid a per-row lookup in the table, batch this in the parent.

Open `app/(authed)/projects/[id]/page.tsx`. After `listLedger` returns `rows`, do a single batch lookup:

```tsx
import { getDb } from "@/lib/db/client"
import type { Transaction } from "@/lib/transactions/schemas"

// ... in the admin branch, after listLedger:
const transferGroupIds = rows
  .filter((r) => r.transferGroupId)
  .map((r) => r.transferGroupId!)

let otherProjectByRowId = new Map<string, string>() // rowId -> otherProjectName
if (transferGroupIds.length > 0) {
  const db = getDb()
  const peerRows = await db
    .collection<Transaction>("transactions")
    .find({
      transferGroupId: { $in: transferGroupIds },
      projectId: { $ne: new ObjectId(projectId) },
    })
    .project<{ _id: ObjectId; transferGroupId?: ObjectId; projectId: ObjectId }>({
      transferGroupId: 1,
      projectId: 1,
    })
    .toArray()
  // Group peer rows by transferGroupId → projectId
  const peerProjectByGroup = new Map<string, ObjectId>()
  for (const peer of peerRows) {
    if (peer.transferGroupId) {
      peerProjectByGroup.set(peer.transferGroupId.toHexString(), peer.projectId)
    }
  }
  // Resolve project names
  const peerProjectIds = [...new Set(peerProjectByGroup.values())].map(
    (id) => id
  )
  const peerProjects = await db
    .collection<{ _id: ObjectId; name: string }>("projects")
    .find({ _id: { $in: peerProjectIds } })
    .project<{ _id: ObjectId; name: string }>({ name: 1 })
    .toArray()
  const peerProjectNameById = new Map(
    peerProjects.map((p) => [p._id.toHexString(), p.name])
  )
  // Build rowId -> otherProjectName
  for (const row of rows) {
    if (!row.transferGroupId) continue
    const peerId = peerProjectByGroup.get(row.transferGroupId.toHexString())
    if (!peerId) continue
    const peerName =
      peerProjectNameById.get(peerId.toHexString()) ?? "(unknown project)"
    otherProjectByRowId.set(row._id.toHexString(), peerName)
  }
}
```

Add `import { ObjectId } from "mongodb"` if not already present.

Pass `otherProjectByRowId` into `<LedgerTable>`:

```tsx
<LedgerTable
  rows={rows}
  otherProjectByRowId={otherProjectByRowId}
/>
```

- [ ] **Step 2: Render the badge in LedgerTable**

Open `app/(authed)/projects/[id]/financials/ledger-table.tsx`. Extend the prop type:

```tsx
export function LedgerTable({
  rows,
  otherProjectByRowId,
}: {
  rows: Transaction[]
  otherProjectByRowId: Map<string, string>
}) {
```

Locate the cell that renders `row.description`. Add an inline `↔` badge after the description when the row has a transferGroupId:

```tsx
<td className="px-4 py-3">
  {row.description}
  {row.transferGroupId ? (
    <Badge variant="outline" className="ml-2 text-xs">
      ↔ {otherProjectByRowId.get(row._id.toHexString()) ?? "Other project"}
    </Badge>
  ) : null}
  {/* existing "Reversal of" badge logic stays as-is */}
</td>
```

Import the Badge component if not already imported:

```tsx
import { Badge } from "@/components/ui/badge"
```

- [ ] **Step 3: Verify**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/\(authed\)/projects/\[id\]/page.tsx app/\(authed\)/projects/\[id\]/financials/ledger-table.tsx
git commit -m "feat(transfers): ledger-table shows ↔ Other Project badge on transfer rows"
```

---

## Task 25 — Manual verification (T-tasks from spec)

**Files:** none (verification only).

The spec enumerates four T-task groups. Execute each group, recording observed behavior. Fix issues found here before declaring the phase done.

- [ ] **Step 1: Start dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Money transfer T-tasks**

For each, log in as admin (`btechy4@gmail.com`).

- **T-money-1.** Pick two projects A and B. Note pre-transfer Revenue/Expenses tile values on each. Navigate to `/projects/A` → Financials tab → "Transfer money to another project" → fill ₹50,000 to B → submit. Toast appears. `/transfers` Money tab shows the transfer with both project names. Project A's Expenses tile went up by ₹50,000; Project B's Revenue went up by ₹50,000.
- **T-money-2.** On Project A's Financials tab, the Expenses tile shows `incl. ₹50,000 transfers out` subtitle. On Project B's, Revenue shows `incl. ₹50,000 transfers in`. Visit `/financials` — overall Revenue and Expenses both went up by ₹50,000, but **Net is unchanged** vs pre-transfer (because the two legs cancel in the overall net).
- **T-money-3.** Go to `/transfers` → Money tab → Reverse the transfer just created → confirm. Toast appears. The transfer's Status changed to `Reversed on YYYY-MM-DD`. Both project tiles return to pre-transfer values (subtitles disappear if no other transfers exist).

  In a separate terminal, verify the 4-row group in mongosh:

  ```js
  use wangredev
  db.transactions.find({ transferGroupId: ObjectId("<id-from-/transfers>") }).pretty()
  // Expect 4 rows: 2 originals (no reversalOf), 2 reversals (reversalOf set)
  ```

- **T-money-4.** Create another transfer A→B for ₹1000. Open `/transfers` in two browser tabs. In tab 1, click Reverse and confirm. In tab 2, click Reverse and confirm. Tab 1 succeeds; tab 2's dialog shows error message `"This transfer has already been reversed."`
- **T-money-5.** Open `/projects/A` Financials tab → New money transfer dialog. Verify the destination dropdown excludes Project A. (UI guard.) Attempt to forge a same-project request via curl:

  ```bash
  curl -X POST http://localhost:3000/api/... # Not applicable — server actions are RSC, not HTTP endpoints. Use mongosh or skip this part.
  ```

  Alternative: temporarily edit the dialog client code to allow same-project selection (or directly call the action with same source/dest), confirm action returns `{ ok: false, error: "Source and destination must be different projects." }`. Revert the code change. *(Optional defense-in-depth check.)*

- [ ] **Step 3: Material transfer T-tasks**

- **T-mat-1.** Pick a material with stock > 50 in Project A (e.g., Cement, 100 bags). On `/projects/A` → Materials tab → on the Cement row → "Transfer to project" → fill 50 → destination B → submit. Toast confirms. Project A's Cement stock drops by 50; Project B's Cement row appears (or stock increases by 50). `/transfers` Material tab shows the transfer.

  Mongosh check:

  ```js
  use wangredev
  db.projectMaterials.find({ materialId: ObjectId("<cement-id>") }).pretty()
  // Verify source decremented, dest incremented/upserted
  ```

- **T-mat-2.** Try to transfer 1000 bags of Cement from A → B (more than A has). Action returns `{ ok: false, error: "Insufficient stock — only N available.", field: "qty" }`. Form shows error.
- **T-mat-3.** Reverse the T-mat-1 transfer from `/transfers`. Source A stock back to original. Dest B stock back to original. 4-row group exists in `db.materialMovements.find({ transferGroupId: ObjectId("…") })`.
- **T-mat-4.** Create a new transfer A→B for 50 bags Cement. Now go to B's Materials tab, log consumption of 50 bags (or transfer all 50 elsewhere). Then go to `/transfers` and try to Reverse the original A→B transfer. Action returns `"Cannot reverse: {B} only has 0 remaining."` Dialog shows this error; reversal does not happen.
- **T-mat-5.** Create another transfer, then race two browser tabs reversing it. One succeeds; the other shows `"This transfer has already been reversed."`

- [ ] **Step 4: Display T-tasks**

- **T-disp-1.** Go to `/projects/A` → Financials tab. Find the transfer rows in the ledger. Each shows a `↔ {OtherProjectName}` badge next to its description.
- **T-disp-2.** For a reversed transfer's reversal row: the row shows both the existing Phase 5 `Reversal of …` badge AND the `↔` badge.
- **T-disp-3.** With no transfers in the date range, the Revenue/Expenses tiles should NOT show a subtitle. With transfers, they should. Change date filter to a window with no transfers → subtitle disappears. Change back → returns.

- [ ] **Step 5: Auth T-tasks**

- **T-auth-1.** Log out, log in as a floor manager (any non-admin user). Header nav should NOT show "Transfers". Directly navigate to `http://localhost:3000/transfers` → redirected to `/` (per `requireAdmin` behavior). On any `/projects/[id]`, Materials tab rows should NOT show "Transfer to project" button.
- **T-auth-2.** As FM, attempt to invoke server actions directly. Easiest: open the React DevTools console while on a project page, try `import('/_next/...transfers/actions').then(...)` — or simply confirm via T-auth-1 that no UI exposes them. Defense-in-depth is `requireAdmin()` as the first line of every transfers action, which is already in code per Tasks 12 + 13.

- [ ] **Step 6: Stop dev server**

Ctrl+C the dev server.

- [ ] **Step 7: No commit needed for this task** (verification only). If any T-task failed, file the bug and fix in a follow-up task before proceeding to Task 26.

---

## Task 26 — Final build/lint gate + summary commit

**Files:** none (verification + optional bookkeeping commit).

- [ ] **Step 1: Type-check the whole repo**

```bash
pnpm tsc --noEmit
```

Expected: zero new errors. If errors exist, they must be fixed before the phase is done.

- [ ] **Step 2: Lint the whole repo**

```bash
pnpm lint
```

Expected: zero new errors. Fix any new lint warnings introduced by Phase 6.

- [ ] **Step 3: Inspect commit history**

```bash
git log --oneline master..HEAD
```

Expected: a sequence of `feat(transfers): …` and `docs(phase-6):` commits in logical order.

- [ ] **Step 4: (Optional) squash or rebase if commit history is messy**

User preference: phase branches in this repo are merged with commit history preserved (Phase 5 had 71 commits on its branch when merged). If the history is clean, leave it. If there were many fix-up commits during T-task debugging, consider an interactive rebase to tidy up before merge. **Do not amend or rebase commits that have been pushed.**

- [ ] **Step 5: Report ready-to-merge to the user**

Do not merge to `master` and do not push to `origin` without explicit user instruction. Per the project's locked-in convention, merging is a user action.

Suggested handoff message: "Phase 6 implementation complete on `feat/phase-6-transfers`. All T-tasks passed. tsc + lint green. Ready to merge to local master when you say."

---

## Summary

- **Tasks:** 26 (1 branch cut, 1 schema+index, 9 repository/action tasks, 8 UI tasks, 4 Phase 5 extension tasks, 2 verification + final gate tasks).
- **Commits:** ~26 (one per task).
- **Files created:** 8 (1 in `lib/transfers/`, 7 in `app/(authed)/transfers/`).
- **Files modified:** ~12 (schemas, repositories, init-db, nav, Phase 5 financials view + ledger-table + global page + per-project table, per-project page, materials-table).
- **No new dependencies, no new shadcn primitives, no schema enum migrations.**
