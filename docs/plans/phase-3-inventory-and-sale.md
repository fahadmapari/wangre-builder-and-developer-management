# Phase 3 — Inventory & Sale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-05-14-phase-3-inventory-and-sale-design.md`](../superpowers/specs/2026-05-14-phase-3-inventory-and-sale-design.md) (committed in `d6d2ede`).

**Goal:** Admin can mark a unit sold (atomic update of the `units` doc + insert of a linked `transactions` ledger row) and can unmark sold (soft-void the ledger row, restore the unit). Both roles can view a filterable Inventory tab. The project detail header's `Sold` and `Revenue` tiles populate from live queries.

**Architecture:** A new `transactions` collection is introduced. Two server actions (`markUnitSold`, `unmarkUnitSold`) each wrap a Mongo `withTransaction` with a **conditional `updateOne`** on the unit (matching on `status: "available"` or `status: "sold"` respectively) — that's how concurrent admins on the same unit get rejected cleanly instead of corrupting state. The Inventory tab uses a hybrid pattern: the existing client `ProjectTabs` gets an `inventory?: ReactNode` prop; the project detail page (server) renders an `InventoryFilters` client component plus an `InventoryTable` server component as siblings and passes them in. Filter state lives in URL search params so it survives reload and re-renders the server table.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript, native `mongodb` driver with transactions (Atlas replica set), Zod, Tailwind v4 + shadcn/ui radix-nova. One new shadcn primitive (`alert-dialog`).

---

## File Structure

**Create:**
- `lib/transactions/schemas.ts` — Zod schemas for `MarkUnitSoldInputSchema`, kind/category enums, domain `Transaction` type.
- `lib/transactions/repository.ts` — `markUnitSold(input, userId)`, `unmarkUnitSold(unitId, userId)`, `sumProjectRevenue(projectId)`. Wraps `withTransaction` for the multi-collection mutations.
- `app/(authed)/projects/[id]/inventory/actions.ts` — `markUnitSold` and `unmarkUnitSold` server actions.
- `app/(authed)/projects/[id]/inventory/inventory-table.tsx` — server component, filterable units table.
- `app/(authed)/projects/[id]/inventory/inventory-filters.tsx` — client component, filter chips + URL sync.
- `app/(authed)/projects/[id]/inventory/mark-sold-dialog.tsx` — client component, form for marking sold.
- `app/(authed)/projects/[id]/inventory/unmark-confirm-dialog.tsx` — client component, simple AlertDialog.

**Modify:**
- `lib/projects/repository.ts` — add `countSoldUnits(projectId)` and `listUnitsForProject(projectId, filters)`.
- `app/(authed)/projects/[id]/project-tabs.tsx` — add `inventory?: ReactNode` prop; render `{inventory}` inside the Inventory `<TabsContent>` instead of the placeholder.
- `app/(authed)/projects/[id]/page.tsx` — parallel-fetch project + sold count + revenue; render real tile values; pass `<InventoryFilters />` + `<InventoryTable />` into `<ProjectTabs>`.
- `scripts/init-db.mjs` — add 3 new `transactions` indexes (idempotent).

**Add via `npx shadcn@latest add`:**
- `alert-dialog`.

---

## Task 1 — Install shadcn alert-dialog

**Files:**
- Create: `components/ui/alert-dialog.tsx`

- [ ] **Step 1: Run shadcn add**

```bash
npx shadcn@latest add alert-dialog
```

Expected: `components/ui/alert-dialog.tsx` appears. If shadcn prompts about overwrites, choose "skip".

- [ ] **Step 2: Verify nothing unexpected changed**

```bash
git status
```

Expected: only `components/ui/alert-dialog.tsx` is new. Some shadcn versions also touch `package.json` / `package-lock.json` for `@radix-ui/react-alert-dialog` — that's fine.

- [ ] **Step 3: Commit**

```bash
git add components/ui/alert-dialog.tsx package.json package-lock.json
git commit -m "chore: add shadcn alert-dialog primitive"
```

If `package.json` / `package-lock.json` weren't touched, drop them from the `git add` line.

---

## Task 2 — Extend `db:init` script with `transactions` indexes

**Files:**
- Modify: `scripts/init-db.mjs`

- [ ] **Step 1: Replace the script body**

Open `scripts/init-db.mjs` and replace its contents with:

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

