# Phase 5 — Financials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-05-15-phase-5-financials-design.md`](../superpowers/specs/2026-05-15-phase-5-financials-design.md) (committed in `8f93824`).

**Goal:** Light up the admin-only Financials tab on `/projects/[id]` with 3 filter-aware summary tiles + filtered ledger, add an admin-only `/financials` top-level cross-project view, and introduce reversing entries as the accounting-style correction mechanism alongside Phase 3's existing soft-void.

**Architecture:** One schema addition (`reversalOf?: ObjectId` on `transactions`) and one new sparse index. Two new correction paths: soft-void (existing, extended to ad-hoc rows) and reversing entry (new row with `reversalOf` FK + negated aggregation math). Hybrid server/client tab pattern from Phases 3/4: server-rendered ledger with URL-synced client filter chips, both passed as `financials` ReactNode prop into the existing `<ProjectTabs>`. New top-level admin-only `/financials` route shows the same 3 tiles aggregated across all projects with a per-project breakdown. One new shadcn primitive (`dropdown-menu`).

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript, native `mongodb` driver with transactions (Atlas replica set), Zod, Tailwind v4 + shadcn/ui radix-nova. One new shadcn primitive (`dropdown-menu`).

**Branch:** Cut `feat/phase-5-financials` from local `master` (currently `8f93824`). Do **not** push to origin until the user explicitly asks.

---

## File Structure

**Create:**
- `app/(authed)/projects/[id]/financials/financials-view.tsx` — server component, composes summary tiles + filters + ledger table.
- `app/(authed)/projects/[id]/financials/ledger-filters.tsx` — client component, URL-synced filter chips (date range + kind + category + voided toggle).
- `app/(authed)/projects/[id]/financials/ledger-table.tsx` — server component, ledger rows with conditional badges + actions cell.
- `app/(authed)/projects/[id]/financials/row-actions-menu.tsx` — client component, DropdownMenu with Void/Reverse buttons (conditional per row state).
- `app/(authed)/projects/[id]/financials/add-income-dialog.tsx` — client component, admin form.
- `app/(authed)/projects/[id]/financials/add-expense-dialog.tsx` — client component, admin form.
- `app/(authed)/projects/[id]/financials/void-confirm-dialog.tsx` — client component, AlertDialog.
- `app/(authed)/projects/[id]/financials/reverse-confirm-dialog.tsx` — client component, AlertDialog with optional date input.
- `app/(authed)/projects/[id]/financials/actions.ts` — server actions: `createAdhocIncome`, `createAdhocExpense`, `voidTransaction`, `reverseTransaction`.
- `app/(authed)/financials/page.tsx` — admin-only top-level cross-project page.
- `app/(authed)/financials/global-filters.tsx` — client component, date-range only.
- `app/(authed)/financials/per-project-table.tsx` — server component, breakdown table with per-project links.

**Modify:**
- `lib/transactions/schemas.ts` — add `reversalOf?: ObjectId` on `Transaction` type, plus new Zod schemas (`LedgerFiltersSchema`, `CreateAdhocIncomeInputSchema`, `CreateAdhocExpenseInputSchema`, `VoidTransactionInputSchema`, `ReverseTransactionInputSchema`).
- `lib/transactions/repository.ts` — add `listLedger`, `computeTotals`, `listCrossProjectTotals`, `voidTransaction`, `reverseTransaction`, and new error classes (`TransactionNotFoundError`, `TransactionAlreadyVoidedError`, `CannotReverseError`).
- `app/(authed)/projects/[id]/project-tabs.tsx` — add `financials?: ReactNode` prop. Replace the existing admin-only placeholder.
- `app/(authed)/projects/[id]/page.tsx` — for admin sessions only, parse search params into `LedgerFilters`, fetch `listLedger` + `computeTotals` in the existing `Promise.all`, pass `<FinancialsView>` to `<ProjectTabs>`.
- `app/(authed)/layout.tsx` — add admin-only "Financials" link in header nav (sibling to existing Catalog link).
- `scripts/init-db.mjs` — append `{ reversalOf: 1 }` sparse index for `transactions`.

**Add via `npx shadcn@latest add`:**
- `dropdown-menu`.

---

## Task 1 — Cut the feature branch

**Files:** none.

- [ ] **Step 1: Verify clean state on `master`**

```bash
git status
git log --oneline -3
```

Expected: working tree clean, HEAD at `8f93824` (the Phase 5 design-doc commit).

- [ ] **Step 2: Cut the branch**

```bash
git checkout -b feat/phase-5-financials
```

Expected: `Switched to a new branch 'feat/phase-5-financials'`.

- [ ] **Step 3: No commit yet.**

Subsequent tasks commit onto the branch. Do not push.

---

## Task 2 — Install shadcn dropdown-menu primitive

**Files:**
- Create: `components/ui/dropdown-menu.tsx`

- [ ] **Step 1: Check whether it exists**

```bash
ls components/ui/dropdown-menu.tsx
```

If present, skip to Step 3.

- [ ] **Step 2: Run shadcn add**

```bash
npx shadcn@latest add dropdown-menu
```

Expected: `components/ui/dropdown-menu.tsx` appears. Accept `--yes` if prompted.

- [ ] **Step 3: Verify diff**

```bash
git status
```

Expected: only `components/ui/dropdown-menu.tsx` is new, plus possibly `package.json` / `package-lock.json`.

- [ ] **Step 4: Commit**

```bash
git add components/ui/dropdown-menu.tsx package.json package-lock.json
git commit -m "chore: add shadcn dropdown-menu primitive"
```

If `package.json` / `package-lock.json` weren't touched, drop them from the `git add`.

---

## Task 3 — Extend `db:init` script with the reversal index

**Files:**
- Modify: `scripts/init-db.mjs`

- [ ] **Step 1: Replace the script body**

Open `scripts/init-db.mjs` and replace the contents with:

```js
import { MongoClient } from "mongodb"

const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB
if (!uri || !dbName) {
  console.error("Set MONGODB_URI and MONGODB_DB before running.")
  process.exit(1)
}

const client = new MongoClient(uri)
await client.connect()
const db = client.db(dbName)

// Phase 1
await db.collection("users").createIndex({ email: 1 }, { unique: true })

// Phase 2 — projects
await db.collection("projects").createIndex({ createdAt: -1 })
await db.collection("projects").createIndex({ name: 1 })

// Phase 2 — units (one collection, type discriminator)
await db.collection("units").createIndex({ projectId: 1, type: 1, status: 1 })
await db
  .collection("units")
  .createIndex({ projectId: 1, type: 1, number: 1 }, { unique: true })
await db.collection("units").createIndex({ status: 1, soldAt: -1 })

// Phase 3 — transactions (append-only with soft-void)
await db
  .collection("transactions")
  .createIndex({ projectId: 1, occurredAt: -1 })
await db
  .collection("transactions")
  .createIndex({ projectId: 1, kind: 1, voided: 1 })
await db
  .collection("transactions")
  .createIndex({ unitId: 1, voided: 1 })

// Phase 4 — materials catalog (global)
await db
  .collection("materials")
  .createIndex({ name: 1 }, { collation: { locale: "en", strength: 2 } })

// Phase 4 — per-project stock counter
await db
  .collection("projectMaterials")
  .createIndex({ projectId: 1, materialId: 1 }, { unique: true })
await db.collection("projectMaterials").createIndex({ projectId: 1 })

// Phase 4 — movement event log
await db
  .collection("materialMovements")
  .createIndex({ projectId: 1, materialId: 1, occurredAt: -1 })
await db
  .collection("materialMovements")
  .createIndex({ projectId: 1, kind: 1, voided: 1 })
await db
  .collection("materialMovements")
  .createIndex({ transactionId: 1 }, { sparse: true })

// Phase 5 — reversal linkage on transactions
await db
  .collection("transactions")
  .createIndex({ reversalOf: 1 }, { sparse: true })

console.log(
  "Indexes ensured: users.email (unique); " +
    "projects.createdAt, projects.name; " +
    "units.(projectId,type,status), units.(projectId,type,number) unique, units.(status,soldAt); " +
    "transactions.(projectId,occurredAt), transactions.(projectId,kind,voided), transactions.(unitId,voided), transactions.reversalOf sparse; " +
    "materials.name (case-insensitive); " +
    "projectMaterials.(projectId,materialId) unique, projectMaterials.(projectId); " +
    "materialMovements.(projectId,materialId,occurredAt), materialMovements.(projectId,kind,voided), materialMovements.(transactionId) sparse"
)

await client.close()
```

