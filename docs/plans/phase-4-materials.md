# Phase 4 — Materials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-05-15-phase-4-materials-design.md`](../superpowers/specs/2026-05-15-phase-4-materials-design.md) (committed in `dfe5848`).

**Goal:** Admin manages a global materials catalog and records purchases (writes `kind: "expense", category: "purchase"` rows to the existing `transactions` ledger and increments per-project stock). Both roles log consumption (race-safe atomic decrement) and returns (idempotent increment). Floor managers can add new catalog entries in-context but cannot see prices or amounts anywhere.

**Architecture:** Three new collections: `materials` (global catalog), `projectMaterials` (per-project stock counter, lazy-upserted on first movement), `materialMovements` (append-only event log). Five server actions, each starting with `requireAuth()` or `requireAdmin()`. `recordPurchase`, `logConsumption`, and `logReturn` wrap a Mongo `withTransaction`. `logConsumption` uses a conditional `findOneAndUpdate({stockOnHand: {$gte: qty}}, {$inc: {stockOnHand: -qty}})` for race-safety — mirrors Phase 3's "conditional updateOne" pattern. A new admin-only top-level route `/catalog` manages the global catalog; the existing `/projects/[id]` Materials tab (currently a placeholder) gets the per-project stock table, in-context add-material dialog (FM-safe), and movement action dialogs.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript, native `mongodb` driver with transactions (Atlas replica set), Zod, Tailwind v4 + shadcn/ui radix-nova. One new shadcn primitive (`sheet`).

---

## File Structure

**Create:**
- `lib/materials/schemas.ts` — Zod schemas (`MaterialUnitSchema`, `CreateMaterialInputSchema`, `UpdateMaterialInputSchema`, `RecordPurchaseInputSchema`, `LogConsumptionInputSchema`, `LogReturnInputSchema`), kind/category enums, domain types `Material`, `ProjectMaterial`, `MaterialMovement`.
- `lib/materials/repository.ts` — `createMaterial`, `updateMaterial`, `listCatalog`, `getMaterial`, `recordPurchase`, `logConsumption`, `logReturn`, `listProjectMaterials`, `listMovementsForMaterial`, `materialHasMovements`. `InsufficientStockError`, `UnitChangeAfterMovementsError`, `MaterialNotFoundError`.
- `app/(authed)/catalog/page.tsx` — admin-only catalog page (server component, `requireAdmin()` first line).
- `app/(authed)/catalog/catalog-table.tsx` — server component rendering the catalog list with edit triggers.
- `app/(authed)/catalog/new-material-dialog.tsx` — client component, admin form (name, unit, unitOther?, unitPrice, notes).
- `app/(authed)/catalog/edit-material-dialog.tsx` — client component, prefilled patch form with unit-change guard error handling.
- `app/(authed)/catalog/actions.ts` — `createMaterial` (both roles), `updateMaterial` (admin only).
- `app/(authed)/projects/[id]/materials/actions.ts` — `recordPurchase` (admin), `logConsumption` (both roles), `logReturn` (both roles). Also re-exports `createMaterial` from the catalog actions module for in-context use? No — the in-context dialog imports directly from `@/app/(authed)/catalog/actions`.
- `app/(authed)/projects/[id]/materials/materials-table.tsx` — server component, per-project stock table with role-gated columns and actions.
- `app/(authed)/projects/[id]/materials/add-material-dialog.tsx` — client component, in-context catalog-add dialog (FM-safe: no unitPrice field).
- `app/(authed)/projects/[id]/materials/record-purchase-dialog.tsx` — client component, admin-only.
- `app/(authed)/projects/[id]/materials/log-consumption-dialog.tsx` — client component, both roles.
- `app/(authed)/projects/[id]/materials/log-return-dialog.tsx` — client component, both roles.
- `app/(authed)/projects/[id]/materials/movements-sheet.tsx` — client component, Sheet primitive, role-gated columns.