console.log(
  "Indexes ensured: users.email (unique); projects.createdAt, projects.name; " +
    "units.(projectId,type,status), units.(projectId,type,number) unique, units.(status,soldAt); " +
    "transactions.(projectId,occurredAt), transactions.(projectId,kind,voided), transactions.(unitId,voided)"
)

await client.close()
```

- [ ] **Step 2: Run it**

```bash
npm run db:init
```

Expected output: a single log line listing all indexes including the three new `transactions` ones. Exit 0. Re-run once more to confirm idempotency — same output, no error.

- [ ] **Step 3: Commit**

```bash
git add scripts/init-db.mjs
git commit -m "chore(db): add transactions indexes for Phase 3"
```

---

## Task 3 — Transactions schemas and domain types

**Files:**
- Create: `lib/transactions/schemas.ts`

- [ ] **Step 1: Write `lib/transactions/schemas.ts`**

```ts
import { z } from "zod"
import type { ObjectId } from "mongodb"

export const TransactionKindSchema = z.enum(["income", "expense"])
export type TransactionKind = z.infer<typeof TransactionKindSchema>

// Full category enum is declared up-front to avoid migrations as Phases 4–6
// land. Phase 3 only writes "sale".
export const TransactionCategorySchema = z.enum([
  "sale",
  "purchase",
  "transfer_in",
  "transfer_out",
  "adhoc",
])
export type TransactionCategory = z.infer<typeof TransactionCategorySchema>

// Mark-sold dialog input. `unitId` and `projectId` are passed as ObjectId
// hex strings from the client; the server action converts them.
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
  createdBy: ObjectId
  createdAt: Date
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/transactions/schemas.ts
git commit -m "feat(transactions): add Zod schemas and Transaction domain type"
```

---

## Task 4 — Transactions repository (markUnitSold / unmarkUnitSold / sumProjectRevenue)

**Files:**
- Create: `lib/transactions/repository.ts`

- [ ] **Step 1: Write `lib/transactions/repository.ts`**

```ts
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
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/transactions/repository.ts
git commit -m "feat(transactions): add markUnitSold/unmarkUnitSold/sumProjectRevenue"
```

---

## Task 5 — Extend projects repository

**Files:**
- Modify: `lib/projects/repository.ts`

- [ ] **Step 1: Append new helpers**

Open `lib/projects/repository.ts` and replace its contents with:

```ts
import { ObjectId } from "mongodb"
import client, { getDb } from "@/lib/db/client"
import type {
  Project,
  Unit,
  UnitType,
  UnitStatus,
  ProjectStatus,
} from "./schemas"
import {
  generateApartmentNumbers,
  generateParkingNumbers,
} from "./generation"

export async function listProjects(): Promise<Project[]> {
  const db = getDb()
  return db
    .collection<Project>("projects")
    .find({})
    .sort({ createdAt: -1 })
    .toArray()
}

export async function getProject(id: string): Promise<Project | null> {
  if (!ObjectId.isValid(id)) return null
  const db = getDb()
  return db
    .collection<Project>("projects")
    .findOne({ _id: new ObjectId(id) })
}

export async function countSoldUnits(projectId: ObjectId): Promise<number> {
  const db = getDb()
  return db
    .collection<Unit>("units")
    .countDocuments({ projectId, status: "sold" })
}

export type UnitFilters = {
  types: UnitType[]   // [] means "no filter"
  statuses: UnitStatus[]
}

export async function listUnitsForProject(
  projectId: ObjectId,
  filters: UnitFilters
): Promise<Unit[]> {
  const db = getDb()
  const query: Record<string, unknown> = { projectId }
  if (filters.types.length > 0) query.type = { $in: filters.types }
  if (filters.statuses.length > 0) query.status = { $in: filters.statuses }
  return db
    .collection<Unit>("units")
    .find(query)
    .sort({ floor: 1, number: 1 })
    .toArray()
}