- [ ] **Step 2: Run it**

```bash
npm run db:init
```

Expected: one log line listing all indexes including the new `transactions.reversalOf sparse`. Exit 0. Re-run once for idempotency.

- [ ] **Step 3: Commit**

```bash
git add scripts/init-db.mjs
git commit -m "chore(db): add transactions.reversalOf sparse index for Phase 5"
```

---

## Task 4 — Transactions schema additions

**Files:**
- Modify: `lib/transactions/schemas.ts`

- [ ] **Step 1: Replace the file**

Open `lib/transactions/schemas.ts` and replace its contents with:

```ts
import { z } from "zod"
import type { ObjectId } from "mongodb"

export const TransactionKindSchema = z.enum(["income", "expense"])
export type TransactionKind = z.infer<typeof TransactionKindSchema>

// Full category enum declared up-front (Phase 3). Phase 5 introduces the first
// writer of "adhoc". Phase 6 will write "transfer_in" / "transfer_out".
export const TransactionCategorySchema = z.enum([
  "sale",
  "purchase",
  "transfer_in",
  "transfer_out",
  "adhoc",
])
export type TransactionCategory = z.infer<typeof TransactionCategorySchema>

// ──────────────────────────────────────────────────────────────────────────
// Phase 3 — mark sold / unmark sold (unchanged)
// ──────────────────────────────────────────────────────────────────────────

export const MarkUnitSoldInputSchema = z.object({
  projectId: z.string().min(1, "Missing project"),
  unitId: z.string().min(1, "Missing unit"),
  salePrice: z.coerce
    .number()
    .int("Whole rupees only")
    .min(1, "Must be at least ₹1")
    .max(100_000_000, "Too large (max ₹10 crore)"),
  buyerName: z
    .string()
    .trim()
    .min(1, "Buyer name is required")
    .max(200, "Too long"),
  saleDate: z.coerce.date(),
  description: z.string().trim().min(1, "Description required").max(500),
  notes: z.string().max(2000).optional().default(""),
})
export type MarkUnitSoldInput = z.infer<typeof MarkUnitSoldInputSchema>

export const UnmarkUnitSoldInputSchema = z.object({
  unitId: z.string().min(1, "Missing unit"),
})
export type UnmarkUnitSoldInput = z.infer<typeof UnmarkUnitSoldInputSchema>

// ──────────────────────────────────────────────────────────────────────────
// Phase 5 — Financials inputs
// ──────────────────────────────────────────────────────────────────────────

export const LedgerKindFilterSchema = z.enum(["all", "income", "expense"])
export type LedgerKindFilter = z.infer<typeof LedgerKindFilterSchema>

export const LedgerCategoryFilterSchema = z.enum([
  "all",
  "sale",
  "purchase",
  "adhoc",
  "transfer_in",
  "transfer_out",
])
export type LedgerCategoryFilter = z.infer<typeof LedgerCategoryFilterSchema>

export const LedgerVoidedFilterSchema = z.enum(["active", "all"])
export type LedgerVoidedFilter = z.infer<typeof LedgerVoidedFilterSchema>

// Parsed filter shape used by the repository. `from`/`to` are inclusive
// date-only bounds; the repository expands `to` to end-of-day on the query
// side so a date typed `2026-12-31` covers the full day.
export type LedgerFilters = {
  from: Date
  to: Date
  kind: LedgerKindFilter
  category: LedgerCategoryFilter
  includeVoided: boolean
}

export const CreateAdhocIncomeInputSchema = z.object({
  projectId: z.string().min(1, "Missing project"),
  amount: z.coerce
    .number()
    .int("Whole rupees only")
    .min(1, "Must be at least ₹1")
    .max(100_000_000, "Too large"),
  occurredAt: z.coerce.date(),
  description: z.string().trim().min(1, "Description required").max(500),
  buyerName: z.string().trim().max(200).optional().default(""),
  notes: z.string().max(2000).optional().default(""),
})
export type CreateAdhocIncomeInput = z.infer<typeof CreateAdhocIncomeInputSchema>

export const CreateAdhocExpenseInputSchema = z.object({
  projectId: z.string().min(1, "Missing project"),
  amount: z.coerce
    .number()
    .int("Whole rupees only")
    .min(1, "Must be at least ₹1")
    .max(100_000_000, "Too large"),
  occurredAt: z.coerce.date(),
  description: z.string().trim().min(1, "Description required").max(500),
  notes: z.string().max(2000).optional().default(""),
})
export type CreateAdhocExpenseInput = z.infer<typeof CreateAdhocExpenseInputSchema>

export const VoidTransactionInputSchema = z.object({
  transactionId: z.string().min(1, "Missing transaction"),
})
export type VoidTransactionInput = z.infer<typeof VoidTransactionInputSchema>

export const ReverseTransactionInputSchema = z.object({
  transactionId: z.string().min(1, "Missing transaction"),
  occurredAt: z.coerce.date().optional(),
  notes: z.string().max(2000).optional().default(""),
})
export type ReverseTransactionInput = z.infer<typeof ReverseTransactionInputSchema>

// ──────────────────────────────────────────────────────────────────────────
// Domain type
// ──────────────────────────────────────────────────────────────────────────

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
  createdBy: ObjectId
  createdAt: Date
}
```

Notes for the executor:
- The Phase 3 `MarkUnitSoldInputSchema` and `UnmarkUnitSoldInputSchema` are unchanged — preserve them verbatim. Only Phase 5 additions are new.
- `LedgerFilters` is the parsed shape; the URL params are strings that the page parses into this shape before passing to the repository.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors. The `reversalOf` addition is non-breaking (optional field).

- [ ] **Step 3: Commit**

```bash
git add lib/transactions/schemas.ts
git commit -m "feat(transactions): add reversalOf field and Phase 5 ledger input schemas"
```

---

## Task 5 — Repository read helpers (listLedger, computeTotals, listCrossProjectTotals)

**Files:**
- Modify: `lib/transactions/repository.ts`

- [ ] **Step 1: Append the read helpers + project name join**

Open `lib/transactions/repository.ts` and **append** the following at the end of the file (after the existing `sumProjectRevenue` and error classes — do NOT remove anything existing):

```ts
import type { Project } from "@/lib/projects/schemas"
import type { LedgerFilters } from "./schemas"

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
```

Notes for the executor:
- The `import type { Project }` and `import type { LedgerFilters }` go near the top of the file alongside other type imports — move them up if you prefer the cleaner ordering. Either works.
- `endOfDay` widens `to` so a user-supplied `2026-12-31` covers the full day. Without this, sales recorded at e.g. 14:32 on Dec 31 would be excluded.
- `listCrossProjectTotals` does two round-trips (aggregate + project name lookup). With < 50 projects this is fine; if it grows large, refactor to a single `$lookup`.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/transactions/repository.ts
git commit -m "feat(transactions): add listLedger/computeTotals/listCrossProjectTotals"
```

---

## Task 6 — Repository write helpers (voidTransaction, reverseTransaction) + error classes

**Files:**
- Modify: `lib/transactions/repository.ts`

- [ ] **Step 1: Append the write helpers**

Open `lib/transactions/repository.ts` and append (after the read helpers from Task 5, before the closing of the file):

```ts
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
```

Notes for the executor:
- `voidTransaction` is a single-collection update so it doesn't need `withTransaction`. The conditional update is race-safe — concurrent void attempts on the same row produce exactly one `matchedCount === 1`; losers see `matchedCount === 0` and throw `TransactionNotFoundError`.
- `reverseTransaction` DOES use `withTransaction` because the read-then-insert needs to see a consistent original row. Without the transaction, a concurrent void of the original between the read and the insert would leave a reversal pointing at a voided row.
- `TransactionAlreadyVoidedError` is declared but unused in Phase 5 — reserved for future cleanup phases that may want to distinguish "already voided" from "not found".

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/transactions/repository.ts
git commit -m "feat(transactions): add voidTransaction/reverseTransaction with error classes"
```

---

## Task 7 — Financials server actions

**Files:**
- Create: `app/(authed)/projects/[id]/financials/actions.ts`

- [ ] **Step 1: Write the actions file**