**Modify:**
- `scripts/init-db.mjs` — append Phase 4 indexes (materials, projectMaterials, materialMovements).
- `app/(authed)/projects/[id]/project-tabs.tsx` — accept a new `materials?: ReactNode` prop alongside existing `inventory?`.
- `app/(authed)/projects/[id]/page.tsx` — fetch per-project materials in the existing `Promise.all`; pass `materials` slot into `<ProjectTabs>`.
- `app/(authed)/layout.tsx` (or wherever the authed shell's nav lives) — add an admin-only "Catalog" link.

**Add via `npx shadcn@latest add`:**
- `sheet`.

---

## Task 1 — Cut the feature branch

**Files:** none.

- [ ] **Step 1: Verify clean state on `master`**

```bash
git status
git log --oneline -3
```

Expected: working tree clean, `HEAD` at `dfe5848` (the Phase 4 design-doc commit). If not, stop and resolve before continuing — Phase 4 work must start from this commit.

- [ ] **Step 2: Cut the branch**

```bash
git checkout -b feat/phase-4-materials
```

Expected: `Switched to a new branch 'feat/phase-4-materials'`.

- [ ] **Step 3: No commit yet.**

The branch is in place; subsequent tasks will commit onto it. Do not push.

---

## Task 2 — Install shadcn sheet primitive

**Files:**
- Create: `components/ui/sheet.tsx`

- [ ] **Step 1: Check whether `sheet` already exists**

```bash
ls components/ui/sheet.tsx
```

If the file exists, skip to Step 3. Otherwise continue.

- [ ] **Step 2: Run shadcn add**

```bash
npx shadcn@latest add sheet
```

Expected: `components/ui/sheet.tsx` appears. If shadcn prompts about overwrites, choose "skip". `package.json` / `package-lock.json` may also be touched for `@radix-ui/react-dialog` if not already installed — that's fine.

- [ ] **Step 3: Verify the diff**

```bash
git status
```

Expected: at most `components/ui/sheet.tsx` is new, plus possibly `package.json` / `package-lock.json`.

- [ ] **Step 4: Commit**

```bash
git add components/ui/sheet.tsx package.json package-lock.json
git commit -m "chore: add shadcn sheet primitive"
```

If `package.json` / `package-lock.json` weren't touched, drop them from the `git add` line. If `sheet.tsx` already existed at Step 1, skip the commit entirely.

---

## Task 3 — Extend `db:init` script with Phase 4 indexes

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

console.log(
  "Indexes ensured: users.email (unique); " +
    "projects.createdAt, projects.name; " +
    "units.(projectId,type,status), units.(projectId,type,number) unique, units.(status,soldAt); " +
    "transactions.(projectId,occurredAt), transactions.(projectId,kind,voided), transactions.(unitId,voided); " +
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

Expected: one log line listing all indexes including the six new Phase 4 ones. Exit 0. Re-run once more to confirm idempotency — same output, no error.

- [ ] **Step 3: Commit**

```bash
git add scripts/init-db.mjs
git commit -m "chore(db): add materials indexes for Phase 4"
```

---

## Task 4 — Materials schemas and domain types

**Files:**
- Create: `lib/materials/schemas.ts`

- [ ] **Step 1: Write `lib/materials/schemas.ts`**

```ts
import { z } from "zod"
import type { ObjectId } from "mongodb"

// ---- Unit of measure -------------------------------------------------------

export const MaterialUnitSchema = z.enum([
  "bag",
  "kg",
  "ton",
  "m3",
  "m2",
  "m",
  "liter",
  "piece",
  "sheet",
  "box",
  "roll",
  "other",
])
export type MaterialUnit = z.infer<typeof MaterialUnitSchema>

// ---- Movement enums --------------------------------------------------------

export const MovementKindSchema = z.enum(["in", "out"])
export type MovementKind = z.infer<typeof MovementKindSchema>

// Full category enum declared upfront so Phase 6 (transfers) needs no migration.
// Phase 4 only writes "purchase", "return", "consumption".
export const MovementCategorySchema = z.enum([
  "purchase",
  "return",
  "consumption",
  "transfer_in",
  "transfer_out",
])
export type MovementCategory = z.infer<typeof MovementCategorySchema>

// ---- Catalog action inputs -------------------------------------------------

// Server enforces: FM submissions are stripped of unitPrice BEFORE this schema
// runs (the FM form does not include the field). Admin submissions may include
// it.
export const CreateMaterialInputSchema = z
  .object({
    name: z.string().trim().min(1, "Name required").max(200, "Too long"),
    unit: MaterialUnitSchema,
    unitOther: z
      .string()
      .trim()
      .max(50, "Too long")
      .optional(),
    unitPrice: z
      .coerce
      .number()
      .min(0, "Price cannot be negative")
      .max(10_000_000, "Too large")
      .optional()
      .nullable(),
    notes: z.string().max(2000).optional().default(""),
  })
  .refine((v) => v.unit !== "other" || (v.unitOther && v.unitOther.length > 0), {
    message: "Provide a custom unit label",
    path: ["unitOther"],
  })
export type CreateMaterialInput = z.infer<typeof CreateMaterialInputSchema>

export const UpdateMaterialInputSchema = z
  .object({
    materialId: z.string().min(1, "Missing material"),
    name: z.string().trim().min(1).max(200).optional(),
    unit: MaterialUnitSchema.optional(),
    unitOther: z.string().trim().max(50).optional(),
    unitPrice: z
      .coerce
      .number()
      .min(0)
      .max(10_000_000)
      .optional()
      .nullable(),
    notes: z.string().max(2000).optional(),
  })
  .refine(
    (v) =>
      v.unit === undefined ||
      v.unit !== "other" ||
      (v.unitOther && v.unitOther.length > 0),
    { message: "Provide a custom unit label", path: ["unitOther"] }
  )
export type UpdateMaterialInput = z.infer<typeof UpdateMaterialInputSchema>

// ---- Movement action inputs ------------------------------------------------

const positiveQty = z
  .coerce
  .number()
  .positive("Must be > 0")
  .max(1_000_000, "Too large")

export const RecordPurchaseInputSchema = z.object({
  projectId: z.string().min(1, "Missing project"),
  materialId: z.string().min(1, "Missing material"),
  qty: positiveQty,
  unitPriceAtMovement: z
    .coerce
    .number()
    .positive("Must be > 0")
    .max(10_000_000, "Too large"),
  occurredAt: z.coerce.date(),
  notes: z.string().max(2000).optional().default(""),
})
export type RecordPurchaseInput = z.infer<typeof RecordPurchaseInputSchema>

export const LogConsumptionInputSchema = z.object({
  projectId: z.string().min(1, "Missing project"),
  materialId: z.string().min(1, "Missing material"),
  qty: positiveQty,
  purpose: z
    .string()
    .trim()
    .min(1, "Purpose is required")
    .max(500, "Too long"),
  occurredAt: z.coerce.date(),
  notes: z.string().max(2000).optional().default(""),
})
export type LogConsumptionInput = z.infer<typeof LogConsumptionInputSchema>

export const LogReturnInputSchema = z.object({
  projectId: z.string().min(1, "Missing project"),
  materialId: z.string().min(1, "Missing material"),
  qty: positiveQty,
  purpose: z.string().trim().max(500).optional().default(""),
  occurredAt: z.coerce.date(),
  notes: z.string().max(2000).optional().default(""),
})
export type LogReturnInput = z.infer<typeof LogReturnInputSchema>

// ---- Domain types ----------------------------------------------------------

export type Material = {
  _id: ObjectId
  name: string
  unit: MaterialUnit
  unitOther?: string
  unitPrice: number | null
  notes?: string
  createdBy: ObjectId
  createdAt: Date
  updatedAt: Date
}

export type ProjectMaterial = {
  _id: ObjectId
  projectId: ObjectId
  materialId: ObjectId
  stockOnHand: number
  createdAt: Date
  updatedAt: Date
}

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
  occurredAt: Date
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
git add lib/materials/schemas.ts
git commit -m "feat(materials): add Zod schemas and domain types"
```

---

## Task 5 — Materials repository

**Files:**
- Create: `lib/materials/repository.ts`

- [ ] **Step 1: Write `lib/materials/repository.ts`**

```ts
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
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/materials/repository.ts
git commit -m "feat(materials): add repository with catalog and movement operations"
```

---

## Task 6 — Catalog server actions

**Files:**
- Create: `app/(authed)/catalog/actions.ts`

- [ ] **Step 1: Write the actions file**

```ts
"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin, requireAuth } from "@/lib/auth/session"
import type { ActionResult } from "@/lib/projects/schemas"
import {
  CreateMaterialInputSchema,
  UpdateMaterialInputSchema,
} from "@/lib/materials/schemas"
import {
  createMaterial as createMaterialRepo,
  updateMaterial as updateMaterialRepo,
  UnitChangeAfterMovementsError,
  MaterialNotFoundError,
} from "@/lib/materials/repository"

/**
 * Both roles. FMs cannot set unitPrice — stripped from raw input before
 * validation. Admin can set unitPrice freely.
 */
export async function createMaterial(
  raw: unknown
): Promise<ActionResult<{ materialId: string }>> {
  const user = await requireAuth()

  // FM-side strip: a malicious or buggy FM client cannot smuggle unitPrice in.
  let cleaned = raw
  if (user.role !== "admin" && raw && typeof raw === "object") {
    const { unitPrice: _drop, ...rest } = raw as Record<string, unknown>
    cleaned = rest
  }

  const parsed = CreateMaterialInputSchema.safeParse(cleaned)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      error: first?.message ?? "Invalid input",
      field: first?.path.join(".") || undefined,
    }
  }

  try {
    const { materialId } = await createMaterialRepo(parsed.data, user.id)
    // Catalog is global; both the catalog page and any project's Materials tab
    // could be showing a stale list.
    revalidatePath("/catalog")
    revalidatePath("/projects", "layout")
    return { ok: true, data: { materialId: materialId.toHexString() } }
  } catch (err) {
    console.error("createMaterial failed", err)
    return {
      ok: false,
      error: "Could not create material. Please try again.",
    }
  }
}

/**
 * Admin only. Unit-change guard surfaces as a typed error → user-friendly
 * message, not a generic failure.
 */
export async function updateMaterial(
  raw: unknown
): Promise<ActionResult<{ updated: boolean }>> {
  await requireAdmin()
  const parsed = UpdateMaterialInputSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      error: first?.message ?? "Invalid input",
      field: first?.path.join(".") || undefined,
    }
  }

  try {
    const { matchedCount } = await updateMaterialRepo(parsed.data)
    if (matchedCount === 0) {
      return { ok: false, error: "Material not found." }
    }
    revalidatePath("/catalog")
    revalidatePath("/projects", "layout")
    return { ok: true, data: { updated: true } }
  } catch (err) {
    if (err instanceof UnitChangeAfterMovementsError) {
      return { ok: false, error: err.message, field: "unit" }
    }
    if (err instanceof MaterialNotFoundError) {
      return { ok: false, error: err.message }
    }
    console.error("updateMaterial failed", err)
    return {
      ok: false,
      error: "Could not update material. Please try again.",
    }
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
git add "app/(authed)/catalog/actions.ts"
git commit -m "feat(catalog): add createMaterial/updateMaterial server actions"
```

---

## Task 7 — Project-materials server actions

**Files:**
- Create: `app/(authed)/projects/[id]/materials/actions.ts`

- [ ] **Step 1: Write the actions file**

```ts
"use server"

import { ObjectId } from "mongodb"
import { revalidatePath } from "next/cache"
import { requireAdmin, requireAuth } from "@/lib/auth/session"
import type { ActionResult } from "@/lib/projects/schemas"
import {
  LogConsumptionInputSchema,
  LogReturnInputSchema,
  RecordPurchaseInputSchema,
} from "@/lib/materials/schemas"
import {
  getMaterial,
  logConsumption as logConsumptionRepo,
  logReturn as logReturnRepo,
  recordPurchase as recordPurchaseRepo,
  InsufficientStockError,
} from "@/lib/materials/repository"

export async function recordPurchase(
  raw: unknown
): Promise<ActionResult<{ transactionId: string; movementId: string }>> {
  const user = await requireAdmin()
  const parsed = RecordPurchaseInputSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      error: first?.message ?? "Invalid input",
      field: first?.path.join(".") || undefined,
    }
  }

  const { projectId, materialId, qty, unitPriceAtMovement, occurredAt, notes } =
    parsed.data
  if (!ObjectId.isValid(projectId) || !ObjectId.isValid(materialId)) {
    return { ok: false, error: "Invalid project or material id." }
  }

  // Need the material's display name for the auto-generated transaction
  // description. A separate read is acceptable — it runs before the
  // withTransaction, so any cache miss here is harmless.
  const material = await getMaterial(materialId)
  if (!material) {
    return { ok: false, error: "Material not found." }
  }

  try {
    const { transactionId, movementId } = await recordPurchaseRepo(
      {
        projectId: new ObjectId(projectId),
        materialId: new ObjectId(materialId),
        qty,
        unitPriceAtMovement,
        occurredAt,
        notes,
        materialName: material.name,
      },
      user.id
    )
    revalidatePath(`/projects/${projectId}`)
    return {
      ok: true,
      data: {
        transactionId: transactionId.toHexString(),
        movementId: movementId.toHexString(),
      },
    }
  } catch (err) {
    console.error("recordPurchase failed", err)
    return {
      ok: false,
      error: "Could not record purchase. Please try again.",
    }
  }
}

export async function logConsumption(
  raw: unknown
): Promise<ActionResult<{ movementId: string; remainingStock: number }>> {
  const user = await requireAuth()
  const parsed = LogConsumptionInputSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      error: first?.message ?? "Invalid input",
      field: first?.path.join(".") || undefined,
    }
  }

  const { projectId, materialId, qty, purpose, occurredAt, notes } = parsed.data
  if (!ObjectId.isValid(projectId) || !ObjectId.isValid(materialId)) {
    return { ok: false, error: "Invalid project or material id." }
  }

  try {
    const { movementId, remainingStock } = await logConsumptionRepo(
      {
        projectId: new ObjectId(projectId),
        materialId: new ObjectId(materialId),
        qty,
        purpose,
        occurredAt,
        notes,
      },
      user.id
    )
    revalidatePath(`/projects/${projectId}`)
    return {
      ok: true,
      data: { movementId: movementId.toHexString(), remainingStock },
    }
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      return {
        ok: false,
        error: `Only ${err.available} available — refresh and try again.`,
        field: "qty",
      }
    }
    console.error("logConsumption failed", err)
    return {
      ok: false,
      error: "Could not log consumption. Please try again.",
    }
  }
}

export async function logReturn(
  raw: unknown
): Promise<ActionResult<{ movementId: string }>> {
  const user = await requireAuth()
  const parsed = LogReturnInputSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      error: first?.message ?? "Invalid input",
      field: first?.path.join(".") || undefined,
    }
  }

  const { projectId, materialId, qty, purpose, occurredAt, notes } = parsed.data
  if (!ObjectId.isValid(projectId) || !ObjectId.isValid(materialId)) {
    return { ok: false, error: "Invalid project or material id." }
  }

  try {
    const { movementId } = await logReturnRepo(
      {
        projectId: new ObjectId(projectId),
        materialId: new ObjectId(materialId),
        qty,
        purpose,
        occurredAt,
        notes,
      },
      user.id
    )
    revalidatePath(`/projects/${projectId}`)
    return { ok: true, data: { movementId: movementId.toHexString() } }
  } catch (err) {
    console.error("logReturn failed", err)
    return {
      ok: false,
      error: "Could not log return. Please try again.",
    }
  }
}
```

Notes for the executor:
- `requireAdmin()` is the first executable line of `recordPurchase`. `requireAuth()` is the first line of `logConsumption` and `logReturn` — both roles can hit those, but unauthenticated requests still redirect.
- `recordPurchase` does a small pre-read for the material name. This runs outside the Mongo transaction; concurrent renames are not a concern (description is denormalized at write time anyway).
- `InsufficientStockError.available` lets the client show the exact current stock without a second round-trip.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/materials/actions.ts"
git commit -m "feat(materials): add recordPurchase/logConsumption/logReturn actions"
```

---

## Task 8 — `/catalog` new-material dialog (admin)

**Files:**
- Create: `app/(authed)/catalog/new-material-dialog.tsx`

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { MaterialUnit } from "@/lib/materials/schemas"
import { createMaterial } from "./actions"

const UNIT_OPTIONS: { value: MaterialUnit; label: string }[] = [
  { value: "bag", label: "bag" },
  { value: "kg", label: "kg" },
  { value: "ton", label: "ton" },
  { value: "m3", label: "m³" },
  { value: "m2", label: "m²" },
  { value: "m", label: "m" },
  { value: "liter", label: "liter" },
  { value: "piece", label: "piece" },
  { value: "sheet", label: "sheet" },
  { value: "box", label: "box" },
  { value: "roll", label: "roll" },
  { value: "other", label: "Other (custom)" },
]

type FormState = {
  name: string
  unit: MaterialUnit
  unitOther: string
  unitPrice: string
  notes: string
}

export function NewMaterialButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>New material</Button>
      <NewMaterialDialog
        key={open ? "open" : "closed"}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}

function NewMaterialDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)

  const [form, setForm] = useState<FormState>({
    name: "",
    unit: "bag",
    unitOther: "",
    unitPrice: "",
    notes: "",
  })

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit() {
    setErrorMsg(null)
    setErrorField(null)
    startTransition(async () => {
      const result = await createMaterial({
        name: form.name,
        unit: form.unit,
        unitOther: form.unit === "other" ? form.unitOther : undefined,
        unitPrice: form.unitPrice === "" ? null : Number(form.unitPrice),
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
          <DialogTitle>New material</DialogTitle>
          <DialogDescription>
            Add an entry to the global catalog. Visible to every project.
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
            label="Name"
            htmlFor="name"
            error={errorField === "name" ? errorMsg : null}
          >
            <Input
              id="name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              disabled={isPending}
              autoFocus
            />
          </Field>
          <Field
            label="Unit"
            htmlFor="unit"
            error={errorField === "unit" ? errorMsg : null}
          >
            <Select
              value={form.unit}
              onValueChange={(v) => set("unit", v as MaterialUnit)}
              disabled={isPending}
            >
              <SelectTrigger id="unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {form.unit === "other" ? (
            <Field
              label="Custom unit label"
              htmlFor="unitOther"
              error={errorField === "unitOther" ? errorMsg : null}
            >
              <Input
                id="unitOther"
                value={form.unitOther}
                onChange={(e) => set("unitOther", e.target.value)}
                disabled={isPending}
                placeholder="e.g. drum, crate, panel"
              />
            </Field>
          ) : null}
          <Field
            label="Unit price (₹)"
            htmlFor="unitPrice"
            error={errorField === "unitPrice" ? errorMsg : null}
          >
            <Input
              id="unitPrice"
              type="number"
              min={0}
              step="0.01"
              value={form.unitPrice}
              onChange={(e) => set("unitPrice", e.target.value)}
              disabled={isPending}
              placeholder="Optional"
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
              {isPending ? "Creating…" : "Create"}
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

- [ ] **Step 2: Skip typecheck**

`./actions` exists from Task 6. Component is rendered from `catalog-table.tsx` (Task 10) which doesn't exist yet — typecheck will not be clean until Task 10. Move on.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/catalog/new-material-dialog.tsx"
git commit -m "feat(catalog): add new-material dialog with unit + price fields"
```

---

## Task 9 — `/catalog` edit-material dialog (admin)

**Files:**
- Create: `app/(authed)/catalog/edit-material-dialog.tsx`

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { Material, MaterialUnit } from "@/lib/materials/schemas"
import { updateMaterial } from "./actions"

const UNIT_OPTIONS: { value: MaterialUnit; label: string }[] = [
  { value: "bag", label: "bag" },
  { value: "kg", label: "kg" },
  { value: "ton", label: "ton" },
  { value: "m3", label: "m³" },
  { value: "m2", label: "m²" },
  { value: "m", label: "m" },
  { value: "liter", label: "liter" },
  { value: "piece", label: "piece" },
  { value: "sheet", label: "sheet" },
  { value: "box", label: "box" },
  { value: "roll", label: "roll" },
  { value: "other", label: "Other (custom)" },
]

type FormState = {
  name: string
  unit: MaterialUnit
  unitOther: string
  unitPrice: string
  notes: string
}

export function EditMaterialButton({ material }: { material: Material }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <EditMaterialDialog
        key={open ? `open-${String(material._id)}` : "closed"}
        open={open}
        onOpenChange={setOpen}
        material={material}
      />
    </>
  )
}

function EditMaterialDialog({
  open,
  onOpenChange,
  material,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  material: Material
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)

  const [form, setForm] = useState<FormState>({
    name: material.name,
    unit: material.unit,
    unitOther: material.unitOther ?? "",
    unitPrice: material.unitPrice == null ? "" : String(material.unitPrice),
    notes: material.notes ?? "",
  })

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit() {
    setErrorMsg(null)
    setErrorField(null)
    startTransition(async () => {
      const result = await updateMaterial({
        materialId: String(material._id),
        name: form.name,
        unit: form.unit,
        unitOther: form.unit === "other" ? form.unitOther : "",
        unitPrice: form.unitPrice === "" ? null : Number(form.unitPrice),
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
          <DialogTitle>Edit {material.name}</DialogTitle>
          <DialogDescription>
            Unit cannot be changed after movements exist for this material.
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
            label="Name"
            htmlFor="name"
            error={errorField === "name" ? errorMsg : null}
          >
            <Input
              id="name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              disabled={isPending}
              autoFocus
            />
          </Field>
          <Field
            label="Unit"
            htmlFor="unit"
            error={errorField === "unit" ? errorMsg : null}
          >
            <Select
              value={form.unit}
              onValueChange={(v) => set("unit", v as MaterialUnit)}
              disabled={isPending}
            >
              <SelectTrigger id="unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {form.unit === "other" ? (
            <Field
              label="Custom unit label"
              htmlFor="unitOther"
              error={errorField === "unitOther" ? errorMsg : null}
            >
              <Input
                id="unitOther"
                value={form.unitOther}
                onChange={(e) => set("unitOther", e.target.value)}
                disabled={isPending}
              />
            </Field>
          ) : null}
          <Field
            label="Unit price (₹)"
            htmlFor="unitPrice"
            error={errorField === "unitPrice" ? errorMsg : null}
          >
            <Input
              id="unitPrice"
              type="number"
              min={0}
              step="0.01"
              value={form.unitPrice}
              onChange={(e) => set("unitPrice", e.target.value)}
              disabled={isPending}
              placeholder="Optional"
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
              {isPending ? "Saving…" : "Save"}
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

- [ ] **Step 2: Skip typecheck**

Rendered from `catalog-table.tsx` (Task 10). Move on.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/catalog/edit-material-dialog.tsx"
git commit -m "feat(catalog): add edit-material dialog with unit-change guard"
```

---

## Task 10 — `/catalog` page + table

**Files:**
- Create: `app/(authed)/catalog/page.tsx`
- Create: `app/(authed)/catalog/catalog-table.tsx`

- [ ] **Step 1: Write the page**

```tsx
// app/(authed)/catalog/page.tsx
import { requireAdmin } from "@/lib/auth/session"
import { listCatalog } from "@/lib/materials/repository"
import { CatalogTable } from "./catalog-table"
import { NewMaterialButton } from "./new-material-dialog"

export default async function CatalogPage() {
  await requireAdmin()
  const materials = await listCatalog()

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Materials catalog
          </h1>
          <p className="text-sm text-muted-foreground">
            Global. Used by every project's Materials tab.
          </p>
        </div>
        <NewMaterialButton />
      </header>
      <CatalogTable materials={materials} />
    </div>
  )
}
```

- [ ] **Step 2: Write the catalog table**

```tsx
// app/(authed)/catalog/catalog-table.tsx
import { Card } from "@/components/ui/card"
import type { Material } from "@/lib/materials/schemas"
import { EditMaterialButton } from "./edit-material-dialog"

const INR = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0 })

function formatUnit(m: Material): string {
  if (m.unit === "other") return m.unitOther || "—"
  if (m.unit === "m2") return "m²"
  if (m.unit === "m3") return "m³"
  return m.unit
}

function formatPrice(m: Material): string {
  if (m.unitPrice == null) return "—"
  return `₹${INR.format(m.unitPrice)}`
}

export function CatalogTable({ materials }: { materials: Material[] }) {
  if (materials.length === 0) {
    return (
      <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
        No materials yet. Add the first one to get started.
      </Card>
    )
  }
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Unit</th>
            <th className="px-4 py-3">Unit price</th>
            <th className="px-4 py-3">Notes</th>
            <th className="px-4 py-3">Updated</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {materials.map((m) => (
            <tr key={String(m._id)} className="border-b border-border last:border-0">
              <td className="px-4 py-3">{m.name}</td>
              <td className="px-4 py-3 font-mono">{formatUnit(m)}</td>
              <td className="px-4 py-3 font-mono">{formatPrice(m)}</td>
              <td className="px-4 py-3 max-w-xs truncate text-muted-foreground">
                {m.notes ?? ""}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {m.updatedAt.toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-right">
                <EditMaterialButton material={m} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors. Tasks 8 and 9 compile now that Task 10 references them.

- [ ] **Step 4: Commit**

```bash
git add "app/(authed)/catalog/page.tsx" "app/(authed)/catalog/catalog-table.tsx"
git commit -m "feat(catalog): add admin catalog page and table"
```

---

## Task 11 — In-context add-material dialog (FM-safe)

**Files:**
- Create: `app/(authed)/projects/[id]/materials/add-material-dialog.tsx`

This is a separate component from the `/catalog` admin dialog because the FM form does not include a unit-price field. Both call the same `createMaterial` action — the action layer enforces role-stripping defensively.

- [ ] **Step 1: Write the FM-friendly dialog**

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { MaterialUnit } from "@/lib/materials/schemas"
import { createMaterial } from "@/app/(authed)/catalog/actions"

const UNIT_OPTIONS: { value: MaterialUnit; label: string }[] = [
  { value: "bag", label: "bag" },
  { value: "kg", label: "kg" },
  { value: "ton", label: "ton" },
  { value: "m3", label: "m³" },
  { value: "m2", label: "m²" },
  { value: "m", label: "m" },
  { value: "liter", label: "liter" },
  { value: "piece", label: "piece" },
  { value: "sheet", label: "sheet" },
  { value: "box", label: "box" },
  { value: "roll", label: "roll" },
  { value: "other", label: "Other (custom)" },
]

type FormState = {
  name: string
  unit: MaterialUnit
  unitOther: string
  notes: string
}

export function AddMaterialButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Add material
      </Button>
      <AddMaterialDialog
        key={open ? "open" : "closed"}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}

function AddMaterialDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)

  const [form, setForm] = useState<FormState>({
    name: "",
    unit: "bag",
    unitOther: "",
    notes: "",
  })

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit() {
    setErrorMsg(null)
    setErrorField(null)
    startTransition(async () => {
      // FM-safe: no unitPrice field sent. Action layer strips defensively if
      // an FM submission somehow includes it.
      const result = await createMaterial({
        name: form.name,
        unit: form.unit,
        unitOther: form.unit === "other" ? form.unitOther : undefined,
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
          <DialogTitle>Add material</DialogTitle>
          <DialogDescription>
            Add a new material to the global catalog. An admin can set its
            unit price later.
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
            label="Name"
            htmlFor="name"
            error={errorField === "name" ? errorMsg : null}
          >
            <Input
              id="name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              disabled={isPending}
              autoFocus
            />
          </Field>
          <Field
            label="Unit"
            htmlFor="unit"
            error={errorField === "unit" ? errorMsg : null}
          >
            <Select
              value={form.unit}
              onValueChange={(v) => set("unit", v as MaterialUnit)}
              disabled={isPending}
            >
              <SelectTrigger id="unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {form.unit === "other" ? (
            <Field
              label="Custom unit label"
              htmlFor="unitOther"
              error={errorField === "unitOther" ? errorMsg : null}
            >
              <Input
                id="unitOther"
                value={form.unitOther}
                onChange={(e) => set("unitOther", e.target.value)}
                disabled={isPending}
              />
            </Field>
          ) : null}
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
              {isPending ? "Adding…" : "Add"}
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

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/materials/add-material-dialog.tsx"
git commit -m "feat(materials): add in-context add-material dialog (FM-safe)"
```

---

## Task 12 — Record-purchase dialog (admin)

**Files:**
- Create: `app/(authed)/projects/[id]/materials/record-purchase-dialog.tsx`

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
import { recordPurchase } from "./actions"

type FormState = {
  qty: string
  unitPriceAtMovement: string
  occurredAt: string
  notes: string
}

function isoDateToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export function RecordPurchaseButton({
  projectId,
  materialId,
  materialName,
  unitLabel,
  defaultUnitPrice,
}: {
  projectId: string
  materialId: string
  materialName: string
  unitLabel: string
  defaultUnitPrice: number | null
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Record purchase
      </Button>
      <RecordPurchaseDialog
        key={open ? `open-${materialId}` : "closed"}
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        materialId={materialId}
        materialName={materialName}
        unitLabel={unitLabel}
        defaultUnitPrice={defaultUnitPrice}
      />
    </>
  )
}

function RecordPurchaseDialog({
  open,
  onOpenChange,
  projectId,
  materialId,
  materialName,
  unitLabel,
  defaultUnitPrice,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  projectId: string
  materialId: string
  materialName: string
  unitLabel: string
  defaultUnitPrice: number | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)

  const [form, setForm] = useState<FormState>({
    qty: "",
    unitPriceAtMovement:
      defaultUnitPrice != null ? String(defaultUnitPrice) : "",
    occurredAt: isoDateToday(),
    notes: "",
  })

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const qtyNum = Number(form.qty) || 0
  const priceNum = Number(form.unitPriceAtMovement) || 0
  const computedAmount = Math.round(qtyNum * priceNum)

  function handleSubmit() {
    setErrorMsg(null)
    setErrorField(null)
    startTransition(async () => {
      const result = await recordPurchase({
        projectId,
        materialId,
        qty: form.qty,
        unitPriceAtMovement: form.unitPriceAtMovement,
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
          <DialogTitle>Record purchase — {materialName}</DialogTitle>
          <DialogDescription>
            Writes an expense to the ledger and adds stock to this project.
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
            label={`Quantity (${unitLabel})`}
            htmlFor="qty"
            error={errorField === "qty" ? errorMsg : null}
          >
            <Input
              id="qty"
              type="number"
              min={0}
              step="any"
              value={form.qty}
              onChange={(e) => set("qty", e.target.value)}
              disabled={isPending}
              autoFocus
            />
          </Field>
          <Field
            label="Unit price (₹)"
            htmlFor="unitPriceAtMovement"
            error={errorField === "unitPriceAtMovement" ? errorMsg : null}
          >
            <Input
              id="unitPriceAtMovement"
              type="number"
              min={0}
              step="0.01"
              value={form.unitPriceAtMovement}
              onChange={(e) => set("unitPriceAtMovement", e.target.value)}
              disabled={isPending}
            />
          </Field>
          <p className="text-sm text-muted-foreground">
            Amount: <span className="font-mono">₹{computedAmount.toLocaleString("en-IN")}</span>
          </p>
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
              placeholder="Optional — supplier, invoice ref, etc."
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
              {isPending ? "Recording…" : "Record purchase"}
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

- [ ] **Step 2: Skip typecheck**

Rendered from `materials-table.tsx` (Task 16). Move on.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/materials/record-purchase-dialog.tsx"
git commit -m "feat(materials): add record-purchase dialog with live amount preview"
```

---

## Task 13 — Log-consumption dialog (both roles)

**Files:**
- Create: `app/(authed)/projects/[id]/materials/log-consumption-dialog.tsx`

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
import { logConsumption } from "./actions"

type FormState = {
  qty: string
  purpose: string
  occurredAt: string
  notes: string
}

function isoDateToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export function LogConsumptionButton({
  projectId,
  materialId,
  materialName,
  unitLabel,
  stockOnHand,
}: {
  projectId: string
  materialId: string
  materialName: string
  unitLabel: string
  stockOnHand: number
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Log use
      </Button>
      <LogConsumptionDialog
        key={open ? `open-${materialId}` : "closed"}
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        materialId={materialId}
        materialName={materialName}
        unitLabel={unitLabel}
        stockOnHand={stockOnHand}
      />
    </>
  )
}

function LogConsumptionDialog({
  open,
  onOpenChange,
  projectId,
  materialId,
  materialName,
  unitLabel,
  stockOnHand,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  projectId: string
  materialId: string
  materialName: string
  unitLabel: string
  stockOnHand: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)

  const [form, setForm] = useState<FormState>({
    qty: "",
    purpose: "",
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
      const result = await logConsumption({
        projectId,
        materialId,
        qty: form.qty,
        purpose: form.purpose,
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
          <DialogTitle>Log use — {materialName}</DialogTitle>
          <DialogDescription>
            Stock on hand: <span className="font-mono">{stockOnHand} {unitLabel}</span>
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
            label={`Quantity used (${unitLabel})`}
            htmlFor="qty"
            error={errorField === "qty" ? errorMsg : null}
          >
            <Input
              id="qty"
              type="number"
              min={0}
              step="any"
              value={form.qty}
              onChange={(e) => set("qty", e.target.value)}
              disabled={isPending}
              autoFocus
            />
          </Field>
          <Field
            label="Purpose"
            htmlFor="purpose"
            error={errorField === "purpose" ? errorMsg : null}
          >
            <Input
              id="purpose"
              value={form.purpose}
              onChange={(e) => set("purpose", e.target.value)}
              disabled={isPending}
              placeholder="e.g. Tower A foundation pour"
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
              {isPending ? "Logging…" : "Log use"}
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

- [ ] **Step 2: Skip typecheck**

Rendered from `materials-table.tsx` (Task 16). Move on.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/materials/log-consumption-dialog.tsx"
git commit -m "feat(materials): add log-consumption dialog with stock display"
```

---

## Task 14 — Log-return dialog (both roles)

**Files:**
- Create: `app/(authed)/projects/[id]/materials/log-return-dialog.tsx`

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
import { logReturn } from "./actions"

type FormState = {
  qty: string
  purpose: string
  occurredAt: string
  notes: string
}

function isoDateToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export function LogReturnButton({
  projectId,
  materialId,
  materialName,
  unitLabel,
}: {
  projectId: string
  materialId: string
  materialName: string
  unitLabel: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Log return
      </Button>
      <LogReturnDialog
        key={open ? `open-${materialId}` : "closed"}
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        materialId={materialId}
        materialName={materialName}
        unitLabel={unitLabel}
      />
    </>
  )
}

function LogReturnDialog({
  open,
  onOpenChange,
  projectId,
  materialId,
  materialName,
  unitLabel,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  projectId: string
  materialId: string
  materialName: string
  unitLabel: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)

  const [form, setForm] = useState<FormState>({
    qty: "",
    purpose: "",
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
      const result = await logReturn({
        projectId,
        materialId,
        qty: form.qty,
        purpose: form.purpose,
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
          <DialogTitle>Log return — {materialName}</DialogTitle>
          <DialogDescription>
            Restores stock. No ledger entry — returns are not cash events.
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
            label={`Quantity returned (${unitLabel})`}
            htmlFor="qty"
            error={errorField === "qty" ? errorMsg : null}
          >
            <Input
              id="qty"
              type="number"
              min={0}
              step="any"
              value={form.qty}
              onChange={(e) => set("qty", e.target.value)}
              disabled={isPending}
              autoFocus
            />
          </Field>
          <Field
            label="Reason (optional)"
            htmlFor="purpose"
            error={errorField === "purpose" ? errorMsg : null}
          >
            <Input
              id="purpose"
              value={form.purpose}
              onChange={(e) => set("purpose", e.target.value)}
              disabled={isPending}
              placeholder="e.g. Excess from Tower A pour"
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
              {isPending ? "Logging…" : "Log return"}
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

- [ ] **Step 2: Skip typecheck**

Rendered from `materials-table.tsx` (Task 16). Move on.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/materials/log-return-dialog.tsx"
git commit -m "feat(materials): add log-return dialog"
```

---

## Task 15 — Movements drilldown sheet

**Files:**
- Create: `app/(authed)/projects/[id]/materials/movements-sheet.tsx`

- [ ] **Step 1: Write the sheet component**

```tsx
"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { MaterialMovement } from "@/lib/materials/schemas"
import type { Role } from "@/types"

const INR = new Intl.NumberFormat("en-IN")

type MovementRow = {
  _id: string
  kind: "in" | "out"
  category: MaterialMovement["category"]
  qty: number
  amount?: number
  purpose?: string
  notes?: string
  occurredAt: string
  voided?: boolean
}

function categoryLabel(c: MovementRow["category"]): string {
  switch (c) {
    case "purchase": return "Purchase"
    case "return": return "Return"
    case "consumption": return "Consumption"
    case "transfer_in": return "Transfer in"
    case "transfer_out": return "Transfer out"
  }
}

export function MovementsSheetButton({
  projectId,
  materialId,
  materialName,
  unitLabel,
  role,
}: {
  projectId: string
  materialId: string
  materialName: string
  unitLabel: string
  role: Role
}) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<MovementRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    fetch(
      `/api/movements?projectId=${projectId}&materialId=${materialId}`,
      { cache: "no-store" }
    )
      .then((r) => r.json())
      .then((data: { rows: MovementRow[] }) => {
        if (!cancelled) setRows(data.rows)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, projectId, materialId])

  const showAmount = role === "admin"

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
      >
        History
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{materialName} — movement history</SheetTitle>
            <SheetDescription>
              Newest first. Quantities in {unitLabel}.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !rows || rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No movements yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2">Date</th>
                    <th className="py-2">Type</th>
                    <th className="py-2 text-right">Qty</th>
                    {showAmount ? <th className="py-2 text-right">Amount</th> : null}
                    <th className="py-2">Purpose / notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r._id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="py-2 font-mono">
                        {new Date(r.occurredAt).toLocaleDateString()}
                      </td>
                      <td className="py-2">
                        <Badge variant={r.kind === "in" ? "default" : "secondary"}>
                          {categoryLabel(r.category)}
                        </Badge>
                      </td>
                      <td className="py-2 text-right font-mono">
                        {r.kind === "in" ? "+" : "−"}
                        {r.qty}
                      </td>
                      {showAmount ? (
                        <td className="py-2 text-right font-mono">
                          {r.amount != null ? `₹${INR.format(r.amount)}` : ""}
                        </td>
                      ) : null}
                      <td className="py-2 text-muted-foreground">
                        {[r.purpose, r.notes].filter(Boolean).join(" — ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
```

- [ ] **Step 2: Add the supporting API route**

The sheet reads movements lazily on open. A small JSON route handles it. Create `app/api/movements/route.ts`:

```ts
import { ObjectId } from "mongodb"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth/session"
import { listMovementsForMaterial } from "@/lib/materials/repository"

export async function GET(req: Request) {
  const user = await requireAuth()
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get("projectId") ?? ""
  const materialId = searchParams.get("materialId") ?? ""
  if (!ObjectId.isValid(projectId) || !ObjectId.isValid(materialId)) {
    return NextResponse.json({ rows: [] }, { status: 400 })
  }
  const movements = await listMovementsForMaterial(
    new ObjectId(projectId),
    new ObjectId(materialId)
  )
  // Server-side strip for floor managers — never serialize unitPriceAtMovement
  // or amount in the FM-visible payload.
  const stripMoney = user.role !== "admin"
  const rows = movements.map((m) => ({
    _id: String(m._id),
    kind: m.kind,
    category: m.category,
    qty: m.qty,
    amount: stripMoney ? undefined : m.amount,
    purpose: m.purpose,
    notes: m.notes,
    occurredAt: m.occurredAt.toISOString(),
    voided: m.voided === true ? true : undefined,
  }))
  return NextResponse.json({ rows })
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(authed)/projects/[id]/materials/movements-sheet.tsx" app/api/movements/route.ts
git commit -m "feat(materials): add movements drilldown sheet and JSON route"
```

---

## Task 16 — Per-project materials table (server)

**Files:**
- Create: `app/(authed)/projects/[id]/materials/materials-table.tsx`

- [ ] **Step 1: Write the server component**

```tsx
import { Card } from "@/components/ui/card"
import { listProjectMaterials, type ProjectMaterialListing } from "@/lib/materials/repository"
import { ObjectId } from "mongodb"
import type { Material } from "@/lib/materials/schemas"
import type { Role } from "@/types"
import { AddMaterialButton } from "./add-material-dialog"
import { LogConsumptionButton } from "./log-consumption-dialog"
import { LogReturnButton } from "./log-return-dialog"
import { MovementsSheetButton } from "./movements-sheet"
import { RecordPurchaseButton } from "./record-purchase-dialog"

const INR = new Intl.NumberFormat("en-IN")

function formatUnit(m: Material): string {
  if (m.unit === "other") return m.unitOther || "—"
  if (m.unit === "m2") return "m²"
  if (m.unit === "m3") return "m³"
  return m.unit
}

export async function MaterialsTable({
  projectId,
  role,
}: {
  projectId: string
  role: Role
}) {
  const rows = await listProjectMaterials(new ObjectId(projectId))
  const showSpent = role === "admin"
  const isAdmin = role === "admin"

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <AddMaterialButton />
      </div>
      {rows.length === 0 ? (
        <Card className="grid place-items-center gap-2 p-12 text-sm text-muted-foreground">
          <p>No materials tracked for this project yet.</p>
          <p>Use "Add material" to register one, then "Record purchase".</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3 text-right">Stock on hand</th>
                {showSpent ? <th className="px-4 py-3 text-right">Total spent</th> : null}
                <th className="px-4 py-3">Last movement</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <MaterialRow
                  key={String(r.material._id)}
                  row={r}
                  projectId={projectId}
                  isAdmin={isAdmin}
                  showSpent={showSpent}
                  role={role}
                />
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

function MaterialRow({
  row,
  projectId,
  isAdmin,
  showSpent,
  role,
}: {
  row: ProjectMaterialListing
  projectId: string
  isAdmin: boolean
  showSpent: boolean
  role: Role
}) {
  const { material, projectMaterial, totalSpent, lastMovementAt } = row
  const stock = projectMaterial?.stockOnHand ?? 0
  const unitLabel = formatUnit(material)
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3">{material.name}</td>
      <td className="px-4 py-3 font-mono">{unitLabel}</td>
      <td className="px-4 py-3 text-right font-mono">{stock}</td>
      {showSpent ? (
        <td className="px-4 py-3 text-right font-mono">
          ₹{INR.format(totalSpent)}
        </td>
      ) : null}
      <td className="px-4 py-3 text-muted-foreground">
        {lastMovementAt ? lastMovementAt.toLocaleDateString() : "—"}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap justify-end gap-2">
          {isAdmin ? (
            <RecordPurchaseButton
              projectId={projectId}
              materialId={String(material._id)}
              materialName={material.name}
              unitLabel={unitLabel}
              defaultUnitPrice={material.unitPrice}
            />
          ) : null}
          <LogConsumptionButton
            projectId={projectId}
            materialId={String(material._id)}
            materialName={material.name}
            unitLabel={unitLabel}
            stockOnHand={stock}
          />
          <LogReturnButton
            projectId={projectId}
            materialId={String(material._id)}
            materialName={material.name}
            unitLabel={unitLabel}
          />
          <MovementsSheetButton
            projectId={projectId}
            materialId={String(material._id)}
            materialName={material.name}
            unitLabel={unitLabel}
            role={role}
          />
        </div>
      </td>
    </tr>
  )
}
```

Notes for the executor:
- The table shows rows from `projectMaterials` only — materials that have had at least one movement. The "Add material" button registers a global catalog entry but does NOT create a `projectMaterials` row; the row is created lazily on first purchase or return. This means a freshly-added material won't appear in the table until first use — that's intentional. The empty state's hint covers this.
- `showSpent` and `isAdmin` are the same boolean today. Kept separate to make Phase 5+ refinements (e.g. partial views) easier.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors. All client dialogs from Tasks 11-15 now compile.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/materials/materials-table.tsx"
git commit -m "feat(materials): add per-project stock table with role-gated columns"
```

---

## Task 17 — Wire-up: ProjectTabs prop, page.tsx fetch, admin nav link

**Files:**
- Modify: `app/(authed)/projects/[id]/project-tabs.tsx`
- Modify: `app/(authed)/projects/[id]/page.tsx`
- Modify: `app/(authed)/layout.tsx` (or the file housing the authed nav)

- [ ] **Step 1: Update `project-tabs.tsx` to accept a `materials` prop**

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
  materials,
}: {
  role: Role
  inventory?: ReactNode
  materials?: ReactNode
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

- [ ] **Step 2: Update `page.tsx` to render `<MaterialsTable />` into the new slot**

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
import { MaterialsTable } from "./materials/materials-table"

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
        materials={
          <MaterialsTable projectId={id} role={user.role} />
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

- [ ] **Step 3: Add an admin-only Catalog link to the authed layout**

The authed layout is at `app/(authed)/layout.tsx`. It's a server component that already calls `requireAuth()` and has the role available. The header renders a brand link → Separator → role Badge → UserMenu.

Add a Catalog link **between the brand link and the Separator**, gated on `user.role === "admin"`. Replace the header's left-side `<div className="flex items-center gap-4">` block with:

```tsx
<div className="flex items-center gap-4">
  <Link href="/" className="flex items-center gap-2 font-mono text-sm font-semibold">
    <span className="grid size-7 place-items-center rounded-md border border-border bg-card text-xs">
      W
    </span>
    Wangre
  </Link>
  {user.role === "admin" ? (
    <Link
      href="/catalog"
      className="text-sm text-muted-foreground hover:text-foreground"
    >
      Catalog
    </Link>
  ) : null}
  <Separator orientation="vertical" className="h-5" />
  <Badge variant={roleVariant}>{roleLabel}</Badge>
</div>
```

No new imports needed — `Link`, `user`, and `Separator` are already in scope.

- [ ] **Step 4: Typecheck + lint**

```bash
npm run typecheck
npm run lint
```

Both exit 0.

- [ ] **Step 5: Commit**

```bash
git add "app/(authed)/projects/[id]/project-tabs.tsx" "app/(authed)/projects/[id]/page.tsx" "app/(authed)/layout.tsx"
git commit -m "feat(materials): wire materials tab into project page and add catalog nav"
```

---

## Task 18 — End-to-end verification

No code in this task. Run through the spec's verification list. Use the **superpowers:verification-before-completion** skill before reporting Phase 4 done.

**Before starting:** confirm a clean tree with `git status` and that you're on `feat/phase-4-materials`.

You will need at least one existing project from Phase 2 with apartments. If you don't have one, create one via the Phase 2 UI first.

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

Both runs print the same line listing every index, including the six new Phase 4 ones (`materials.name` case-insensitive, `projectMaterials.(projectId,materialId)` unique, `projectMaterials.(projectId)`, `materialMovements.(projectId,materialId,occurredAt)`, `materialMovements.(projectId,kind,voided)`, `materialMovements.(transactionId)` sparse). Exit 0 both times.

- [ ] **Admin: create catalog entries**

Start the dev server (`npm run dev`). Sign in as admin (in `ADMIN_EMAILS`). Visit `/catalog` directly.

- Page loads, header reads "Materials catalog".
- "New material" button visible.

Create two entries:
1. Name `OPC 53 cement`, unit `bag`, unit price `380`, notes empty.
2. Name `Sand`, unit `m³` (select `m3`), unit price `2200`, notes `Plaster grade`.

Each create:
- Dialog closes on success.
- New row appears in the table immediately (`router.refresh()`).
- `mongosh`: `db.materials.find({}).toArray()` returns the two docs with `unitPrice` set, `createdBy` populated, `createdAt`/`updatedAt` recent.

- [ ] **Admin: edit catalog entry — happy path**

Click "Edit" on the Sand row. Change unit price to `2400`. Save.
- Row updates, dialog closes.
- `mongosh`: `db.materials.findOne({name: "Sand"}).unitPrice === 2400`. `updatedAt` is newer than `createdAt`.

- [ ] **Admin: try to change unit after movements exist (guard fires)**

Leave this step until after Task 18's purchase step. Come back here once a Sand purchase exists. The block:

Open `/catalog`, edit Sand, change unit from `m³` to `kg`. Submit.

Expected: inline error on the unit field "Cannot change unit after movements exist for this material." Dialog stays open. No write.

`mongosh`: `db.materials.findOne({name: "Sand"}).unit === "m3"` (unchanged).

- [ ] **Admin: navigate to a project's Materials tab**

Open `/projects/<id>`. Click the **Materials** tab.

- Tab loads (no placeholder).
- Empty state visible: "No materials tracked for this project yet."
- "Add material" button visible.

- [ ] **Known bootstrap gap — seed first `projectMaterials` row via mongosh**

**Acknowledge upfront:** Phase 4 ships with a known UX gap. The materials table only shows rows from `projectMaterials`, and `projectMaterials` rows are only created lazily on first purchase or return. But the "Record purchase" button itself lives on a `projectMaterials`-backed row, so there's no in-UI way to trigger the very first purchase for a new project + material pair. Phase 7 polish will add a "Record first purchase" entry on the empty state. Until then, seed via mongosh.

Open `mongosh`:

```js
use wangredev
const opcId = db.materials.findOne({ name: "OPC 53 cement" })._id
const projectId = ObjectId("<your-project-id>")
db.projectMaterials.insertOne({
  projectId,
  materialId: opcId,
  stockOnHand: 0,
  createdAt: new Date(),
  updatedAt: new Date()
})
```

Refresh the project's Materials tab. The OPC 53 cement row now appears with `Stock on hand: 0` and all action buttons (including "Record purchase" for admin).

- [ ] **Admin: record a purchase**

Click "Record purchase" on the OPC 53 cement row. Form:
- Quantity: `100`
- Unit price: `380` (pre-filled from catalog)
- Live amount: `₹38,000`
- Date: today
- Notes: `Supplier: ABC Cements, Invoice 1234`

Submit. Expected:
- Dialog closes.
- Row's Stock-on-hand: `100`. Total spent: `₹38,000`. Last movement: today.

`mongosh` checks:
- `db.projectMaterials.findOne({projectId, materialId})` → `stockOnHand: 100`, `updatedAt` recent.
- `db.transactions.find({projectId, category: "purchase"}).toArray()` → one row with `kind: "expense"`, `amount: 38000`, `description: "Purchase: OPC 53 cement"`, `notes: "Supplier: ABC Cements, Invoice 1234"`, `unitId: null`, `createdBy` populated.
- `db.materialMovements.find({projectId, materialId, category: "purchase"}).toArray()` → one row with `kind: "in"`, `qty: 100`, `unitPriceAtMovement: 380`, `amount: 38000`, `transactionId` matching the transactions row's `_id`.

- [ ] **Now re-do the "unit-change guard" step from earlier** — Sand still has no movements; let's create one to make the guard testable. Seed `projectMaterials` for Sand:

```js
db.projectMaterials.insertOne({
  projectId: ObjectId("<id>"),
  materialId: ObjectId("<sand-id>"),
  stockOnHand: 0,
  createdAt: new Date(),
  updatedAt: new Date()
})
```

Record a Sand purchase (1 m³ @ ₹2400). Then go back to `/catalog`, edit Sand, try to change unit. The guard should now fire as documented above.

- [ ] **Both roles: log consumption — happy path**

Stay as admin. On OPC 53 cement row click "Log use":
- Quantity used: `40`
- Purpose: `Tower A foundation pour`
- Date: today

Submit. Expected:
- Dialog closes.
- Stock-on-hand becomes `60`. Total spent still `₹38,000` (consumption does not move the ledger).
- Last movement: today.

`mongosh`:
- `db.projectMaterials.findOne({projectId, materialId: opc}).stockOnHand === 60`.
- `db.materialMovements.find({category: "consumption"}).toArray()` → one row with `kind: "out"`, `qty: 40`, `purpose: "Tower A foundation pour"`, no `transactionId`, no `amount`.
- `db.transactions.countDocuments({projectId, category: "purchase"}) === 1` (still just the purchase row).

- [ ] **Insufficient-stock smoke test**

On OPC 53 cement (stock = 60), click "Log use". Quantity: `200`. Purpose: anything. Submit.

Expected: inline error on the qty field "Only 60 available — refresh and try again." Dialog stays open. No write.

`mongosh`: stock unchanged at 60. No new movement row.

- [ ] **Race smoke test**

Open two tabs to the project's Materials tab as admin. Open Log-use dialog on OPC 53 cement (stock = 60) in **both** tabs. Tab 1: qty `45`. Tab 2: qty `30`. Submit Tab 1, then Tab 2 within a couple of seconds.

Expected: exactly one succeeds. The successful tab shows stock = 15. The losing tab shows "Only 15 available — refresh and try again."

`mongosh`: `db.projectMaterials.findOne({materialId: opc}).stockOnHand === 15` (NOT a negative number). One consumption movement for qty 45 exists; no consumption movement for qty 30.

- [ ] **Atomicity smoke test on `recordPurchase`**

Open `lib/materials/repository.ts`. Inside `recordPurchase`, between the `pms.updateOne` upsert and `txns.insertOne`, add:

```ts
throw new Error("synthetic test failure")
```

Save. As admin, attempt to record another purchase of OPC 53 cement (qty 10, price 380). Expected:

- Dialog shows error "Could not record purchase. Please try again."
- Dialog stays open.
- `mongosh`: `db.projectMaterials.findOne({materialId: opc}).stockOnHand === 15` (NOT 25 — rollback worked).
- `mongosh`: `db.transactions.countDocuments({category: "purchase"})` unchanged.
- `mongosh`: `db.materialMovements.countDocuments({category: "purchase"}) === 1` (the original Sand-and-OPC purchases).

**REMOVE the synthetic throw before continuing.** Then verify a real purchase of OPC 53 cement (qty 10 @ 380) works again, and stock goes to 25.

- [ ] **Return — happy path**

On OPC 53 cement (stock = 25), click "Log return":
- Quantity returned: `5`
- Reason: `Excess from foundation pour`

Submit. Expected:
- Dialog closes.
- Stock-on-hand: `30`.

`mongosh`:
- `db.projectMaterials.findOne({materialId: opc}).stockOnHand === 30`.
- `db.materialMovements.find({category: "return"}).toArray()` → one row, `kind: "in"`, `qty: 5`, `purpose: "Excess from foundation pour"`, no `transactionId`, no `amount`.

- [ ] **Movement history sheet — admin view**

Click "History" on OPC 53 cement. Sheet opens on the right. Rows (newest first):
1. Return: `+5`, no amount
2. Purchase: `+10`, `₹3,800`
3. Consumption: `−45`, no amount
4. Consumption: `−40`, no amount (if you ran the race test)
5. Purchase: `+100`, `₹38,000`

(Exact set depends on which side races you ran. Verify shape, not exact counts.)

Admin sees the `Amount` column for purchases.

- [ ] **Stock-counter invariant check (mongosh)**

```js
const pid = ObjectId("<project-id>")
const mid = ObjectId("<opc-material-id>")

const pm = db.projectMaterials.findOne({ projectId: pid, materialId: mid })

const totals = db.materialMovements.aggregate([
  { $match: { projectId: pid, materialId: mid, voided: { $ne: true } } },
  { $group: {
      _id: "$kind",
      total: { $sum: "$qty" }
  }}
]).toArray()

const inTotal = (totals.find(t => t._id === "in")?.total) ?? 0
const outTotal = (totals.find(t => t._id === "out")?.total) ?? 0
print(`stockOnHand=${pm.stockOnHand}  inSum-outSum=${inTotal - outTotal}`)
```

Expected: the two numbers are equal.

- [ ] **Purchase → transaction linkage check (mongosh)**

```js
db.materialMovements.find({
  category: "purchase",
  $or: [{ transactionId: null }, { transactionId: { $exists: false } }]
}).count()
```

Expected: `0`. Every purchase movement carries a `transactionId`.

- [ ] **`/catalog` FM-redirect guard**

Sign out. Sign in as a non-admin user. In the browser address bar, navigate to `/catalog`.

Expected: redirect (handled by `requireAdmin()`). The user lands on `/projects` (the auth helper's default) or wherever `requireAdmin` redirects to. They do NOT see the catalog page.

`grep` confirms: `await requireAdmin()` is the first executable line of `app/(authed)/catalog/page.tsx`.

- [ ] **FM: project Materials tab access**

Still as FM, open `/projects/<id>` → Materials tab.

- Materials table visible.
- Stock-on-hand column visible.
- **No** "Total spent" column.
- "Add material" button visible (in-context FM add).
- On each row: "Log use", "Log return", "History" buttons visible. **No** "Record purchase" button (admin only).

- [ ] **FM: in-context add material has no price field**

Click "Add material" on the Materials tab. Form:
- Name, Unit (+ optional unitOther), Notes. **No** Unit price field anywhere.

Add a material (`Tile`, unit `box`, notes empty). Submit. Expected:
- Material created in catalog. `mongosh`: `db.materials.findOne({name: "Tile"}).unitPrice === null`.
- New material is visible in `/catalog` view too (when an admin checks).

- [ ] **FM: log consumption + return work**

As FM, on OPC 53 cement (existing stock from earlier steps), log a consumption of 5 with purpose `Trial pour`. Submit. Expected: success, stock decremented, no money fields involved anywhere.

- [ ] **FM: movement history sheet — no money**

Click "History" on OPC 53 cement as FM. Sheet opens. The `Amount` column is **absent**. Quantities and purposes visible. `Network` tab inspection: the `/api/movements` response payload has `amount: undefined` (or absent) on every row.

- [ ] **Final clean state**

```bash
git status
git log --oneline -25
```

Working tree clean. Recent commit history shows the Phase 4 work as per-task commits.

- [ ] **Merge to master (no push)**

When manual verification is complete and you want to wrap Phase 4:

```bash
git checkout master
git merge --ff-only feat/phase-4-materials
git branch -d feat/phase-4-materials
```

The user has said "do NOT push without asking." Do not run `git push`.

- [ ] **Update meta-plan**

Open `C:\Users\simra\.claude\plans\make-multiple-small-plans-structured-dragon.md` and update the Phase 4 row in the phase map table to indicate it's verified:

```
| 4 | `docs/plans/phase-4-materials.md` | `materials` + `projectMaterials` + `materialMovements` collections, admin catalog page, project Materials tab with stock counter + purchase/consumption/return flows (atomic with `transactions` for purchases). First phase writing `kind: "expense"` rows. **(Detailed in repo; verified working.)** |
```

Mirrors the convention from Phases 1, 2, and 3.

---

## Notes for Phase 5 (next phase)

Phase 4 was the first writer of `kind: "expense"` rows in the `transactions` collection. Phase 5 (Financials) reads them as part of the full ledger view. The indexes from Phase 3 (`{projectId, occurredAt}`, `{projectId, kind, voided}`) already cover Phase 5's expected aggregate and filter queries — no new transactions indexes expected.

Phase 5 will introduce true reversing-entry corrections. Material-purchase reversals should create a paired transactions row (kind: expense, negative-style — TBD: reversed via either a `voided` flag on the original + a new "correction" row, OR a separate `reversedBy: ObjectId` link). The Phase 4 spec deferred `voidMovement` to Phase 5; expect that action to wrap both the materialMovements void AND the transactions reversal in a single `withTransaction`.

Phase 6 (Inter-project transfers) will use the already-declared `transfer_in` and `transfer_out` movement categories. The destination project's `projectMaterials` row is upserted in the same `withTransaction` as the source's decrement — race-safety via the same `findOneAndUpdate({stockOnHand: $gte: qty})` pattern on the source.

Phase 7 polish items deferred during Phase 4: URL-synced filters on materials table, CSV export of movement history, low-stock badges on the project tile, the cross-project `/materials` warehouse view, materials count tile in the project header, and ideally a proper "first purchase" CTA on the empty-state Materials tab so the bootstrap mongosh-seed workaround in T18 is no longer needed.