export async function createProjectWithUnits(
  input: {
    name: string
    location: string
    status: ProjectStatus
    totalUnits: number
    totalParkings: number
    notes?: string
    startingUnitNumber: number
    unitsPerFloor: number
    parkingPrefix: string
  },
  userId: string
): Promise<{ projectId: ObjectId }> {
  const createdBy = new ObjectId(userId)
  const session = client.startSession()
  try {
    let projectId!: ObjectId
    await session.withTransaction(async () => {
      const db = getDb()
      const projects = db.collection<Omit<Project, "_id">>("projects")
      const units = db.collection<Omit<Unit, "_id">>("units")
      const now = new Date()

      const projectDoc: Omit<Project, "_id"> = {
        name: input.name,
        location: input.location,
        status: input.status,
        totalUnits: input.totalUnits,
        totalParkings: input.totalParkings,
        notes: input.notes,
        createdBy,
        createdAt: now,
        updatedAt: now,
      }
      const projectResult = await projects.insertOne(projectDoc, { session })
      projectId = projectResult.insertedId

      const apartments: Omit<Unit, "_id">[] = generateApartmentNumbers({
        total: input.totalUnits,
        startingUnitNumber: input.startingUnitNumber,
        unitsPerFloor: input.unitsPerFloor,
      }).map((u) => ({
        projectId,
        type: "apartment" as UnitType,
        number: u.number,
        floor: u.floor,
        areaSqft: 0,
        salePrice: 0,
        status: "available",
        notes: "",
        createdBy,
        createdAt: now,
        updatedAt: now,
      }))

      const parkings: Omit<Unit, "_id">[] = generateParkingNumbers({
        total: input.totalParkings,
        prefix: input.parkingPrefix,
      }).map((p) => ({
        projectId,
        type: "parking" as UnitType,
        number: p.number,
        floor: p.floor,
        areaSqft: 0,
        salePrice: 0,
        status: "available",
        notes: "",
        createdBy,
        createdAt: now,
        updatedAt: now,
      }))

      if (apartments.length > 0)
        await units.insertMany(apartments, { session })
      if (parkings.length > 0) await units.insertMany(parkings, { session })
    })
    return { projectId }
  } finally {
    await session.endSession()
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/projects/repository.ts
git commit -m "feat(projects): add countSoldUnits and listUnitsForProject"
```

---

## Task 6 — Inventory server actions

**Files:**
- Create: `app/(authed)/projects/[id]/inventory/actions.ts`

- [ ] **Step 1: Write the actions file**

```ts
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
```

Notes for the executor:
- `requireAdmin()` is the FIRST executable line of both actions. A floor manager who crafts a direct POST hits the redirect before validation runs.
- Sale-action returns success-with-id rather than calling `redirect()`. The client closes the dialog on success; the `revalidatePath` triggers a re-render of the detail page.
- Unmark uses `revalidatePath("/projects", "layout")` because the action signature only takes `unitId` — passing the projectId would be cleaner but adds a round-trip; this revalidates everything under `/projects`, which is fine at v1 scale.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/inventory/actions.ts"
git commit -m "feat(inventory): add markUnitSold/unmarkUnitSold server actions"
```

---

## Task 7 — Mark-sold dialog (client)

**Files:**
- Create: `app/(authed)/projects/[id]/inventory/mark-sold-dialog.tsx`

- [ ] **Step 1: Write the dialog component**

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
import { markUnitSold } from "./actions"

type FormState = {
  salePrice: number
  buyerName: string
  saleDate: string
  description: string
  notes: string
}

function isoDateToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function descriptionFor(
  unitType: "apartment" | "parking",
  unitNumber: string,
  buyerName: string
): string {
  const typeLabel = unitType === "apartment" ? "Apartment" : "Parking"
  const buyer = buyerName.trim() || "buyer"
  return `Sale of ${typeLabel} ${unitNumber} to ${buyer}`
}

export function MarkSoldButton({
  projectId,
  unitId,
  unitType,
  unitNumber,
}: {
  projectId: string
  unitId: string
  unitType: "apartment" | "parking"
  unitNumber: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Mark sold
      </Button>
      {/* key forces React to remount the dialog on each open/close cycle so
          internal useState resets cleanly (Phase 2 dialog-remount fix). */}
      <MarkSoldDialog
        key={open ? `open-${unitId}` : "closed"}
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        unitId={unitId}
        unitType={unitType}
        unitNumber={unitNumber}
      />
    </>
  )
}

function MarkSoldDialog({
  open,
  onOpenChange,
  projectId,
  unitId,
  unitType,
  unitNumber,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  projectId: string
  unitId: string
  unitType: "apartment" | "parking"
  unitNumber: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)
  const [descriptionTouched, setDescriptionTouched] = useState(false)

  const [form, setForm] = useState<FormState>({
    salePrice: 0,
    buyerName: "",
    saleDate: isoDateToday(),
    description: descriptionFor(unitType, unitNumber, ""),
    notes: "",
  })

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function onBuyerBlur() {
    if (descriptionTouched) return
    set("description", descriptionFor(unitType, unitNumber, form.buyerName))
  }

  function handleSubmit() {
    setErrorMsg(null)
    setErrorField(null)
    startTransition(async () => {
      const result = await markUnitSold({
        projectId,
        unitId,
        salePrice: form.salePrice,
        buyerName: form.buyerName,
        saleDate: form.saleDate,
        description: form.description,
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

  const unitLabel =
    unitType === "apartment" ? `Apartment ${unitNumber}` : `Parking ${unitNumber}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mark {unitLabel} sold</DialogTitle>
          <DialogDescription>
            Records the sale and inserts a linked income transaction.
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
            label="Sale price (₹)"
            htmlFor="salePrice"
            error={errorField === "salePrice" ? errorMsg : null}
          >
            <Input
              id="salePrice"
              type="number"
              min={1}
              step={1}
              value={form.salePrice || ""}
              onChange={(e) => set("salePrice", Number(e.target.value))}
              disabled={isPending}
              autoFocus
            />
          </Field>
          <Field
            label="Buyer name"
            htmlFor="buyerName"
            error={errorField === "buyerName" ? errorMsg : null}
          >
            <Input
              id="buyerName"
              value={form.buyerName}
              onChange={(e) => set("buyerName", e.target.value)}
              onBlur={onBuyerBlur}
              disabled={isPending}
            />
          </Field>
          <Field
            label="Sale date"
            htmlFor="saleDate"
            error={errorField === "saleDate" ? errorMsg : null}
          >
            <Input
              id="saleDate"
              type="date"
              value={form.saleDate}
              onChange={(e) => set("saleDate", e.target.value)}
              disabled={isPending}
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
              onChange={(e) => {
                setDescriptionTouched(true)
                set("description", e.target.value)
              }}
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
              {isPending ? "Recording…" : "Mark sold"}
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

Notes for the executor:
- `saleDate` is held as an ISO `YYYY-MM-DD` string in form state; Zod's `z.coerce.date()` parses it on the server.
- The description auto-fills until the user edits it; after a manual edit, `descriptionTouched` locks it.
- `router.refresh()` after success re-fetches the server tree, so the new sale appears immediately. `revalidatePath` in the action covers other open windows.

- [ ] **Step 2: Skip typecheck for now**

This file imports `./actions` (exists from Task 6) but it's rendered from `inventory-table.tsx` which doesn't exist yet. Confirm with `git diff` and move on.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/inventory/mark-sold-dialog.tsx"
git commit -m "feat(inventory): add mark-sold dialog with form and auto description"
```

---

## Task 8 — Unmark confirm dialog (client)

**Files:**
- Create: `app/(authed)/projects/[id]/inventory/unmark-confirm-dialog.tsx`

- [ ] **Step 1: Write the AlertDialog component**

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
import { unmarkUnitSold } from "./actions"

export function UnmarkButton({
  unitId,
  unitType,
  unitNumber,
}: {
  unitId: string
  unitType: "apartment" | "parking"
  unitNumber: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const unitLabel =
    unitType === "apartment" ? `Apartment ${unitNumber}` : `Parking ${unitNumber}`

  function confirm() {
    setErrorMsg(null)
    startTransition(async () => {
      const result = await unmarkUnitSold({ unitId })
      if (!result.ok) {
        setErrorMsg(result.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setErrorMsg(null)
          setOpen(true)
        }}
      >
        Unmark
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unmark {unitLabel} as sold?</AlertDialogTitle>
            <AlertDialogDescription>
              The unit will return to available. The original sale row stays in
              the ledger marked as voided — the sale history is preserved.
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
                // AlertDialogAction closes the dialog by default; we want to
                // keep it open on error, so preventDefault and drive close
                // ourselves from confirm() on success.
                e.preventDefault()
                confirm()
              }}
              disabled={isPending}
            >
              {isPending ? "Unmarking…" : "Unmark"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
```

- [ ] **Step 2: Skip typecheck for now**

Imports `./actions` (exists). Rendered from inventory-table.tsx (Task 9). Move on.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/inventory/unmark-confirm-dialog.tsx"
git commit -m "feat(inventory): add unmark-sold confirm dialog"
```

---

## Task 9 — Inventory filters (client)

**Files:**
- Create: `app/(authed)/projects/[id]/inventory/inventory-filters.tsx`

- [ ] **Step 1: Write the filter chips component**

```tsx
"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"
import { Button } from "@/components/ui/button"

const TYPE_OPTIONS = [
  { value: "apartment", label: "Apartments" },
  { value: "parking", label: "Parkings" },
  { value: "all", label: "All" },
] as const

const STATUS_OPTIONS = [
  { value: "available", label: "Available" },
  { value: "sold", label: "Sold" },
  { value: "all", label: "All" },
] as const

export function InventoryFilters() {
  const router = useRouter()
  const sp = useSearchParams()
  const [, startTransition] = useTransition()

  const type = sp.get("type") ?? "apartment"
  const status = sp.get("status") ?? "available"

  function setParam(key: "type" | "status", value: string) {
    const next = new URLSearchParams(sp.toString())
    next.set(key, value)
    startTransition(() => {
      router.replace(`?${next.toString()}`, { scroll: false })
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-4 pb-3">
      <ChipGroup
        label="Type"
        options={TYPE_OPTIONS}
        active={type}
        onSelect={(v) => setParam("type", v)}
      />
      <ChipGroup
        label="Status"
        options={STATUS_OPTIONS}
        active={status}
        onSelect={(v) => setParam("status", v)}
      />
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
      <div className="flex gap-1">
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
git add "app/(authed)/projects/[id]/inventory/inventory-filters.tsx"
git commit -m "feat(inventory): add filter chips with URL sync"
```

---

## Task 10 — Inventory table (server)

**Files:**
- Create: `app/(authed)/projects/[id]/inventory/inventory-table.tsx`

- [ ] **Step 1: Write the table server component**

```tsx
import { ObjectId } from "mongodb"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  listUnitsForProject,
  type UnitFilters,
} from "@/lib/projects/repository"
import type { UnitStatus, UnitType } from "@/lib/projects/schemas"
import type { Role } from "@/types"
import { MarkSoldButton } from "./mark-sold-dialog"
import { UnmarkButton } from "./unmark-confirm-dialog"

const INR = new Intl.NumberFormat("en-IN")

function formatRupees(n: number): string {
  return `₹${INR.format(n)}`
}

function formatDate(d?: Date): string {
  return d ? d.toLocaleDateString() : ""
}

export type InventoryFilterParams = {
  type?: string
  status?: string
}

function parseFilters(p: InventoryFilterParams): UnitFilters {
  const types: UnitType[] =
    p.type === "parking"
      ? ["parking"]
      : p.type === "all"
        ? []
        : ["apartment"] // default
  const statuses: UnitStatus[] =
    p.status === "sold"
      ? ["sold"]
      : p.status === "all"
        ? []
        : ["available"] // default
  return { types, statuses }
}

export async function InventoryTable({
  projectId,
  role,
  searchParams,
}: {
  projectId: string
  role: Role
  searchParams: InventoryFilterParams
}) {
  const filters = parseFilters(searchParams)
  const units = await listUnitsForProject(new ObjectId(projectId), filters)

  if (units.length === 0) {
    return (
      <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
        No units match these filters.
      </Card>
    )
  }

  const showActions = role === "admin"

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Number</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Floor</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Buyer</th>
            <th className="px-4 py-3">Sold price</th>
            <th className="px-4 py-3">Sold date</th>
            {showActions ? <th className="px-4 py-3" /> : null}
          </tr>
        </thead>
        <tbody>
          {units.map((u) => (
            <tr key={String(u._id)} className="border-b border-border last:border-0">
              <td className="px-4 py-3 font-mono">{u.number}</td>
              <td className="px-4 py-3 capitalize">{u.type}</td>
              <td className="px-4 py-3 font-mono">{u.floor}</td>
              <td className="px-4 py-3">
                <Badge variant={u.status === "sold" ? "default" : "secondary"}>
                  {u.status === "sold" ? "Sold" : "Available"}
                </Badge>
              </td>
              <td className="px-4 py-3">{u.buyerName ?? ""}</td>
              <td className="px-4 py-3 font-mono">
                {u.soldPriceTotal ? formatRupees(u.soldPriceTotal) : ""}
              </td>
              <td className="px-4 py-3">{formatDate(u.soldAt)}</td>
              {showActions ? (
                <td className="px-4 py-3 text-right">
                  {u.status === "available" ? (
                    <MarkSoldButton
                      projectId={projectId}
                      unitId={String(u._id)}
                      unitType={u.type}
                      unitNumber={u.number}
                    />
                  ) : (
                    <UnmarkButton
                      unitId={String(u._id)}
                      unitType={u.type}
                      unitNumber={u.number}
                    />
                  )}
                </td>
              ) : null}
            </tr>
          ))}
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

Expected: 0 errors. (Tasks 7 and 8 now compile because Task 10 references them concretely.)

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/inventory/inventory-table.tsx"
git commit -m "feat(inventory): add server-rendered units table with role-gated actions"
```

---

## Task 11 — Wire up: project-tabs prop + page.tsx parallel-fetch

**Files:**
- Modify: `app/(authed)/projects/[id]/project-tabs.tsx`
- Modify: `app/(authed)/projects/[id]/page.tsx`

- [ ] **Step 1: Update `project-tabs.tsx` to accept an `inventory` prop**

Replace `app/(authed)/projects/[id]/project-tabs.tsx` contents with:

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
}: {
  role: Role
  inventory?: ReactNode
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
        <Placeholder>Materials tracking coming in Phase 4.</Placeholder>
      </TabsContent>
      {role === "admin" ? (
        <TabsContent value="financials">
          <Placeholder>Financial ledger coming in Phase 5.</Placeholder>
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

- [ ] **Step 2: Update `page.tsx` to parallel-fetch and pass inventory in**

Replace `app/(authed)/projects/[id]/page.tsx` contents with:

```tsx
import { ObjectId } from "mongodb"
import { notFound } from "next/navigation"
import { requireAuth } from "@/lib/auth/session"
import {
  countSoldUnits,
  getProject,
} from "@/lib/projects/repository"
import { sumProjectRevenue } from "@/lib/transactions/repository"
import { Badge } from "@/components/ui/badge"
import { ProjectTabs } from "./project-tabs"
import { InventoryFilters } from "./inventory/inventory-filters"
import {
  InventoryTable,
  type InventoryFilterParams,
} from "./inventory/inventory-table"

const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  under_construction: "Under construction",
  completed: "Completed",
  on_hold: "On hold",
}

const INR = new Intl.NumberFormat("en-IN")

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<InventoryFilterParams>
}) {
  const user = await requireAuth()
  const { id } = await params
  const sp = await searchParams

  if (!ObjectId.isValid(id)) notFound()
  const projectObjectId = new ObjectId(id)

  const [project, soldCount, revenue] = await Promise.all([
    getProject(id),
    countSoldUnits(projectObjectId),
    sumProjectRevenue(projectObjectId),
  ])
  if (!project) notFound()

  const totalUnitsAndParkings = project.totalUnits + project.totalParkings

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
- The `muted` and `hint` props on `Tile` from Phase 2 are removed — these are real numbers now, not placeholders. The detail page renders a clean tile with no muted styling.
- `searchParams` is awaited (Next.js 16 promise-based).
- `notFound()` runs both for invalid ObjectId hex and missing-document cases.

- [ ] **Step 3: Typecheck + lint**

```bash
npm run typecheck
npm run lint
```

Expected: 0 errors. Both Phase 3 and prior phase code compile clean.

- [ ] **Step 4: Commit**

```bash
git add "app/(authed)/projects/[id]/project-tabs.tsx" "app/(authed)/projects/[id]/page.tsx"
git commit -m "feat(inventory): wire inventory tab and light up sold/revenue tiles"
```

---

## Task 12 — End-to-end verification

No code in this task. Run through the spec's verification list. Use the **superpowers:verification-before-completion** skill before reporting Phase 3 done.

**Before starting:** confirm a clean tree with `git status` and that you're on the correct branch (`feat/phase-3-inventory-and-sale` if you used a feature branch).

You will need at least one existing project from Phase 2 with apartments and parkings; if you don't have one, create one via the Phase 2 UI first.

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

Both runs print the same line listing all indexes (including three `transactions` ones) and exit 0.

- [ ] **Admin: mark-sold happy path**

Start the dev server (`npm run dev`). Sign in as the admin (in `ADMIN_EMAILS`). Open `/projects/<id>` for a Phase 2 project with at least 12 apartments + 4 parkings.

- The Inventory tab opens by default (filters: Apartments + Available).
- The filter chips show Apartments and Available highlighted.
- Apartment 101 has a `[Mark sold]` button on its row.

Click `[Mark sold]` on Apt 101. In the dialog:
- Sale price: `5000000`
- Buyer name: `Ramesh Kumar`
- Sale date: today
- Description: pre-filled `Sale of Apartment 101 to Ramesh Kumar` after blurring the buyer field
- Notes: leave empty

Submit. Expected:
- Dialog closes.
- Row 101 now shows status `Sold`, Buyer `Ramesh Kumar`, Sold price `₹50,00,000`, Sold date today, button `[Unmark]`.
- Header tile: **Sold** `1 / <total>`. **Revenue** `₹50,00,000`.

- [ ] **Filter switch shows expected rows**

Switch Status chip to `Sold` only. Expected: only row 101 visible. Switch back to `Available`. Expected: 11 remaining apartments visible (no 101). Switch Type to `Parkings` → only 4 P00x rows. Switch Type to `All` → all 15 remaining units (12 apts + 4 parkings - 1 sold).

- [ ] **`mongosh` checks after mark-sold**

In a separate terminal:

```bash
mongosh "$env:MONGODB_URI"   # PowerShell — for bash use $MONGODB_URI
use wangredev
db.units.findOne({ projectId: ObjectId("<id>"), number: "101" })
db.transactions.find({ unitId: ObjectId("<unit-101-id>") }).toArray()
```

Expected unit doc:
- `status: "sold"`
- `soldPriceTotal: 5000000`
- `buyerName: "Ramesh Kumar"`
- `soldAt: ISODate(...)`  (today)

Expected one transaction row:
- `projectId`, `unitId` correct
- `kind: "income"`, `category: "sale"`
- `amount: 5000000`, `currency: "INR"`
- `description: "Sale of Apartment 101 to Ramesh Kumar"`
- `occurredAt: ISODate(today)`
- `buyerName: "Ramesh Kumar"`
- `notes: ""`
- `voided` absent (not yet voided)
- `createdBy: ObjectId(...)`, `createdAt: ISODate(...)`

- [ ] **Validation error paths**

As admin, open mark-sold on Apt 102:
- Submit with sale price `0` → inline error on the field "Must be at least ₹1"; dialog stays open; no writes.
- Set sale price `1000000`, empty buyer name → submit → inline error "Buyer name is required"; no writes.

- [ ] **Atomicity smoke test**

Open `lib/transactions/repository.ts`. Inside `markUnitSold`, between the `updateOne` and `txns.insertOne`, add:

```ts
throw new Error("synthetic test failure")
```

Save. As admin, attempt to mark Apt 102 sold. Expected:
- Dialog shows error `Could not record sale. Please try again.`
- Dialog stays open.
- `mongosh`: `db.units.findOne({ projectId, number: "102" }).status === "available"` (unchanged).
- `mongosh`: `db.transactions.countDocuments({ unitId: ObjectId("<102-id>") }) === 0`.

**REMOVE the synthetic throw before continuing.** Then verify a real mark-sold of Apt 102 still works.

- [ ] **Race smoke test**

Open the mark-sold dialog for Apt 103. **Do not submit yet.**

In `mongosh`, manually flip the unit to sold:

```js
db.units.updateOne(
  { projectId: ObjectId("<id>"), number: "103" },
  { $set: { status: "sold", soldAt: new Date(), soldPriceTotal: 1, buyerName: "Manual" } }
)
```

Now submit the dialog. Expected:
- Dialog shows `"Unit is no longer available — someone else may have just sold it. Refresh and try again."`
- No new transaction row inserted (verify with `db.transactions.countDocuments({ unitId: ObjectId("<103-id>") }) === 0`).
- The unit's `status: "sold"` from the manual update is preserved.

Reset Apt 103 manually in `mongosh` (it doesn't really need to be cleaned up, but it's nice to leave a clean state):

```js
db.units.updateOne(
  { projectId: ObjectId("<id>"), number: "103" },
  { $set: { status: "available", updatedAt: new Date() }, $unset: { soldAt: "", soldPriceTotal: "", buyerName: "" } }
)
```

- [ ] **Unmark-sold happy path**

In the UI, click `[Unmark]` on the sold Apt 101 row. AlertDialog opens. Confirm. Expected:
- Row 101 flips back to Available; buyer / sold price / sold date columns blank.
- Action button is `[Mark sold]` again.
- Header tile: **Sold** `0 / <total>`. **Revenue** `₹0`.

`mongosh` checks:
- `db.units.findOne({ projectId, number: "101" })` → `status: "available"`, no `soldAt` / `soldPriceTotal` / `buyerName` fields (they were `$unset`).
- `db.transactions.findOne({ unitId: ObjectId("<101-id>") })` → still present, with `voided: true`, `voidedAt: ISODate(...)`, `voidedBy: ObjectId(...)`. The original row is preserved.

- [ ] **Re-mark after unmark**

Mark Apt 101 sold again with a different price (e.g. `4500000`) and a different buyer (`Priya Sharma`). Expected:
- Row updates with new values.
- Header tile **Revenue**: `₹45,00,000` (NOT the sum of both — voided rows excluded).

`mongosh`:
- `db.transactions.find({ unitId: ObjectId("<101-id>") }).toArray()` returns **two** rows: the voided original (`amount: 5000000, voided: true`) and the new active one (`amount: 4500000, voided` absent).

- [ ] **Floor manager flow**

Sign out, sign in as a non-admin user (anyone NOT in `ADMIN_EMAILS`). Visit `/projects/<id>`.
- Header tiles all visible, including **Sold** and **Revenue** with real numbers.
- Inventory tab default view: Apartments + Available.
- Sold rows (when filtered to Sold) show buyer name, sold price, sold date — these are visible per the brainstorm decision.
- **No** `[Mark sold]` or `[Unmark]` buttons anywhere. The Action column is omitted entirely (not just buttons hidden).
- No `Financials` tab trigger (carry-over from Phase 2).

- [ ] **Direct action call as floor manager**

While signed in as a floor manager, the cleanest verification is to read the action source: confirm `await requireAdmin()` is the first executable line of both `markUnitSold` and `unmarkUnitSold` in `app/(authed)/projects/[id]/inventory/actions.ts`. `requireAdmin` redirects floor managers; they cannot reach the DB code path.

Optional behavioral check via DevTools: in the Network tab, replay a successful admin mark-sold request after signing back in as a floor manager. The response should be a redirect / not the success payload.

- [ ] **Final clean state**

```bash
git status
git log --oneline -15
```

Working tree clean. Recent commit history shows the Phase 3 work as per-task commits.

- [ ] **Update meta-plan**

Open `C:\Users\simra\.claude\plans\make-multiple-small-plans-structured-dragon.md` and update the Phase 3 row in the phase map table to indicate it's verified:

```
| 3 | `docs/plans/phase-3-inventory-and-sale.md` | `transactions` collection, Inventory tab with filterable units table, Mark/Unmark sold flows (atomic units + transactions writes with soft-void on unmark), header tiles light up. **(Detailed in repo; verified working.)** |
```

Mirrors the convention from Phases 1 and 2.

---

## Notes for Phase 4 (next phase)

Phase 3 introduces the `transactions` collection with the full category enum already declared (`sale | purchase | transfer_in | transfer_out | adhoc`) and `kind: "income" | "expense"`. Phase 4 (Materials) will start writing `kind: "expense", category: "purchase"` rows when materials are purchased. No schema changes expected — the only new field a Phase 4 transaction needs is a reference to a future `materials` collection, which can live as another optional discriminator field added then.

Phase 5 (Financials) will read the `transactions` collection and present it as a ledger view. The indexes added in Task 2 (`{projectId, occurredAt}`, `{projectId, kind, voided}`) cover the expected Phase 5 queries.

The soft-void pattern (this phase) and the reversing-entry pattern (Phase 5) coexist: soft-void handles "I just made a mistake clicking the button"; reversing entries handle "this expense was double-counted three weeks ago and we want the original event preserved in date-ordered history."