```ts
"use server"

import { ObjectId } from "mongodb"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/session"
import type { ActionResult } from "@/lib/projects/schemas"
import type { Transaction } from "@/lib/transactions/schemas"
import {
  CreateAdhocIncomeInputSchema,
  CreateAdhocExpenseInputSchema,
  VoidTransactionInputSchema,
  ReverseTransactionInputSchema,
} from "@/lib/transactions/schemas"
import {
  voidTransaction as voidTransactionRepo,
  reverseTransaction as reverseTransactionRepo,
  TransactionNotFoundError,
  CannotReverseError,
} from "@/lib/transactions/repository"
import client, { getDb } from "@/lib/db/client"

function fieldError(parsed: { success: false; error: { issues: { message?: string; path: (string | number)[] }[] } }) {
  const first = parsed.error.issues[0]
  return {
    error: first?.message ?? "Invalid input",
    field: (first?.path.join(".") || undefined) as string | undefined,
  }
}

export async function createAdhocIncome(
  raw: unknown
): Promise<ActionResult<{ transactionId: string }>> {
  const user = await requireAdmin()
  const parsed = CreateAdhocIncomeInputSchema.safeParse(raw)
  if (!parsed.success) {
    const fe = fieldError(parsed)
    return { ok: false, error: fe.error, field: fe.field }
  }

  const { projectId, amount, occurredAt, description, buyerName, notes } =
    parsed.data
  if (!ObjectId.isValid(projectId)) {
    return { ok: false, error: "Invalid project id." }
  }

  try {
    const now = new Date()
    const doc: Omit<Transaction, "_id"> = {
      projectId: new ObjectId(projectId),
      unitId: null,
      kind: "income",
      category: "adhoc",
      amount,
      currency: "INR",
      description,
      occurredAt,
      buyerName: buyerName || undefined,
      notes: notes || undefined,
      createdBy: new ObjectId(user.id),
      createdAt: now,
    }
    const db = getDb()
    const res = await db
      .collection<Omit<Transaction, "_id">>("transactions")
      .insertOne(doc)
    revalidatePath(`/projects/${projectId}`)
    revalidatePath("/financials")
    return { ok: true, data: { transactionId: res.insertedId.toHexString() } }
  } catch (err) {
    console.error("createAdhocIncome failed", err)
    return {
      ok: false,
      error: "Could not create income entry. Please try again.",
    }
  }
}

export async function createAdhocExpense(
  raw: unknown
): Promise<ActionResult<{ transactionId: string }>> {
  const user = await requireAdmin()
  const parsed = CreateAdhocExpenseInputSchema.safeParse(raw)
  if (!parsed.success) {
    const fe = fieldError(parsed)
    return { ok: false, error: fe.error, field: fe.field }
  }

  const { projectId, amount, occurredAt, description, notes } = parsed.data
  if (!ObjectId.isValid(projectId)) {
    return { ok: false, error: "Invalid project id." }
  }

  try {
    const now = new Date()
    const doc: Omit<Transaction, "_id"> = {
      projectId: new ObjectId(projectId),
      unitId: null,
      kind: "expense",
      category: "adhoc",
      amount,
      currency: "INR",
      description,
      occurredAt,
      notes: notes || undefined,
      createdBy: new ObjectId(user.id),
      createdAt: now,
    }
    const db = getDb()
    const res = await db
      .collection<Omit<Transaction, "_id">>("transactions")
      .insertOne(doc)
    revalidatePath(`/projects/${projectId}`)
    revalidatePath("/financials")
    return { ok: true, data: { transactionId: res.insertedId.toHexString() } }
  } catch (err) {
    console.error("createAdhocExpense failed", err)
    return {
      ok: false,
      error: "Could not create expense entry. Please try again.",
    }
  }
}

export async function voidTransaction(
  raw: unknown
): Promise<ActionResult<{ voided: boolean }>> {
  const user = await requireAdmin()
  const parsed = VoidTransactionInputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Invalid input" }

  const { transactionId } = parsed.data
  if (!ObjectId.isValid(transactionId)) {
    return { ok: false, error: "Invalid transaction id." }
  }

  // Look up projectId for revalidate. Single read is fine — voidTransaction
  // is admin-only and infrequent.
  const db = getDb()
  const existing = await db
    .collection<Transaction>("transactions")
    .findOne(
      { _id: new ObjectId(transactionId) },
      { projection: { projectId: 1 } }
    )
  if (!existing) return { ok: false, error: "Transaction not found." }

  try {
    await voidTransactionRepo(new ObjectId(transactionId), user.id)
    revalidatePath(`/projects/${existing.projectId.toHexString()}`)
    revalidatePath("/financials")
    return { ok: true, data: { voided: true } }
  } catch (err) {
    if (err instanceof TransactionNotFoundError) {
      return { ok: false, error: err.message }
    }
    console.error("voidTransaction failed", err)
    return {
      ok: false,
      error: "Could not void transaction. Please try again.",
    }
  }
}

const CANNOT_REVERSE_MESSAGES: Record<string, string> = {
  "not-found": "Transaction not found.",
  "is-voided": "Cannot reverse a voided transaction.",
  "is-reversal": "Cannot reverse a reversal entry.",
  "is-transfer":
    "Transfer entries must be reversed via the inter-project transfer flow (Phase 6).",
}

export async function reverseTransaction(
  raw: unknown
): Promise<ActionResult<{ reversalId: string }>> {
  const user = await requireAdmin()
  const parsed = ReverseTransactionInputSchema.safeParse(raw)
  if (!parsed.success) {
    const fe = fieldError(parsed)
    return { ok: false, error: fe.error, field: fe.field }
  }

  const { transactionId, occurredAt, notes } = parsed.data
  if (!ObjectId.isValid(transactionId)) {
    return { ok: false, error: "Invalid transaction id." }
  }

  // Look up projectId for revalidate (the original carries it).
  const db = getDb()
  const existing = await db
    .collection<Transaction>("transactions")
    .findOne(
      { _id: new ObjectId(transactionId) },
      { projection: { projectId: 1 } }
    )
  if (!existing) return { ok: false, error: "Transaction not found." }

  try {
    const { reversalId } = await reverseTransactionRepo(
      new ObjectId(transactionId),
      { occurredAt, notes },
      user.id
    )
    revalidatePath(`/projects/${existing.projectId.toHexString()}`)
    revalidatePath("/financials")
    return { ok: true, data: { reversalId: reversalId.toHexString() } }
  } catch (err) {
    if (err instanceof CannotReverseError) {
      return {
        ok: false,
        error:
          CANNOT_REVERSE_MESSAGES[err.reason] ??
          "Cannot reverse this transaction.",
      }
    }
    console.error("reverseTransaction failed", err)
    return {
      ok: false,
      error: "Could not reverse transaction. Please try again.",
    }
  }
}
```

Notes for the executor:
- `requireAdmin()` is the FIRST executable line of every action. The whole Phase 5 surface is admin-only.
- Each action does an extra `findOne({_id, projection: {projectId: 1}})` solely to know which path to revalidate. The cost is one indexed point read — negligible. Alternative would be to pass projectId in the action input, but that creates UX friction (the client must always know it) and breaks the row-action menu pattern (the row already has the id; passing projectId redundantly is ugly).
- The `Omit<Transaction, "_id">` typing on the collection handle suppresses MongoDB's type complaint about inserting without an `_id`.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/financials/actions.ts"
git commit -m "feat(financials): add createAdhocIncome/Expense/voidTransaction/reverseTransaction"
```

---

## Task 8 — Add-income dialog (admin)

**Files:**
- Create: `app/(authed)/projects/[id]/financials/add-income-dialog.tsx`

- [ ] **Step 1: Write the dialog**

```tsx
"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createAdhocIncome } from "./actions"

type FormState = {
  amount: string
  description: string
  buyerName: string
  occurredAt: string
  notes: string
}

function isoDateToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export function AddIncomeButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Add income</Button>
      <AddIncomeDialog
        key={open ? "open" : "closed"}
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
      />
    </>
  )
}

function AddIncomeDialog({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  projectId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>({
    amount: "",
    description: "",
    buyerName: "",
    occurredAt: isoDateToday(),
    notes: "",
  })

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit() {
    setErrorMsg(null)
    setErrorField(null)
    startTransition(async () => {
      const result = await createAdhocIncome({
        projectId,
        amount: form.amount,
        description: form.description,
        buyerName: form.buyerName,
        occurredAt: form.occurredAt,
        notes: form.notes,
      })
      if (!result.ok) {
        setErrorMsg(result.error)
        setErrorField(result.field ?? null)
        return
      }
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add income</DialogTitle>
          <DialogDescription>
            Records an ad-hoc income entry on the ledger (kind=income, category=adhoc).
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSubmit()
          }}
          className="flex flex-col gap-4"
        >
          <Field
            label="Amount (₹)"
            htmlFor="amount"
            error={errorField === "amount" ? errorMsg : null}
          >
            <Input
              id="amount"
              type="number"
              min={1}
              step={1}
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
              disabled={isPending}
              autoFocus
            />
          </Field>
          <Field
            label="Description"
            htmlFor="description"
            error={errorField === "description" ? errorMsg : null}
          >
            <Input
              id="description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              disabled={isPending}
              placeholder="e.g., Refund credit from supplier"
            />
          </Field>
          <Field
            label="Buyer / payer (optional)"
            htmlFor="buyerName"
            error={errorField === "buyerName" ? errorMsg : null}
          >
            <Input
              id="buyerName"
              value={form.buyerName}
              onChange={(e) => set("buyerName", e.target.value)}
              disabled={isPending}
              placeholder="Optional — useful for refund/credit tracking"
            />
          </Field>
          <Field
            label="Date"
            htmlFor="occurredAt"
            error={errorField === "occurredAt" ? errorMsg : null}
          >
            <Input
              id="occurredAt"
              type="date"
              value={form.occurredAt}
              onChange={(e) => set("occurredAt", e.target.value)}
              disabled={isPending}
            />
          </Field>
          <Field label="Notes" htmlFor="notes">
            <Textarea
              id="notes"
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              disabled={isPending}
            />
          </Field>

          {errorMsg && !errorField ? (
            <p className="text-sm text-destructive" role="alert">
              {errorMsg}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Add income"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string
  htmlFor: string
  error?: string | null
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
```

- [ ] **Step 2: Skip typecheck for now**

The dialog is rendered from `financials-view.tsx` (Task 15) which doesn't exist yet. Move on.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/financials/add-income-dialog.tsx"
git commit -m "feat(financials): add ad-hoc income dialog"
```

---

## Task 9 — Add-expense dialog (admin)

**Files:**
- Create: `app/(authed)/projects/[id]/financials/add-expense-dialog.tsx`

- [ ] **Step 1: Write the dialog**

```tsx
"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createAdhocExpense } from "./actions"

type FormState = {
  amount: string
  description: string
  occurredAt: string
  notes: string
}

function isoDateToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export function AddExpenseButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Add expense
      </Button>
      <AddExpenseDialog
        key={open ? "open" : "closed"}
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
      />
    </>
  )
}

function AddExpenseDialog({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  projectId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>({
    amount: "",
    description: "",
    occurredAt: isoDateToday(),
    notes: "",
  })

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit() {
    setErrorMsg(null)
    setErrorField(null)
    startTransition(async () => {
      const result = await createAdhocExpense({
        projectId,
        amount: form.amount,
        description: form.description,
        occurredAt: form.occurredAt,
        notes: form.notes,
      })
      if (!result.ok) {
        setErrorMsg(result.error)
        setErrorField(result.field ?? null)
        return
      }
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add expense</DialogTitle>
          <DialogDescription>
            Records an ad-hoc expense entry on the ledger (kind=expense, category=adhoc).
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSubmit()
          }}
          className="flex flex-col gap-4"
        >
          <Field
            label="Amount (₹)"
            htmlFor="amount"
            error={errorField === "amount" ? errorMsg : null}
          >
            <Input
              id="amount"
              type="number"
              min={1}
              step={1}
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
              disabled={isPending}
              autoFocus
            />
          </Field>
          <Field
            label="Description"
            htmlFor="description"
            error={errorField === "description" ? errorMsg : null}
          >
            <Input
              id="description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              disabled={isPending}
              placeholder="e.g., Government registration fee"
            />
          </Field>
          <Field
            label="Date"
            htmlFor="occurredAt"
            error={errorField === "occurredAt" ? errorMsg : null}
          >
            <Input
              id="occurredAt"
              type="date"
              value={form.occurredAt}
              onChange={(e) => set("occurredAt", e.target.value)}
              disabled={isPending}
            />
          </Field>
          <Field label="Notes" htmlFor="notes">
            <Textarea
              id="notes"
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              disabled={isPending}
            />
          </Field>

          {errorMsg && !errorField ? (
            <p className="text-sm text-destructive" role="alert">
              {errorMsg}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Add expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string
  htmlFor: string
  error?: string | null
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
```

- [ ] **Step 2: Skip typecheck for now**

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/financials/add-expense-dialog.tsx"
git commit -m "feat(financials): add ad-hoc expense dialog"
```

---

## Task 10 — Void confirm dialog (AlertDialog)

**Files:**
- Create: `app/(authed)/projects/[id]/financials/void-confirm-dialog.tsx`

- [ ] **Step 1: Write the dialog**

```tsx
"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { voidTransaction } from "./actions"

export function VoidConfirmDialog({
  open,
  onOpenChange,
  transactionId,
  description,
  amount,
  kind,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  transactionId: string
  description: string
  amount: number
  kind: "income" | "expense"
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function confirm() {
    setErrorMsg(null)
    startTransition(async () => {
      const result = await voidTransaction({ transactionId })
      if (!result.ok) {
        setErrorMsg(result.error)
        return
      }
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Void this entry?</AlertDialogTitle>
          <AlertDialogDescription>
            {description} (₹{amount.toLocaleString("en-IN")} {kind})
            <br />
            <br />
            The entry stays in the audit trail but is hidden from active totals
            and the default ledger view. Use this for &ldquo;just clicked
            wrong&rdquo; mistakes. For accounting corrections of older entries,
            use Reverse instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {errorMsg ? (
          <p className="text-sm text-destructive" role="alert">
            {errorMsg}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              confirm()
            }}
            disabled={isPending}
          >
            {isPending ? "Voiding…" : "Void"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

- [ ] **Step 2: Skip typecheck for now**

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/financials/void-confirm-dialog.tsx"
git commit -m "feat(financials): add void-confirm alert dialog"
```

---

## Task 11 — Reverse confirm dialog (AlertDialog with optional date)

**Files:**
- Create: `app/(authed)/projects/[id]/financials/reverse-confirm-dialog.tsx`

- [ ] **Step 1: Write the dialog**

```tsx
"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { reverseTransaction } from "./actions"

function isoDateToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export function ReverseConfirmDialog({
  open,
  onOpenChange,
  transactionId,
  description,
  amount,
  kind,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  transactionId: string
  description: string
  amount: number
  kind: "income" | "expense"
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [occurredAt, setOccurredAt] = useState<string>(isoDateToday())
  const [notes, setNotes] = useState<string>("")

  function confirm() {
    setErrorMsg(null)
    startTransition(async () => {
      const result = await reverseTransaction({
        transactionId,
        occurredAt,
        notes,
      })
      if (!result.ok) {
        setErrorMsg(result.error)
        return
      }
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reverse this entry?</AlertDialogTitle>
          <AlertDialogDescription>
            {description} (₹{amount.toLocaleString("en-IN")} {kind})
            <br />
            <br />
            A new reversal row will be inserted on the ledger at the date below.
            Both the original and the reversal stay active &mdash; aggregates
            net to zero. Use this for accounting corrections of older entries.
            For &ldquo;just clicked wrong&rdquo; mistakes, use Void instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reverseDate">Reversal date</Label>
            <Input
              id="reverseDate"
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reverseNotes">Notes (optional)</Label>
            <Textarea
              id="reverseNotes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isPending}
              placeholder="Why is this being reversed?"
            />
          </div>
        </div>
        {errorMsg ? (
          <p className="text-sm text-destructive" role="alert">
            {errorMsg}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              confirm()
            }}
            disabled={isPending}
          >
            {isPending ? "Reversing…" : "Reverse"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

- [ ] **Step 2: Skip typecheck for now**

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/financials/reverse-confirm-dialog.tsx"
git commit -m "feat(financials): add reverse-confirm alert dialog with date + notes inputs"
```

---

## Task 12 — Row actions menu (DropdownMenu)

**Files:**
- Create: `app/(authed)/projects/[id]/financials/row-actions-menu.tsx`

- [ ] **Step 1: Write the menu**

```tsx
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { VoidConfirmDialog } from "./void-confirm-dialog"
import { ReverseConfirmDialog } from "./reverse-confirm-dialog"

export type RowActionsContext = {
  transactionId: string
  description: string
  amount: number
  kind: "income" | "expense"
  category: "sale" | "purchase" | "adhoc" | "transfer_in" | "transfer_out"
  voided: boolean
  isReversal: boolean
}

function actionsForRow(ctx: RowActionsContext): {
  canVoid: boolean
  canReverse: boolean
} {
  if (ctx.voided) return { canVoid: false, canReverse: false }
  if (ctx.isReversal) return { canVoid: false, canReverse: false }
  if (ctx.category === "transfer_in" || ctx.category === "transfer_out") {
    return { canVoid: false, canReverse: false }
  }
  return {
    canVoid: ctx.category === "adhoc",
    canReverse:
      ctx.category === "sale" ||
      ctx.category === "purchase" ||
      ctx.category === "adhoc",
  }
}

export function RowActionsMenu(ctx: RowActionsContext) {
  const [voidOpen, setVoidOpen] = useState(false)
  const [reverseOpen, setReverseOpen] = useState(false)
  const { canVoid, canReverse } = actionsForRow(ctx)

  if (!canVoid && !canReverse) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost">
            ⋯
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canVoid ? (
            <DropdownMenuItem onClick={() => setVoidOpen(true)}>
              Void
            </DropdownMenuItem>
          ) : null}
          {canReverse ? (
            <DropdownMenuItem onClick={() => setReverseOpen(true)}>
              Reverse
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {canVoid ? (
        <VoidConfirmDialog
          key={voidOpen ? `void-open-${ctx.transactionId}` : "void-closed"}
          open={voidOpen}
          onOpenChange={setVoidOpen}
          transactionId={ctx.transactionId}
          description={ctx.description}
          amount={ctx.amount}
          kind={ctx.kind}
        />
      ) : null}
      {canReverse ? (
        <ReverseConfirmDialog
          key={reverseOpen ? `rev-open-${ctx.transactionId}` : "rev-closed"}
          open={reverseOpen}
          onOpenChange={setReverseOpen}
          transactionId={ctx.transactionId}
          description={ctx.description}
          amount={ctx.amount}
          kind={ctx.kind}
        />
      ) : null}
    </>
  )
}
```

- [ ] **Step 2: Skip typecheck for now**

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/financials/row-actions-menu.tsx"
git commit -m "feat(financials): add row actions menu with conditional Void/Reverse"
```

---

## Task 13 — Ledger filters (URL-synced client)

**Files:**
- Create: `app/(authed)/projects/[id]/financials/ledger-filters.tsx`

- [ ] **Step 1: Write the filter chips**

```tsx
"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const KIND_OPTIONS = [
  { value: "all", label: "All" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
] as const

const CATEGORY_OPTIONS = [
  { value: "all", label: "All" },
  { value: "sale", label: "Sale" },
  { value: "purchase", label: "Purchase" },
  { value: "adhoc", label: "Ad-hoc" },
  { value: "transfer_in", label: "Transfer in" },
  { value: "transfer_out", label: "Transfer out" },
] as const

const VOIDED_OPTIONS = [
  { value: "active", label: "Active only" },
  { value: "all", label: "Include voided" },
] as const

export function LedgerFilters({
  defaultFrom,
  defaultTo,
}: {
  defaultFrom: string
  defaultTo: string
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const [, startTransition] = useTransition()

  const from = sp.get("from") ?? defaultFrom
  const to = sp.get("to") ?? defaultTo
  const kind = sp.get("kind") ?? "all"
  const category = sp.get("category") ?? "all"
  const voided = sp.get("voided") ?? "active"

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString())
    next.set(key, value)
    startTransition(() => {
      router.replace(`?${next.toString()}`, { scroll: false })
    })
  }

  return (
    <div className="flex flex-col gap-3 pb-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from">From</Label>
          <Input
            id="from"
            type="date"
            value={from}
            onChange={(e) => setParam("from", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to">To</Label>
          <Input
            id="to"
            type="date"
            value={to}
            onChange={(e) => setParam("to", e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <ChipGroup
          label="Kind"
          options={KIND_OPTIONS}
          active={kind}
          onSelect={(v) => setParam("kind", v)}
        />
        <ChipGroup
          label="Category"
          options={CATEGORY_OPTIONS}
          active={category}
          onSelect={(v) => setParam("category", v)}
        />
        <ChipGroup
          label="Voided"
          options={VOIDED_OPTIONS}
          active={voided}
          onSelect={(v) => setParam("voided", v)}
        />
      </div>
    </div>
  )
}

function ChipGroup({
  label,
  options,
  active,
  onSelect,
}: {
  label: string
  options: readonly { value: string; label: string }[]
  active: string
  onSelect: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <Button
            key={o.value}
            size="sm"
            variant={active === o.value ? "default" : "outline"}
            onClick={() => onSelect(o.value)}
            type="button"
          >
            {o.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/financials/ledger-filters.tsx"
git commit -m "feat(financials): add URL-synced ledger filter chips"
```

---

## Task 14 — Ledger table (server, rich columns)

**Files:**
- Create: `app/(authed)/projects/[id]/financials/ledger-table.tsx`

- [ ] **Step 1: Write the table**

```tsx
import { ObjectId } from "mongodb"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Transaction } from "@/lib/transactions/schemas"
import type { Unit } from "@/lib/projects/schemas"
import { getDb } from "@/lib/db/client"
import { RowActionsMenu } from "./row-actions-menu"

const INR = new Intl.NumberFormat("en-IN")

function fmtAmount(t: Transaction): string {
  const sign = t.reversalOf ? "−" : ""
  return `${sign}₹${INR.format(t.amount)}`
}

function categoryLabel(c: Transaction["category"]): string {
  switch (c) {
    case "sale":
      return "Sale"
    case "purchase":
      return "Purchase"
    case "adhoc":
      return "Ad-hoc"
    case "transfer_in":
      return "Transfer in"
    case "transfer_out":
      return "Transfer out"
  }
}

async function fetchUnitsForRows(
  rows: Transaction[]
): Promise<Map<string, string>> {
  const unitIds = Array.from(
    new Set(
      rows
        .filter((r) => r.category === "sale" && r.unitId)
        .map((r) => (r.unitId as ObjectId).toHexString())
    )
  )
  if (unitIds.length === 0) return new Map()
  const db = getDb()
  const docs = await db
    .collection<Unit>("units")
    .find({ _id: { $in: unitIds.map((id) => new ObjectId(id)) } })
    .project<{ _id: ObjectId; type: Unit["type"]; number: string }>({
      type: 1,
      number: 1,
    })
    .toArray()
  return new Map(
    docs.map((d) => [
      d._id.toHexString(),
      `${d.type === "apartment" ? "Apt" : "Parking"} ${d.number}`,
    ])
  )
}

export async function LedgerTable({ rows }: { rows: Transaction[] }) {
  if (rows.length === 0) {
    return (
      <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
        No transactions match these filters.
      </Card>
    )
  }
  const unitLabels = await fetchUnitsForRows(rows)

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Kind</th>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3 text-right">Amount</th>
            <th className="px-4 py-3">Description</th>
            <th className="px-4 py-3">Buyer</th>
            <th className="px-4 py-3">Linked</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const voided = r.voided === true
            const isReversal = r.reversalOf != null
            const rowClass = voided
              ? "border-b border-border last:border-0 opacity-60 line-through"
              : "border-b border-border last:border-0"
            const unitLabel =
              r.unitId && r.category === "sale"
                ? (unitLabels.get(r.unitId.toHexString()) ?? "")
                : ""
            return (
              <tr key={String(r._id)} className={rowClass}>
                <td className="px-4 py-3 font-mono">
                  {r.occurredAt.toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Badge variant={r.kind === "income" ? "default" : "secondary"}>
                      {r.kind === "income" ? "Income" : "Expense"}
                    </Badge>
                    {isReversal ? (
                      <Badge variant="outline" className="text-xs">
                        Reversal
                      </Badge>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="secondary">{categoryLabel(r.category)}</Badge>
                </td>
                <td className="px-4 py-3 text-right font-mono">{fmtAmount(r)}</td>
                <td className="px-4 py-3">{r.description}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {r.buyerName ?? ""}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{unitLabel}</td>
                <td className="px-4 py-3 text-right">
                  <RowActionsMenu
                    transactionId={String(r._id)}
                    description={r.description}
                    amount={r.amount}
                    kind={r.kind}
                    category={r.category}
                    voided={voided}
                    isReversal={isReversal}
                  />
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

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors. (Tasks 8-12 dialogs now compile because Task 14 references RowActionsMenu concretely.)

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/financials/ledger-table.tsx"
git commit -m "feat(financials): add server ledger table with reversal badge + linked unit"
```

---

## Task 15 — Financials view (server, composes tiles + filters + table)

**Files:**
- Create: `app/(authed)/projects/[id]/financials/financials-view.tsx`

- [ ] **Step 1: Write the view**

```tsx
import { Card } from "@/components/ui/card"
import type { Transaction } from "@/lib/transactions/schemas"
import type { FinancialTotals } from "@/lib/transactions/repository"
import { LedgerFilters } from "./ledger-filters"
import { LedgerTable } from "./ledger-table"
import { AddIncomeButton } from "./add-income-dialog"
import { AddExpenseButton } from "./add-expense-dialog"

const INR = new Intl.NumberFormat("en-IN")

export function FinancialsView({
  projectId,
  rows,
  totals,
  defaultFrom,
  defaultTo,
}: {
  projectId: string
  rows: Transaction[]
  totals: FinancialTotals
  defaultFrom: string
  defaultTo: string
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="Revenue" value={`₹${INR.format(totals.revenue)}`} />
        <Tile label="Expenses" value={`₹${INR.format(totals.expenses)}`} />
        <Tile
          label="Net"
          value={`${totals.net < 0 ? "−" : ""}₹${INR.format(Math.abs(totals.net))}`}
          tone={totals.net < 0 ? "loss" : "gain"}
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {rows.length} entr{rows.length === 1 ? "y" : "ies"} in this window.
        </p>
        <div className="flex gap-2">
          <AddIncomeButton projectId={projectId} />
          <AddExpenseButton projectId={projectId} />
        </div>
      </div>
      <LedgerFilters defaultFrom={defaultFrom} defaultTo={defaultTo} />
      <LedgerTable rows={rows} />
    </div>
  )
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
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
          (tone === "loss"
            ? "text-destructive"
            : tone === "gain"
              ? ""
              : "")
        }
      >
        {value}
      </span>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/financials/financials-view.tsx"
git commit -m "feat(financials): add financials view composing tiles + filters + table"
```

---

## Task 16 — Global `/financials` page (cross-project)

**Files:**
- Create: `app/(authed)/financials/page.tsx`
- Create: `app/(authed)/financials/global-filters.tsx`
- Create: `app/(authed)/financials/per-project-table.tsx`

- [ ] **Step 1: Write `global-filters.tsx`**

```tsx
"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function GlobalFilters({
  defaultFrom,
  defaultTo,
}: {
  defaultFrom: string
  defaultTo: string
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const [, startTransition] = useTransition()

  const from = sp.get("from") ?? defaultFrom
  const to = sp.get("to") ?? defaultTo

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString())
    next.set(key, value)
    startTransition(() => {
      router.replace(`?${next.toString()}`, { scroll: false })
    })
  }

  return (
    <div className="flex flex-wrap items-end gap-3 pb-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="from">From</Label>
        <Input
          id="from"
          type="date"
          value={from}
          onChange={(e) => setParam("from", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="to">To</Label>
        <Input
          id="to"
          type="date"
          value={to}
          onChange={(e) => setParam("to", e.target.value)}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write `per-project-table.tsx`**

```tsx
import Link from "next/link"
import { Card } from "@/components/ui/card"
import type { PerProjectTotals } from "@/lib/transactions/repository"

const INR = new Intl.NumberFormat("en-IN")

function fmt(n: number): string {
  return `${n < 0 ? "−" : ""}₹${INR.format(Math.abs(n))}`
}

export function PerProjectTable({ rows }: { rows: PerProjectTotals[] }) {
  if (rows.length === 0) {
    return (
      <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
        No transactions in this date range across any project.
      </Card>
    )
  }
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Project</th>
            <th className="px-4 py-3 text-right">Revenue</th>
            <th className="px-4 py-3 text-right">Expenses</th>
            <th className="px-4 py-3 text-right">Net</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.projectId} className="border-b border-border last:border-0">
              <td className="px-4 py-3">
                <Link
                  href={`/projects/${r.projectId}?tab=financials`}
                  className="hover:underline"
                >
                  {r.projectName}
                </Link>
              </td>
              <td className="px-4 py-3 text-right font-mono">
                ₹{INR.format(r.revenue)}
              </td>
              <td className="px-4 py-3 text-right font-mono">
                ₹{INR.format(r.expenses)}
              </td>
              <td
                className={
                  "px-4 py-3 text-right font-mono " +
                  (r.net < 0 ? "text-destructive" : "")
                }
              >
                {fmt(r.net)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
```

- [ ] **Step 3: Write `page.tsx`**

```tsx
import { requireAdmin } from "@/lib/auth/session"
import { listCrossProjectTotals } from "@/lib/transactions/repository"
import { GlobalFilters } from "./global-filters"
import { PerProjectTable } from "./per-project-table"

const INR = new Intl.NumberFormat("en-IN")

function startOfYear(): Date {
  const d = new Date()
  d.setMonth(0, 1)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfYear(): Date {
  const d = new Date()
  d.setMonth(11, 31)
  d.setHours(23, 59, 59, 999)
  return d
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function parseDate(raw: string | undefined, fallback: Date): Date {
  if (!raw) return fallback
  const d = new Date(raw + "T00:00:00")
  if (Number.isNaN(d.getTime())) return fallback
  return d
}

export default async function GlobalFinancialsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requireAdmin()
  const sp = await searchParams
  const defaultFromDate = startOfYear()
  const defaultToDate = endOfYear()
  const from = parseDate(sp.from, defaultFromDate)
  const to = parseDate(sp.to, defaultToDate)

  const { overall, perProject } = await listCrossProjectTotals({ from, to })

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Financials</h1>
        <p className="text-sm text-muted-foreground">
          Cross-project revenue, expenses, and net across the filter window.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="Revenue" value={`₹${INR.format(overall.revenue)}`} />
        <Tile label="Expenses" value={`₹${INR.format(overall.expenses)}`} />
        <Tile
          label="Net"
          value={`${overall.net < 0 ? "−" : ""}₹${INR.format(Math.abs(overall.net))}`}
          tone={overall.net < 0 ? "loss" : "gain"}
        />
      </div>
      <GlobalFilters defaultFrom={isoDate(defaultFromDate)} defaultTo={isoDate(defaultToDate)} />
      <PerProjectTable rows={perProject} />
    </div>
  )
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
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
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(authed)/financials/page.tsx" "app/(authed)/financials/global-filters.tsx" "app/(authed)/financials/per-project-table.tsx"
git commit -m "feat(financials): add admin global cross-project page with per-project breakdown"
```

---

## Task 17 — Wire-up: project-tabs prop, page.tsx fetch, admin nav link

**Files:**
- Modify: `app/(authed)/projects/[id]/project-tabs.tsx`
- Modify: `app/(authed)/projects/[id]/page.tsx`
- Modify: `app/(authed)/layout.tsx`

- [ ] **Step 1: Add `financials` prop to `project-tabs.tsx`**

Replace `app/(authed)/projects/[id]/project-tabs.tsx` with:

```tsx
"use client"

import type { ReactNode } from "react"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import type { Role } from "@/types"

export function ProjectTabs({
  role,
  inventory,
  materials,
  financials,
}: {
  role: Role
  inventory?: ReactNode
  materials?: ReactNode
  financials?: ReactNode
}) {
  return (
    <Tabs defaultValue="inventory">
      <TabsList>
        <TabsTrigger value="inventory">Inventory</TabsTrigger>
        <TabsTrigger value="materials">Materials</TabsTrigger>
        {role === "admin" ? (
          <TabsTrigger value="financials">Financials</TabsTrigger>
        ) : null}
      </TabsList>
      <TabsContent value="inventory">
        {inventory ?? (
          <Placeholder>Inventory listing coming in Phase 3.</Placeholder>
        )}
      </TabsContent>
      <TabsContent value="materials">
        {materials ?? (
          <Placeholder>Materials tracking coming in Phase 4.</Placeholder>
        )}
      </TabsContent>
      {role === "admin" ? (
        <TabsContent value="financials">
          {financials ?? (
            <Placeholder>Financial ledger coming in Phase 5.</Placeholder>
          )}
        </TabsContent>
      ) : null}
    </Tabs>
  )
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
      {children}
    </Card>
  )
}
```

- [ ] **Step 2: Update `page.tsx` to fetch ledger + totals for admin**

Replace `app/(authed)/projects/[id]/page.tsx` contents with:

```tsx
import { ObjectId } from "mongodb"
import { notFound } from "next/navigation"
import { requireAuth } from "@/lib/auth/session"
import {
  countSoldUnits,
  getProject,
} from "@/lib/projects/repository"
import {
  sumProjectRevenue,
  listLedger,
  computeTotals,
} from "@/lib/transactions/repository"
import { listProjectMaterials, listCatalog } from "@/lib/materials/repository"
import type {
  LedgerFilters,
  LedgerKindFilter,
  LedgerCategoryFilter,
} from "@/lib/transactions/schemas"
import { Badge } from "@/components/ui/badge"
import { ProjectTabs } from "./project-tabs"
import { InventoryFilters } from "./inventory/inventory-filters"
import {
  InventoryTable,
  type InventoryFilterParams,
} from "./inventory/inventory-table"
import { MaterialsTable } from "./materials/materials-table"
import { FinancialsView } from "./financials/financials-view"

const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  under_construction: "Under construction",
  completed: "Completed",
  on_hold: "On hold",
}

const INR = new Intl.NumberFormat("en-IN")

function startOfYear(): Date {
  const d = new Date()
  d.setMonth(0, 1)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfYear(): Date {
  const d = new Date()
  d.setMonth(11, 31)
  d.setHours(23, 59, 59, 999)
  return d
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function parseDate(raw: string | undefined, fallback: Date): Date {
  if (!raw) return fallback
  const d = new Date(raw + "T00:00:00")
  if (Number.isNaN(d.getTime())) return fallback
  return d
}

function parseKind(raw: string | undefined): LedgerKindFilter {
  return raw === "income" || raw === "expense" ? raw : "all"
}

function parseCategory(raw: string | undefined): LedgerCategoryFilter {
  switch (raw) {
    case "sale":
    case "purchase":
    case "adhoc":
    case "transfer_in":
    case "transfer_out":
      return raw
    default:
      return "all"
  }
}

type AllSearchParams = InventoryFilterParams & {
  from?: string
  to?: string
  kind?: string
  category?: string
  voided?: string
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<AllSearchParams>
}) {
  const user = await requireAuth()
  const { id } = await params
  const sp = await searchParams

  if (!ObjectId.isValid(id)) notFound()
  const projectObjectId = new ObjectId(id)
  const isAdmin = user.role === "admin"

  const defaultFromDate = startOfYear()
  const defaultToDate = endOfYear()
  const ledgerFilters: LedgerFilters = {
    from: parseDate(sp.from, defaultFromDate),
    to: parseDate(sp.to, defaultToDate),
    kind: parseKind(sp.kind),
    category: parseCategory(sp.category),
    includeVoided: sp.voided === "all",
  }

  const [project, soldCount, revenue, materialRows, catalog, ledgerRows, totals] =
    await Promise.all([
      getProject(id),
      countSoldUnits(projectObjectId),
      sumProjectRevenue(projectObjectId),
      listProjectMaterials(projectObjectId),
      listCatalog(),
      isAdmin ? listLedger(projectObjectId, ledgerFilters) : Promise.resolve([]),
      isAdmin
        ? computeTotals(projectObjectId, ledgerFilters)
        : Promise.resolve({ revenue: 0, expenses: 0, net: 0 }),
    ])
  if (!project) notFound()

  const totalUnitsAndParkings = project.totalUnits + project.totalParkings
  const catalogForPicker = catalog.map((m) => ({
    materialId: String(m._id),
    name: m.name,
    unit: m.unit,
    unitOther: m.unitOther ?? "",
    unitPrice: m.unitPrice,
  }))

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {project.name}
            </h1>
            <p className="text-sm text-muted-foreground">{project.location}</p>
          </div>
          <Badge variant="secondary">
            {STATUS_LABEL[project.status] ?? project.status}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Tile label="Total apartments" value={String(project.totalUnits)} />
          <Tile label="Total parkings" value={String(project.totalParkings)} />
          <Tile
            label="Sold"
            value={`${soldCount} / ${totalUnitsAndParkings}`}
          />
          <Tile label="Revenue" value={`₹${INR.format(revenue)}`} />
          <Tile
            label="Created"
            value={project.createdAt.toLocaleDateString()}
          />
        </div>
      </header>
      <ProjectTabs
        role={user.role}
        inventory={
          <div className="flex flex-col gap-2">
            <InventoryFilters />
            <InventoryTable
              projectId={id}
              role={user.role}
              searchParams={sp}
            />
          </div>
        }
        materials={
          <MaterialsTable
            projectId={id}
            role={user.role}
            rows={materialRows}
            catalog={catalogForPicker}
          />
        }
        financials={
          isAdmin ? (
            <FinancialsView
              projectId={id}
              rows={ledgerRows}
              totals={totals}
              defaultFrom={isoDate(defaultFromDate)}
              defaultTo={isoDate(defaultToDate)}
            />
          ) : undefined
        }
      />
    </div>
  )
}

function Tile({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3">
      <span className="text-xs uppercase tracking-wide">{label}</span>
      <span className="font-mono text-xl">{value}</span>
    </div>
  )
}
```

Notes for the executor:
- For FM sessions, `listLedger` and `computeTotals` are NOT called — `Promise.resolve([])` and the zero-totals placeholder are passed in. The `financials` prop is `undefined` so the tab content renders the existing placeholder (the trigger is admin-only anyway).
- The `Promise.all` is preserved; ledger + totals join it alongside the existing fetches.

- [ ] **Step 3: Add admin-only Financials link to authed layout**

Replace `app/(authed)/layout.tsx` with:

```tsx
import Link from "next/link"
import { requireAuth } from "@/lib/auth/session"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { UserMenu } from "./user-menu"

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireAuth()
  const roleLabel = user.role === "admin" ? "Admin" : "Floor manager"
  const roleVariant = user.role === "admin" ? "default" : "secondary"
  const isAdmin = user.role === "admin"

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 font-mono text-sm font-semibold">
            <span className="grid size-7 place-items-center rounded-md border border-border bg-card text-xs">
              W
            </span>
            Wangre
          </Link>
          <Separator orientation="vertical" className="h-5" />
          <Badge variant={roleVariant}>{roleLabel}</Badge>
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
            </>
          ) : null}
        </div>
        <UserMenu
          email={user.email ?? ""}
          name={user.name ?? null}
          image={user.image ?? null}
        />
      </header>
      <main className="flex-1 bg-background">{children}</main>
    </div>
  )
}
```

- [ ] **Step 4: Typecheck + lint**

```bash
npm run typecheck
npm run lint
```

Expected: 0 errors on both.

- [ ] **Step 5: Dev-server smoke**

```bash
npm run dev
```

As admin, the header now shows both "Catalog" and "Financials" links. Click Financials → `/financials` loads with empty state if no transactions in 2026, otherwise shows aggregate + per-project. Visit `/projects/<id>` and click the Financials tab — tiles + filters + ledger appear.

As floor manager, `/financials` direct navigation redirects to `/`; both nav links are absent.

Stop dev server with Ctrl+C once smoke is confirmed.

- [ ] **Step 6: Commit**

```bash
git add "app/(authed)/projects/[id]/project-tabs.tsx" "app/(authed)/projects/[id]/page.tsx" "app/(authed)/layout.tsx"
git commit -m "feat(financials): wire Financials tab + admin nav link"
```

---

## Task 18 — End-to-end manual verification

No code in this task. Run through the spec's verification list. Use the **superpowers:verification-before-completion** skill before reporting Phase 5 done.

**Before starting:** confirm a clean tree with `git status` and that you're on `feat/phase-5-financials`.

You'll need at least one project with a sold unit (from Phase 3) and at least one purchase (from Phase 4) for the row-type variety checks. If you don't have them, create them first.

- [ ] **Typecheck and lint pass**

```bash
npm run typecheck
npm run lint
```

Both exit 0.

- [ ] **`db:init` is idempotent**

```bash
npm run db:init
npm run db:init
```

Both runs print the same line listing all indexes including `transactions.reversalOf sparse`. Exit 0.

- [ ] **Admin: navigation + visibility**

Start `npm run dev`. Sign in as admin. Header shows both `Catalog` and `Financials` links.

- Visit `/financials` → page loads with the 3 tiles (Revenue / Expenses / Net) and per-project table (if there's data).
- Visit `/projects/<id>` and click Financials tab → tiles, filters, and ledger render. Default filter window is the current calendar year.

- [ ] **Admin: create ad-hoc income**

In the Financials tab, click `Add income`. Fill: amount `100000`, description `Test refund from supplier`, buyer `Acme Supplies`, date today, notes empty. Submit.

Expected:
- Dialog closes
- New row appears in the ledger with kind=income, category=adhoc, amount ₹1,00,000
- Revenue tile increases by ₹1,00,000
- Net tile updates

`mongosh`:
```js
db.transactions.findOne({ category: "adhoc", description: "Test refund from supplier" })
```
Expected: `kind: "income"`, `amount: 100000`, `unitId: null`, `currency: "INR"`, no `voided`, no `reversalOf`.

- [ ] **Admin: create ad-hoc expense**

Same flow with `Add expense`. Amount `25000`, description `Office stationery`. Submit. Expense tile +₹25,000; Net adjusts.

- [ ] **Soft-void smoke test (adhoc only)**

On the `Office stationery` row, click the ⋯ menu → `Void`. Confirm. Expected:
- Row disappears from the ledger (default filter is `voided=active`)
- Expense tile decreases by ₹25,000
- Net tile adjusts back

Toggle the `Voided` chip to `Include voided`. The row reappears with strike-through. Its action menu now shows nothing (no Void on a voided row; no Reverse on voided rows).

`mongosh`:
```js
db.transactions.findOne({ description: "Office stationery" })
```
Expected: `voided: true`, `voidedAt: ISODate(today)`, `voidedBy: ObjectId(...)`.

- [ ] **Reversal smoke test (adhoc)**

Create another ad-hoc income (`Test second refund`, ₹50000). Then on its row, click ⋯ → `Reverse`. In the confirm dialog, leave date as today, notes `Customer changed mind`. Submit.

Expected:
- Dialog closes
- Two rows now visible in the ledger:
  - The original (`Test second refund`, ₹50,000 income, today)
  - The reversal (`Reversal of: Test second refund`, ₹50,000 income with "Reversal" sub-badge, "−₹50,000" in the amount column display, today)
- Revenue tile UNCHANGED net (the reversal subtracts in computeTotals)

`mongosh`:
```js
db.transactions.find({ description: /Test second refund/ }).toArray()
```
Expected: TWO rows.
- Original: `reversalOf` absent
- Reversal: `reversalOf: ObjectId(<original-id>)`, `amount: 50000` (positive, same magnitude), `kind: "income"`, `category: "adhoc"`, `description: "Reversal of: Test second refund"`

Try to click ⋯ on the reversal row → action menu has no Void and no Reverse (locked per spec).

- [ ] **Sale-row Reverse end-to-end**

If you don't have a sold unit, create one via the Inventory tab first (Phase 3 flow).

Find the sale row in the Financials tab. Click ⋯ → `Reverse`. Submit.

Expected:
- Reversal row appears with the same amount and `Reversal of: Sale of Apartment X to Y` description
- Unit is STILL marked sold in the Inventory tab — Phase 5 reversal doesn't touch the units doc (per spec: "the sale was correctly recorded but we owe the buyer a refund")
- Revenue tile reflects the net (original − reversal = 0 for this pair)

- [ ] **Purchase-row Reverse end-to-end**

If you don't have a purchase, create one via the Materials tab (Phase 4 flow). Then reverse it.

Expected:
- Reversal row appears with `Reversal of: Purchase: <material name>` description
- `projectMaterials.stockOnHand` is UNCHANGED — Phase 5 reversal doesn't decrement stock or void the linked materialMovements row (known scope limit per spec; reserved for a future cleanup phase)
- Expenses tile decreases by the reversal amount

`mongosh` confirms:
```js
db.projectMaterials.findOne({ projectId: ObjectId("<id>"), materialId: ObjectId("<mid>") }).stockOnHand
// unchanged
db.materialMovements.findOne({ projectId: ObjectId("<id>"), materialId: ObjectId("<mid>"), category: "purchase" }).voided
// undefined (unchanged)
```

- [ ] **reverseTransaction refuses voided rows**

On a voided ad-hoc row (toggle to include voided to see them), confirm: the action menu shows nothing. There's no UI path to reverse a voided row. (Server-side: if a crafted request were sent, the action returns `Cannot reverse a voided transaction.` — confirmable via code review of `actions.ts`.)

- [ ] **reverseTransaction refuses reversal rows**

On a reversal row (one with the "Reversal" sub-badge), the action menu is empty. Same server-side guard.

- [ ] **reverseTransaction refuses transfer rows**

Phase 6 hasn't shipped yet, so no transfer rows exist. This guard is verified via code review — confirm `reverseTransaction` in `lib/transactions/repository.ts` throws `CannotReverseError("is-transfer")` when `category === "transfer_in" || "transfer_out"`.

- [ ] **`computeTotals` matches displayed ledger**

Pick a non-trivial filter window (e.g. kind=income, January-July 2026, voided=active). Sum the visible amounts manually (treating reversal rows as negative). Compare against the Revenue tile. They should be equal.

- [ ] **`/financials` cross-project view**

Visit `/financials` as admin. Confirm:
- 3 tiles show aggregate revenue/expenses/net across ALL projects
- Per-project table lists each project with its individual revenue/expenses/net
- Clicking a project name navigates to that project's Financials tab
- The sum of per-project rows equals the aggregate tiles

- [ ] **FM redirect on `/financials`**

Sign out, sign in as a non-admin. Type `http://localhost:3000/financials` directly. Expected:
- Redirect to `/`
- The "Financials" nav link is absent from the header

- [ ] **FM cannot see project's Financials tab**

As FM, visit `/projects/<id>`. The Financials tab trigger is absent (admin-only render in project-tabs.tsx).

- [ ] **Final clean state**

```bash
git status
git log --oneline -20
```

Working tree clean. Phase 5 commits visible.

- [ ] **Update meta-plan**

Open `C:\Users\simra\.claude\plans\make-multiple-small-plans-structured-dragon.md` and update the Phase 5 row:

```
| 5 | `docs/plans/phase-5-financials.md` | Admin-only per-project Financials tab + new `/financials` top-level cross-project route. 3 filter-aware summary tiles, ledger with URL-synced filters, ad-hoc income/expense, two-path corrections (soft-void + reversing entries via reversalOf FK). First writer of `category: "adhoc"` rows. **(Detailed in repo; verified working and merged to master.)** |
```

---

## Notes for Phase 6 (next phase)

Phase 5 leaves `transfer_in` and `transfer_out` categories untouched in the enum. Phase 6 writes paired rows inside `withTransaction` (one per project of the transfer pair). The Phase 5 ledger already filters them; the Phase 5 reverse action explicitly refuses them so Phase 6 can own the transfer-correction flow without conflicting.

Phase 5's `computeTotals` aggregation handles transfer rows correctly without modification — they're just `income`/`expense` rows like anything else and the reversalOf $cond works the same way. Phase 6 transfer reversal will likely write paired reversal rows (one per project, both with reversalOf set, inside one withTransaction).

The "material-purchase reversal doesn't decrement stock" known limit (spec calls it out) is the natural shape of a future "atomic material correction" cleanup task. When that lands, it would extend Phase 5's reverseTransaction with an opt-in `andUnstock: true` flag for purchase category, which inside the withTransaction also: voids the linked materialMovements row, decrements projectMaterials.stockOnHand by the original qty, and inserts the financial reversal — all atomically. Out of scope here.

Phase 7 polish remaining for the Financials surface: CSV export of filtered ledger, free-text search on description/buyer/notes, pagination if ledger growth warrants, drilldown sheet showing full row detail (audit info, linked entity drilldown), clickable "Reversal of #X" badges that jump to the linked row.
