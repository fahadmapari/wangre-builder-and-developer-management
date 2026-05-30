# Phase 10 — Edit Tracking + Project/Unit Edit Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `lastUpdatedBy` / `lastUpdatedAt` tracking on `projects`, `units`, `materials`; ship the missing `updateProject`, `editUnit`, and `expandProjectCapacity` server actions; extend the audit log with an `updated` action; retrofit existing `updateMaterial` to use the new shared helper.

**Architecture:** Continues Phase 7's read-from-existing-fields audit pattern — every `findOneAndUpdate` that user-edits an in-scope entity sets `lastUpdatedBy` + `lastUpdatedAt` via a shared `withUpdateMeta(set, userId)` helper. Audit fetchers `$or` over both `createdAt` and `lastUpdatedAt` to emit `created` + `updated` events from the same documents. One-time migration backfills `startingUnitNumber` / `unitsPerFloor` / `parkingPrefix` onto existing Project docs (consumed-and-discarded today at create time), so `expandProjectCapacity` can continue the numbering sequence without re-asking. All three new actions are admin-only.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · MongoDB native driver (sessions + transactions for `expandProjectCapacity`) · Zod for input schemas · shadcn/ui `Dialog`.

**Project conventions to follow:**
- **No automated tests.** Project convention. Verification per task = `npm run typecheck` + `npm run lint`. Manual T-tasks aggregated at end (Task 19).
- Auth: `await requireAdmin()` is the first executable line of every server action in this phase.
- Server actions return `ActionResult<T>` from `lib/projects/schemas.ts` — NOT `@/types`.
- Mongo transactions wrap every multi-document write. `client.startSession()` + `session.withTransaction(...)` + thread `{ session }` into every read AND write.
- `createdBy: new ObjectId(userId)` from `(await requireAuth()).id`.
- `revalidatePath` after every mutation, including the relevant per-project, global, AND `/audit` paths (audit-visible per Phase 7 convention).
- Dialog state-reset key trick: `<Dialog key={open ? \`open-${id}\` : "closed"} ...>` on every form dialog.
- Date helpers use LOCAL components, never `toISOString().slice(0,10)`.
- React 19 `react-hooks/set-state-in-effect` is enforced — do NOT call `setState` directly inside a `useEffect` body.

---

## File structure

**New files (6):**

| File | Responsibility |
|---|---|
| `lib/audit/update-meta.ts` | `withUpdateMeta(set, userId)` helper that merges `lastUpdatedBy`/`lastUpdatedAt`/`updatedAt` into a `$set` payload |
| `scripts/migrate-phase-10.mjs` | One-time idempotent migration: backfills `startingUnitNumber`/`unitsPerFloor`/`parkingPrefix` onto existing Project docs |
| `app/(authed)/projects/[id]/edit-project-dialog.tsx` | Admin Dialog for descriptive project edits (name/location/status/notes) |
| `app/(authed)/projects/[id]/expand-capacity-dialog.tsx` | Admin Dialog with capacity-expansion + confirmation step |
| `app/(authed)/projects/[id]/inventory/edit-unit-dialog.tsx` | Admin Dialog for editing a single unit's fields |
| `app/(authed)/catalog/material-meta-line.tsx` | Tiny client component rendering inline "Last updated by X • date" line (reused on catalog + project header + drilldown) |

**Modified files (~13):**

| File | Changes |
|---|---|
| `lib/projects/schemas.ts` | Project + Unit type fields (`lastUpdatedBy?`/`lastUpdatedAt?`); new persistent Project fields (`startingUnitNumber`/`unitsPerFloor`/`parkingPrefix`); new input schemas (UpdateProject, ExpandProjectCapacity, EditUnit) |
| `lib/materials/schemas.ts` | Material type fields (`lastUpdatedBy?`/`lastUpdatedAt?`) |
| `lib/drilldown/schemas.ts` | `UnitDrilldown` gains `lastUpdatedBy: { actorName, at } \| null` |
| `lib/drilldown/actions.ts` | Populate `UnitDrilldown.lastUpdatedBy` in the unit branch |
| `lib/audit/schemas.ts` | Add `"updated"` to `AuditAction` enum |
| `lib/audit/repository.ts` | Extend `fetchProjectEvents`, `fetchUnitEvents`, `fetchMaterialEvents` to `$or` on `lastUpdatedAt` and emit `updated` events; extend `listEntityHistory` project/unit/material branches similarly |
| `app/(authed)/projects/actions.ts` | `createProject` now persists the three numbering fields; new `updateProject` action; new `expandProjectCapacity` action |
| `app/(authed)/projects/[id]/inventory/actions.ts` | New `editUnit` action |
| `app/(authed)/catalog/actions.ts` | `updateMaterial` calls `withUpdateMeta`; add `revalidatePath("/audit")` |
| `app/(authed)/projects/[id]/page.tsx` | Render Edit Project + Add Capacity buttons (admin-only); pass numbering params + last-updated meta to children |
| `app/(authed)/projects/[id]/inventory/unit-row.tsx` | Add Edit entry to actions menu (admin-only); render EditUnitDialog |
| `app/(authed)/audit/audit-filters.tsx` | Add `<option value="updated">Updated</option>` to the Action select |
| `app/(authed)/audit/audit-table.tsx` | Add badge variant for `"updated"` action |

**Total: 6 new + 13 modified = 19 files.**

---

## Task ordering rationale

1. **Group A (Tasks 1–3)** — Foundation types + helper. Pure types/schemas/single tiny file. No behavioral change.
2. **Group B (Task 4)** — Migration script. Independent; safe to run early so Group D can rely on the data.
3. **Group C (Tasks 5–6)** — `createProject` updated + `updateMaterial` retrofit. Smallest behavior changes; isolate them first.
4. **Group D (Tasks 7–9)** — Three new server actions (`updateProject`, `editUnit`, `expandProjectCapacity`).
5. **Group E (Tasks 10–11)** — Audit extensions: fetchers + `listEntityHistory` + audit UI.
6. **Group F (Task 12)** — Drilldown action extension.
7. **Group G (Tasks 13–15)** — Three Dialog components, each self-contained.
8. **Group H (Tasks 16–17)** — Wire Dialogs into pages.
9. **Group I (Task 18)** — Inline "Last updated by" surfaces.
10. **Group J (Task 19)** — Final verification + T-tasks.

---

## Group A — Foundation (types + helper)

### Task 1: Extend domain types and add new input schemas

**Files:**
- Modify: `lib/projects/schemas.ts`
- Modify: `lib/materials/schemas.ts`
- Modify: `lib/audit/schemas.ts`
- Modify: `lib/drilldown/schemas.ts`

- [ ] **Step 1: Extend `Project` and `Unit` types + add new persistent fields to Project**

In `lib/projects/schemas.ts`, replace the `Project` type (currently lines 71–82) with:

```ts
export type Project = {
  _id: ObjectId
  name: string
  location: string
  status: ProjectStatus
  totalUnits: number
  totalParkings: number
  notes?: string
  // Numbering params, now persisted (consumed at create + reused by expand-capacity)
  startingUnitNumber?: number
  unitsPerFloor?: number
  parkingPrefix?: string
  // Edit tracking — present after first post-Phase-10 edit
  lastUpdatedBy?: ObjectId
  lastUpdatedAt?: Date
  createdBy: ObjectId
  createdAt: Date
  updatedAt: Date
}
```

Replace the `Unit` type (currently lines 87–103) with:

```ts
export type Unit = {
  _id: ObjectId
  projectId: ObjectId
  type: UnitType
  number: string
  floor: number
  areaSqft: number
  salePrice: number
  status: UnitStatus
  soldAt?: Date
  soldPriceTotal?: number
  buyerName?: string
  notes?: string
  lastUpdatedBy?: ObjectId
  lastUpdatedAt?: Date
  createdBy: ObjectId
  createdAt: Date
  updatedAt: Date
}
```

**Note:** `startingUnitNumber`/`unitsPerFloor`/`parkingPrefix` are typed as optional because pre-migration docs lack them. After Task 4 runs, all docs have them.

- [ ] **Step 2: Add three new input schemas to `lib/projects/schemas.ts`**

Append after the existing `CreateProjectInputSchema` export:

```ts
export const UpdateProjectInputSchema = z.object({
  projectId: z.string().min(1, "Missing project"),
  name: z.string().trim().min(1).max(120).optional(),
  location: z.string().trim().min(1).max(200).optional(),
  status: ProjectStatusSchema.optional(),
  notes: z.string().max(2000).optional(),
})
export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>

export const ExpandProjectCapacityInputSchema = z
  .object({
    projectId: z.string().min(1, "Missing project"),
    additionalUnits: z.coerce.number().int().min(0).max(2000).default(0),
    additionalParkings: z.coerce.number().int().min(0).max(2000).default(0),
  })
  .refine((v) => v.additionalUnits + v.additionalParkings > 0, {
    message: "Specify at least one count to add",
    path: ["additionalUnits"],
  })
export type ExpandProjectCapacityInput = z.infer<typeof ExpandProjectCapacityInputSchema>

export const EditUnitInputSchema = z.object({
  unitId: z.string().min(1, "Missing unit"),
  number: z.string().trim().min(1).max(20).optional(),
  floor: z.coerce.number().int().min(0).max(99).optional(),
  areaSqft: z.coerce.number().positive().max(100_000).optional(),
  salePrice: z.coerce.number().min(0).max(1_000_000_000).optional(),
  notes: z.string().max(2000).optional(),
})
export type EditUnitInput = z.infer<typeof EditUnitInputSchema>
```

- [ ] **Step 3: Extend `Material` type**

In `lib/materials/schemas.ts`, replace the `Material` type (currently lines 139–149) with:

```ts
export type Material = {
  _id: ObjectId
  name: string
  unit: MaterialUnit
  unitOther?: string
  unitPrice: number | null
  notes?: string
  lastUpdatedBy?: ObjectId
  lastUpdatedAt?: Date
  createdBy: ObjectId
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 4: Add `"updated"` to `AuditAction` enum**

In `lib/audit/schemas.ts`, change line 4 from:

```ts
export const AuditActionSchema = z.enum(["created", "voided", "reversed"])
```

to:

```ts
export const AuditActionSchema = z.enum(["created", "voided", "reversed", "updated"])
```

- [ ] **Step 5: Extend `UnitDrilldown` discriminated union variant**

In `lib/drilldown/schemas.ts`, find the `UnitDrilldownSchema` definition. It is a `z.object` with properties including `entityType: z.literal("unit")`. Add a new property `lastUpdatedBy` to that object schema:

```ts
lastUpdatedBy: z
  .object({
    actorName: z.string(),
    at: z.date(),
  })
  .nullable(),
```

Place this property alongside the existing `soldPriceTotal` field in the same `z.object` literal. (The TypeScript types are inferred from the Zod schema so no separate type edit is needed.)

- [ ] **Step 6: Verify**

```bash
npm run typecheck
npm run lint
```

Expected: both pass. (Note: TS errors may surface in actions that read these types — those are addressed in later tasks. If errors appear, scan them and confirm they all come from files marked for modification in Tasks 5–18; that is expected.)

- [ ] **Step 7: Commit**

```bash
git add lib/projects/schemas.ts lib/materials/schemas.ts lib/audit/schemas.ts lib/drilldown/schemas.ts
git commit -m "feat(phase-10): extend domain types with lastUpdatedBy + new input schemas"
```

---

### Task 2: Add `withUpdateMeta` helper

**Files:**
- Create: `lib/audit/update-meta.ts`

- [ ] **Step 1: Write the helper file**

Create `lib/audit/update-meta.ts` with this exact content:

```ts
import { ObjectId } from "mongodb"

/**
 * Merges audit-edit metadata into a `$set` payload for findOneAndUpdate.
 *
 * Every user-initiated edit on tracked entities (projects, units, materials)
 * must go through this helper so the audit log can read who-edited-when from
 * the entity doc itself (Phase 7 read-from-existing-fields pattern).
 *
 * Also sets `updatedAt` so the existing convention stays in sync.
 */
export function withUpdateMeta<T extends Record<string, unknown>>(
  set: T,
  userId: string
): T & { lastUpdatedBy: ObjectId; lastUpdatedAt: Date; updatedAt: Date } {
  const now = new Date()
  return {
    ...set,
    lastUpdatedBy: new ObjectId(userId),
    lastUpdatedAt: now,
    updatedAt: now,
  } as T & { lastUpdatedBy: ObjectId; lastUpdatedAt: Date; updatedAt: Date }
}
```

- [ ] **Step 2: Verify**

```bash
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add lib/audit/update-meta.ts
git commit -m "feat(phase-10): add withUpdateMeta helper"
```

---

### Task 3: Retrofit `updateMaterial` to use `withUpdateMeta`

**Files:**
- Modify: `app/(authed)/catalog/actions.ts`

- [ ] **Step 1: Read the current `updateMaterial` action**

Run:

```bash
sed -n '60,140p' "app/(authed)/catalog/actions.ts"
```

You should see the existing `updateMaterial` function. Identify the line where `$set` is constructed and the `revalidatePath` calls.

- [ ] **Step 2: Wrap the `$set` body with `withUpdateMeta`**

Locate the `findOneAndUpdate` (or `updateOne`) call inside `updateMaterial`. The current code looks roughly like:

```ts
await db.collection("materials").findOneAndUpdate(
  { _id: new ObjectId(input.materialId) },
  { $set: { name, unit, unitOther, unitPrice, notes } }
)
```

Replace the `$set` value with `withUpdateMeta(...)`:

```ts
await db.collection("materials").findOneAndUpdate(
  { _id: new ObjectId(input.materialId) },
  { $set: withUpdateMeta({ name, unit, unitOther, unitPrice, notes }, user.id) }
)
```

The exact local variable names may differ — keep the existing field-name expressions inside the inner object. The `user.id` reference should come from the existing `(await requireAdmin())` result; if the action stores it in a different variable, use that.

- [ ] **Step 3: Add the import**

Add to the top of the file:

```ts
import { withUpdateMeta } from "@/lib/audit/update-meta"
```

- [ ] **Step 4: Ensure `revalidatePath("/audit")` is called**

Find the `revalidatePath(...)` call(s) at the bottom of `updateMaterial`. If `/audit` is not already in the list, add it as an additional call:

```ts
revalidatePath("/audit")
```

(Adjacent to the existing `/catalog` revalidation.)

- [ ] **Step 5: Verify**

```bash
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add "app/(authed)/catalog/actions.ts"
git commit -m "feat(phase-10): updateMaterial uses withUpdateMeta + revalidates /audit"
```

---

## Group B — Migration

### Task 4: One-time migration script

**Files:**
- Create: `scripts/migrate-phase-10.mjs`

- [ ] **Step 1: Write the migration script**

Create `scripts/migrate-phase-10.mjs` with this exact content:

```js
// Phase 10 — One-time migration.
//
// Backfills startingUnitNumber / unitsPerFloor / parkingPrefix onto existing
// Project docs by inferring them from existing unit numbering. Idempotent:
// only processes projects missing `startingUnitNumber`.
//
// Does NOT backfill lastUpdatedBy / lastUpdatedAt. Pre-Phase-10 docs stay
// quiet in the audit log by design.
//
// Run: node --env-file-if-exists=.env scripts/migrate-phase-10.mjs

import { MongoClient } from "mongodb"

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error("MONGODB_URI not set")
  process.exit(1)
}

const client = new MongoClient(uri, { serverApi: { strict: false } })

async function main() {
  await client.connect()
  const db = client.db()
  const projects = db.collection("projects")
  const units = db.collection("units")

  const targets = await projects
    .find({ startingUnitNumber: { $exists: false } })
    .toArray()

  console.log(`Found ${targets.length} project(s) missing numbering params.`)

  let migrated = 0
  let skipped = 0

  for (const p of targets) {
    const apartments = await units
      .find({ projectId: p._id, type: "apartment" })
      .sort({ number: 1 })
      .toArray()
    const parkings = await units
      .find({ projectId: p._id, type: "parking" })
      .sort({ number: 1 })
      .toArray()

    let startingUnitNumber = 101
    let unitsPerFloor = 4
    if (apartments.length > 0) {
      // Parse numeric form of apartment number.
      const nums = apartments
        .map((u) => parseInt(u.number, 10))
        .filter((n) => Number.isFinite(n))
      if (nums.length === 0) {
        console.warn(
          `  ! Project ${p._id} has apartments but no numeric numbers — skipping.`
        )
        skipped++
        continue
      }
      nums.sort((a, b) => a - b)
      startingUnitNumber = nums[0]
      // Infer unitsPerFloor: count how many apartments share the lowest floor.
      // Floor = Math.floor(n / 100). Position within floor = n % 100.
      const lowestFloor = Math.floor(nums[0] / 100)
      const lowestFloorCount = nums.filter(
        (n) => Math.floor(n / 100) === lowestFloor
      ).length
      // Clamp to schema range (1-9).
      unitsPerFloor = Math.max(1, Math.min(9, lowestFloorCount))
    }

    let parkingPrefix = "P"
    if (parkings.length > 0) {
      const first = parkings[0].number
      const m = first.match(/^([^\d]+)/)
      if (m && m[1]) parkingPrefix = m[1]
    }

    await projects.updateOne(
      { _id: p._id },
      {
        $set: {
          startingUnitNumber,
          unitsPerFloor,
          parkingPrefix,
        },
      }
    )
    migrated++
    console.log(
      `  ✓ ${p.name}: startingUnitNumber=${startingUnitNumber}, unitsPerFloor=${unitsPerFloor}, parkingPrefix=${parkingPrefix}`
    )
  }

  console.log(`\nMigrated ${migrated} project(s); skipped ${skipped}.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => client.close())
```

- [ ] **Step 2: Run a dry-pass first (visual sanity check on dev DB)**

Run:

```bash
node --env-file-if-exists=.env scripts/migrate-phase-10.mjs
```

Expected: prints one line per project being migrated, then a final summary line. No errors. Numbers reported match what you'd expect from your fixtures.

- [ ] **Step 3: Re-run to verify idempotency**

```bash
node --env-file-if-exists=.env scripts/migrate-phase-10.mjs
```

Expected: "Found 0 project(s) missing numbering params. Migrated 0; skipped 0."

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-phase-10.mjs
git commit -m "feat(phase-10): one-time migration — backfill project numbering params"
```

---

## Group C — `createProject` persists numbering

### Task 5: `createProject` stores numbering params

**Files:**
- Modify: `app/(authed)/projects/actions.ts`

- [ ] **Step 1: Read the current `createProject` action**

Run:

```bash
sed -n '1,80p' "app/(authed)/projects/actions.ts"
```

Identify the line where the project doc is inserted (`insertOne` on `projects`).

- [ ] **Step 2: Add the three numbering fields to the inserted doc**

The current `insertOne` call constructs an object roughly like:

```ts
{
  name: input.name,
  location: input.location,
  status: input.status,
  totalUnits: input.totalUnits,
  totalParkings: input.totalParkings,
  notes: input.notes,
  createdBy: new ObjectId(user.id),
  createdAt: now,
  updatedAt: now,
}
```

Add three properties to that literal so the numbering params are persisted (not just consumed at create):

```ts
{
  name: input.name,
  location: input.location,
  status: input.status,
  totalUnits: input.totalUnits,
  totalParkings: input.totalParkings,
  notes: input.notes,
  startingUnitNumber: input.startingUnitNumber,
  unitsPerFloor: input.unitsPerFloor,
  parkingPrefix: input.parkingPrefix,
  createdBy: new ObjectId(user.id),
  createdAt: now,
  updatedAt: now,
}
```

The exact local variable name for the result of `CreateProjectInputSchema.parse(...)` may differ — use whatever the file currently uses (often `input` or `parsed`). The three property keys (`startingUnitNumber` etc.) are present on the parsed input because they have `.default(...)` values in the schema.

- [ ] **Step 3: Verify**

```bash
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 4: Smoke-test by creating a project in the dev app**

```bash
npm run dev
```

Open the new-project form, submit a valid project. Then in a separate shell:

```bash
node --env-file-if-exists=.env -e "import('mongodb').then(async ({MongoClient}) => { const c = new MongoClient(process.env.MONGODB_URI); await c.connect(); const p = await c.db().collection('projects').findOne({}, {sort:{createdAt:-1}}); console.log({startingUnitNumber: p.startingUnitNumber, unitsPerFloor: p.unitsPerFloor, parkingPrefix: p.parkingPrefix}); await c.close() })"
```

Expected: prints the three values you submitted on the form (e.g. `{ startingUnitNumber: 101, unitsPerFloor: 4, parkingPrefix: 'P' }`). Stop the dev server (`Ctrl+C`) before continuing.

- [ ] **Step 5: Commit**

```bash
git add "app/(authed)/projects/actions.ts"
git commit -m "feat(phase-10): createProject persists numbering params"
```

---

## Group D — New server actions

### Task 6: `updateProject` action

**Files:**
- Modify: `app/(authed)/projects/actions.ts`

- [ ] **Step 1: Add imports**

Ensure these imports are at the top of the file (add what is missing):

```ts
import { UpdateProjectInputSchema } from "@/lib/projects/schemas"
import { withUpdateMeta } from "@/lib/audit/update-meta"
```

- [ ] **Step 2: Append the action**

Append to the end of `app/(authed)/projects/actions.ts`:

```ts
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
```

(If `ActionResult`, `requireAdmin`, `ObjectId`, `getDb`, `revalidatePath` are not yet imported in this file, add the imports — match the patterns used by `createProject` higher up in the file.)

- [ ] **Step 3: Verify**

```bash
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add "app/(authed)/projects/actions.ts"
git commit -m "feat(phase-10): updateProject server action"
```

---

### Task 7: `editUnit` action

**Files:**
- Modify: `app/(authed)/projects/[id]/inventory/actions.ts`

- [ ] **Step 1: Add imports**

Add to the top of the file:

```ts
import { EditUnitInputSchema } from "@/lib/projects/schemas"
import { withUpdateMeta } from "@/lib/audit/update-meta"
```

If `requireAdmin`, `ObjectId`, `getDb`, `revalidatePath`, `ActionResult` aren't imported yet, add them too — match the patterns used by `markUnitSold` higher up.

- [ ] **Step 2: Append the action**

Append to the end of `app/(authed)/projects/[id]/inventory/actions.ts`:

```ts
export async function editUnit(
  raw: unknown
): Promise<ActionResult<void>> {
  const user = await requireAdmin()

  const parsed = EditUnitInputSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? "Invalid input",
      field: issue?.path?.[0]?.toString(),
    }
  }
  const input = parsed.data

  if (!ObjectId.isValid(input.unitId)) {
    return { ok: false, error: "Invalid unit id" }
  }
  const unitId = new ObjectId(input.unitId)

  try {
    const db = getDb()
    const unit = await db.collection("units").findOne({ _id: unitId })
    if (!unit) {
      return { ok: false, error: "Unit not found" }
    }

    // Block salePrice edits on sold units.
    if (input.salePrice !== undefined && unit.status === "sold") {
      return {
        ok: false,
        error: "Cannot change list price of a sold unit",
        field: "salePrice",
      }
    }

    // Pre-write uniqueness check for `number` within the same project.
    // Race-acceptable: admin-only, low edit volume.
    if (input.number !== undefined && input.number !== unit.number) {
      const collision = await db.collection("units").findOne({
        projectId: unit.projectId,
        number: input.number,
        _id: { $ne: unitId },
      })
      if (collision) {
        return {
          ok: false,
          error: `Number "${input.number}" already used in this project`,
          field: "number",
        }
      }
    }

    const set: Record<string, unknown> = {}
    if (input.number !== undefined) set.number = input.number
    if (input.floor !== undefined) set.floor = input.floor
    if (input.areaSqft !== undefined) set.areaSqft = input.areaSqft
    if (input.salePrice !== undefined) set.salePrice = input.salePrice
    if (input.notes !== undefined) set.notes = input.notes

    await db.collection("units").findOneAndUpdate(
      { _id: unitId },
      { $set: withUpdateMeta(set, user.id) }
    )

    const projectIdHex = unit.projectId.toHexString()
    revalidatePath(`/projects/${projectIdHex}`)
    revalidatePath(`/projects/${projectIdHex}/inventory`)
    revalidatePath("/audit")
    return { ok: true, data: undefined }
  } catch (e) {
    console.error("[editUnit]", e)
    return { ok: false, error: "Failed to update unit" }
  }
}
```

- [ ] **Step 3: Verify**

```bash
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add "app/(authed)/projects/[id]/inventory/actions.ts"
git commit -m "feat(phase-10): editUnit server action"
```

---

### Task 8: `expandProjectCapacity` action

**Files:**
- Modify: `app/(authed)/projects/actions.ts`

- [ ] **Step 1: Add imports**

Ensure these imports are present at the top of the file (add any missing):

```ts
import { ExpandProjectCapacityInputSchema } from "@/lib/projects/schemas"
import { getMongoClient } from "@/lib/db/client"
```

(If `getMongoClient` does not exist in `lib/db/client.ts`, use whatever export it provides for the client — read the file to confirm the export name. The pattern matches what existing transactional actions like `markUnitSold` already use.)

- [ ] **Step 2: Append the action**

Append to the end of `app/(authed)/projects/actions.ts`:

```ts
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

  const client = getMongoClient()
  const session = client.startSession()
  try {
    let outcome: ActionResult<void> = { ok: true, data: undefined }
    await session.withTransaction(async () => {
      const db = client.db()
      const project = await db
        .collection("projects")
        .findOne({ _id: projectId }, { session })
      if (!project) {
        outcome = { ok: false, error: "Project not found" }
        return
      }
      if (
        project.startingUnitNumber === undefined ||
        project.unitsPerFloor === undefined ||
        project.parkingPrefix === undefined
      ) {
        outcome = {
          ok: false,
          error:
            "Project is missing numbering params. Run scripts/migrate-phase-10.mjs first.",
        }
        return
      }

      const now = new Date()
      const createdBy = new ObjectId(user.id)
      const newUnitDocs: Record<string, unknown>[] = []

      // Generate new apartment numbers continuing the existing sequence.
      if (input.additionalUnits > 0) {
        const currentTotal = project.totalUnits ?? 0
        const startingUnitNumber = project.startingUnitNumber as number
        const unitsPerFloor = project.unitsPerFloor as number
        for (let i = 0; i < input.additionalUnits; i++) {
          const seqIndex = currentTotal + i // 0-based position in overall sequence
          const floorOffset = Math.floor(seqIndex / unitsPerFloor)
          const positionInFloor = seqIndex % unitsPerFloor
          const baseFloor = Math.floor(startingUnitNumber / 100)
          const basePosition = startingUnitNumber % 100
          const floor = baseFloor + floorOffset
          const number = floor * 100 + basePosition + positionInFloor
          newUnitDocs.push({
            projectId,
            type: "apartment",
            number: String(number),
            floor,
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

      // Generate new parking numbers continuing the existing sequence.
      if (input.additionalParkings > 0) {
        const currentTotalParkings = project.totalParkings ?? 0
        const parkingPrefix = project.parkingPrefix as string
        for (let i = 0; i < input.additionalParkings; i++) {
          const n = currentTotalParkings + i + 1
          newUnitDocs.push({
            projectId,
            type: "parking",
            number: `${parkingPrefix}${n}`,
            floor: 0,
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

    if (outcome.ok) {
      revalidatePath(`/projects/${input.projectId}`)
      revalidatePath(`/projects/${input.projectId}/inventory`)
      revalidatePath("/audit")
    }
    return outcome
  } catch (e) {
    console.error("[expandProjectCapacity]", e)
    return { ok: false, error: "Failed to expand project capacity" }
  } finally {
    await session.endSession()
  }
}
```

**Note on apartment numbering formula:** The new-unit generator mirrors what `createProject` does at create time. Pattern: `floor = floor(seqIndex / unitsPerFloor) + baseFloor`, `number = floor * 100 + basePosition + positionInFloor`. If existing units use a different formula, read `createProject` and align this code to it precisely before committing.

**Action-required cross-check:** before committing, open the existing `createProject` function and read its unit-generation loop. If its formula differs from this task's loop, replace the body of the `for (let i = 0; i < input.additionalUnits; i++)` block above with logic that exactly continues that formula starting at index `currentTotal`. The aim is bit-identical continuation, not a clever re-derivation.

- [ ] **Step 3: Verify typecheck and lint**

```bash
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 4: Smoke-test in the dev app**

```bash
npm run dev
```

Manually expand a project's capacity using the API (the dialog is not built yet — invoke the action from a temporary scratch page or directly via the Node shell). Confirm:
- New units appear in MongoDB with continuation numbering.
- `project.totalUnits` / `totalParkings` are incremented.
- `lastUpdatedBy` and `lastUpdatedAt` are set on the project.

If you don't want to wire a temp page, defer this smoke-test to Task 19's T-tasks (the dialog will exist by then). Stop the dev server before continuing.

- [ ] **Step 5: Commit**

```bash
git add "app/(authed)/projects/actions.ts"
git commit -m "feat(phase-10): expandProjectCapacity server action"
```

---

## Group E — Audit extensions

### Task 9: Extend audit fetchers to emit `updated` events

**Files:**
- Modify: `lib/audit/repository.ts`

- [ ] **Step 1: Extend `fetchProjectEvents`**

Find `fetchProjectEvents` (currently lines 165–192). Replace its body with:

```ts
async function fetchProjectEvents(filters: AuditFilters): Promise<RawEvent[]> {
  const db = getDb()
  const to = endOfDay(filters.to)
  const baseQuery: Record<string, unknown> = {
    $or: [
      { createdAt: { $gte: filters.from, $lte: to } },
      { lastUpdatedAt: { $gte: filters.from, $lte: to } },
    ],
  }
  if (filters.projectId) baseQuery._id = filters.projectId
  const rows = await db
    .collection<{
      _id: ObjectId
      name: string
      createdBy: ObjectId
      createdAt: Date
      lastUpdatedBy?: ObjectId
      lastUpdatedAt?: Date
    }>("projects")
    .find(baseQuery)
    .toArray()
  const out: RawEvent[] = []
  for (const r of rows) {
    if (inRange(r.createdAt, filters.from, to)) {
      out.push({
        id: `project:${r._id.toHexString()}:created`,
        occurredAt: r.createdAt,
        actorId: r.createdBy,
        action: "created" as AuditAction,
        entityType: "project" as AuditEntityType,
        entityId: r._id,
        projectId: r._id,
        summary: `Created project: ${r.name}`,
        refUrl: `/projects/${r._id.toHexString()}`,
      })
    }
    if (
      r.lastUpdatedBy &&
      r.lastUpdatedAt &&
      inRange(r.lastUpdatedAt, filters.from, to)
    ) {
      out.push({
        id: `project:${r._id.toHexString()}:updated`,
        occurredAt: r.lastUpdatedAt,
        actorId: r.lastUpdatedBy,
        action: "updated" as AuditAction,
        entityType: "project" as AuditEntityType,
        entityId: r._id,
        projectId: r._id,
        summary: `Updated project: ${r.name}`,
        refUrl: `/projects/${r._id.toHexString()}`,
      })
    }
  }
  return out
}
```

- [ ] **Step 2: Extend `fetchUnitEvents`**

Find `fetchUnitEvents` (currently lines 194–223). Replace its body with:

```ts
async function fetchUnitEvents(filters: AuditFilters): Promise<RawEvent[]> {
  const db = getDb()
  const to = endOfDay(filters.to)
  const baseQuery: Record<string, unknown> = {
    $or: [
      { createdAt: { $gte: filters.from, $lte: to } },
      { lastUpdatedAt: { $gte: filters.from, $lte: to } },
    ],
  }
  if (filters.projectId) baseQuery.projectId = filters.projectId
  const rows = await db
    .collection<{
      _id: ObjectId
      projectId: ObjectId
      type: string
      number: string
      createdBy: ObjectId
      createdAt: Date
      lastUpdatedBy?: ObjectId
      lastUpdatedAt?: Date
    }>("units")
    .find(baseQuery)
    .toArray()
  const out: RawEvent[] = []
  for (const r of rows) {
    if (inRange(r.createdAt, filters.from, to)) {
      out.push({
        id: `unit:${r._id.toHexString()}:created`,
        occurredAt: r.createdAt,
        actorId: r.createdBy,
        action: "created" as AuditAction,
        entityType: "unit" as AuditEntityType,
        entityId: r._id,
        projectId: r.projectId,
        summary: `Created ${r.type}: ${r.number}`,
        refUrl: `/projects/${r.projectId.toHexString()}`,
      })
    }
    if (
      r.lastUpdatedBy &&
      r.lastUpdatedAt &&
      inRange(r.lastUpdatedAt, filters.from, to)
    ) {
      out.push({
        id: `unit:${r._id.toHexString()}:updated`,
        occurredAt: r.lastUpdatedAt,
        actorId: r.lastUpdatedBy,
        action: "updated" as AuditAction,
        entityType: "unit" as AuditEntityType,
        entityId: r._id,
        projectId: r.projectId,
        summary: `Updated ${r.type}: ${r.number}`,
        refUrl: `/projects/${r.projectId.toHexString()}`,
      })
    }
  }
  return out
}
```

- [ ] **Step 3: Extend `fetchMaterialEvents`**

Find `fetchMaterialEvents` (currently lines 225–249). Replace its body with:

```ts
async function fetchMaterialEvents(filters: AuditFilters): Promise<RawEvent[]> {
  const db = getDb()
  const to = endOfDay(filters.to)
  // Materials catalog has no projectId. If the user filtered by project, no
  // materials catalog events match — return [].
  if (filters.projectId) return []
  const rows = await db
    .collection<{
      _id: ObjectId
      name: string
      createdBy: ObjectId
      createdAt: Date
      lastUpdatedBy?: ObjectId
      lastUpdatedAt?: Date
    }>("materials")
    .find({
      $or: [
        { createdAt: { $gte: filters.from, $lte: to } },
        { lastUpdatedAt: { $gte: filters.from, $lte: to } },
      ],
    })
    .toArray()
  const out: RawEvent[] = []
  for (const r of rows) {
    if (inRange(r.createdAt, filters.from, to)) {
      out.push({
        id: `material:${r._id.toHexString()}:created`,
        occurredAt: r.createdAt,
        actorId: r.createdBy,
        action: "created" as AuditAction,
        entityType: "material" as AuditEntityType,
        entityId: r._id,
        summary: `Added material to catalog: ${r.name}`,
      })
    }
    if (
      r.lastUpdatedBy &&
      r.lastUpdatedAt &&
      inRange(r.lastUpdatedAt, filters.from, to)
    ) {
      out.push({
        id: `material:${r._id.toHexString()}:updated`,
        occurredAt: r.lastUpdatedAt,
        actorId: r.lastUpdatedBy,
        action: "updated" as AuditAction,
        entityType: "material" as AuditEntityType,
        entityId: r._id,
        summary: `Updated material in catalog: ${r.name}`,
      })
    }
  }
  return out
}
```

- [ ] **Step 4: Verify**

```bash
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add lib/audit/repository.ts
git commit -m "feat(phase-10): audit fetchers emit updated events for project/unit/material"
```

---

### Task 10: Extend `listEntityHistory` + audit UI

**Files:**
- Modify: `lib/audit/repository.ts`
- Modify: `app/(authed)/audit/audit-filters.tsx`
- Modify: `app/(authed)/audit/audit-table.tsx`

- [ ] **Step 1: Extend `listEntityHistory` project branch**

Find the `entityType === "project"` branch inside `listEntityHistory` (currently around line 405). Replace it with:

```ts
} else if (entityType === "project") {
  const r = await db
    .collection<{
      _id: ObjectId
      name: string
      createdBy: ObjectId
      createdAt: Date
      lastUpdatedBy?: ObjectId
      lastUpdatedAt?: Date
    }>("projects")
    .findOne({ _id: entityId })
  if (r) {
    raw.push({
      id: `project:${r._id.toHexString()}:created`,
      occurredAt: r.createdAt,
      actorId: r.createdBy,
      action: "created",
      entityType: "project",
      entityId: r._id,
      projectId: r._id,
      summary: `Created project: ${r.name}`,
      refUrl: `/projects/${r._id.toHexString()}`,
    })
    if (r.lastUpdatedBy && r.lastUpdatedAt) {
      raw.push({
        id: `project:${r._id.toHexString()}:updated`,
        occurredAt: r.lastUpdatedAt,
        actorId: r.lastUpdatedBy,
        action: "updated",
        entityType: "project",
        entityId: r._id,
        projectId: r._id,
        summary: `Updated project: ${r.name}`,
        refUrl: `/projects/${r._id.toHexString()}`,
      })
    }
  }
}
```

- [ ] **Step 2: Extend `listEntityHistory` unit branch**

Find the `entityType === "unit"` branch (currently around line 424). Replace it with:

```ts
} else if (entityType === "unit") {
  const r = await db
    .collection<{
      _id: ObjectId
      projectId: ObjectId
      type: string
      number: string
      createdBy: ObjectId
      createdAt: Date
      lastUpdatedBy?: ObjectId
      lastUpdatedAt?: Date
    }>("units")
    .findOne({ _id: entityId })
  if (r) {
    raw.push({
      id: `unit:${r._id.toHexString()}:created`,
      occurredAt: r.createdAt,
      actorId: r.createdBy,
      action: "created",
      entityType: "unit",
      entityId: r._id,
      projectId: r.projectId,
      summary: `Created ${r.type}: ${r.number}`,
      refUrl: `/projects/${r.projectId.toHexString()}`,
    })
    if (r.lastUpdatedBy && r.lastUpdatedAt) {
      raw.push({
        id: `unit:${r._id.toHexString()}:updated`,
        occurredAt: r.lastUpdatedAt,
        actorId: r.lastUpdatedBy,
        action: "updated",
        entityType: "unit",
        entityId: r._id,
        projectId: r.projectId,
        summary: `Updated ${r.type}: ${r.number}`,
        refUrl: `/projects/${r.projectId.toHexString()}`,
      })
    }
  }
}
```

- [ ] **Step 3: Extend `listEntityHistory` material branch**

Find the `entityType === "material"` branch (currently around line 448). Replace it with:

```ts
} else if (entityType === "material") {
  const r = await db
    .collection<{
      _id: ObjectId
      name: string
      createdBy: ObjectId
      createdAt: Date
      lastUpdatedBy?: ObjectId
      lastUpdatedAt?: Date
    }>("materials")
    .findOne({ _id: entityId })
  if (r) {
    raw.push({
      id: `material:${r._id.toHexString()}:created`,
      occurredAt: r.createdAt,
      actorId: r.createdBy,
      action: "created",
      entityType: "material",
      entityId: r._id,
      summary: `Added material to catalog: ${r.name}`,
    })
    if (r.lastUpdatedBy && r.lastUpdatedAt) {
      raw.push({
        id: `material:${r._id.toHexString()}:updated`,
        occurredAt: r.lastUpdatedAt,
        actorId: r.lastUpdatedBy,
        action: "updated",
        entityType: "material",
        entityId: r._id,
        summary: `Updated material in catalog: ${r.name}`,
      })
    }
  }
}
```

- [ ] **Step 4: Add `Updated` option to the audit filter**

Open `app/(authed)/audit/audit-filters.tsx`. Find the `<select>` (or shadcn `Select`) for the Action filter. It currently has three options: Created, Voided, Reversed. Add an `Updated` option next to them. The exact JSX depends on the existing pattern; for a native select it looks like:

```tsx
<option value="updated">Updated</option>
```

For a shadcn Select with `<SelectItem>`:

```tsx
<SelectItem value="updated">Updated</SelectItem>
```

Match whichever style already exists in the file.

- [ ] **Step 5: Add `updated` badge variant to the audit table**

Open `app/(authed)/audit/audit-table.tsx`. Find the section that renders the Action column's badge — there is a `switch` or chained ternary that maps `action` to a Tailwind class string or a `<Badge>` variant. Add a new case for `"updated"`:

- Color: use Tailwind amber tones (e.g. `bg-amber-100 text-amber-800` for the table cell pattern). Distinct from the existing palette (green for created, red for voided, blue for reversed).
- Label text: `"Updated"`.

Example pattern (adapt to whatever existing branching style is used):

```tsx
action === "updated"
  ? "bg-amber-100 text-amber-800"
  : /* ... existing branches ... */
```

- [ ] **Step 6: Verify**

```bash
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add lib/audit/repository.ts "app/(authed)/audit/audit-filters.tsx" "app/(authed)/audit/audit-table.tsx"
git commit -m "feat(phase-10): listEntityHistory emits updated; audit UI gains Updated filter + badge"
```

---

## Group F — Drilldown action extension

### Task 11: Populate `UnitDrilldown.lastUpdatedBy`

**Files:**
- Modify: `lib/drilldown/actions.ts`

- [ ] **Step 1: Read the unit branch of `fetchDrilldownDetail`**

Open `lib/drilldown/actions.ts`. Find the branch that handles `entityType === "unit"`. It currently fetches the unit, computes `soldPriceTotal`, and returns a `UnitDrilldown` object.

- [ ] **Step 2: Add a user lookup for `lastUpdatedBy`**

Inside that branch, after fetching the unit `u`, add a user lookup:

```ts
let lastUpdatedBy: { actorName: string; at: Date } | null = null
if (u.lastUpdatedBy && u.lastUpdatedAt) {
  const updatedByUser = await db
    .collection<{ _id: ObjectId; name?: string; email?: string }>("users")
    .findOne(
      { _id: u.lastUpdatedBy },
      { projection: { name: 1, email: 1 } }
    )
  lastUpdatedBy = {
    actorName: updatedByUser?.name ?? updatedByUser?.email ?? "(unknown)",
    at: u.lastUpdatedAt,
  }
}
```

Then add `lastUpdatedBy` to the returned object:

```ts
return {
  ok: true,
  data: {
    entityType: "unit",
    entityId: u._id.toHexString(),
    // ... existing fields ...
    soldPriceTotal,
    lastUpdatedBy,
  },
}
```

(Replace `// ... existing fields ...` with whatever fields the existing return already includes.)

- [ ] **Step 3: Verify**

```bash
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add lib/drilldown/actions.ts
git commit -m "feat(phase-10): unit drilldown surfaces lastUpdatedBy"
```

---

## Group G — Edit Dialog components

### Task 12: `EditProjectDialog`

**Files:**
- Create: `app/(authed)/projects/[id]/edit-project-dialog.tsx`

- [ ] **Step 1: Write the dialog component**

Create `app/(authed)/projects/[id]/edit-project-dialog.tsx` with this content:

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
import { updateProject } from "../../projects/actions"
import type { ProjectStatus } from "@/lib/projects/schemas"

type Props = {
  projectId: string
  current: {
    name: string
    location: string
    status: ProjectStatus
    notes?: string
  }
}

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "planning", label: "Planning" },
  { value: "under_construction", label: "Under construction" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On hold" },
]

export function EditProjectDialog({ projectId, current }: Props) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Edit project
        </Button>
      </DialogTrigger>
      <DialogContent
        key={open ? `open-${projectId}` : "closed"}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription>
            Update descriptive fields. Capacity changes are separate.
          </DialogDescription>
        </DialogHeader>
        <form
          action={(formData) => {
            setError(null)
            setErrorField(null)
            startTransition(async () => {
              const raw = {
                projectId,
                name: String(formData.get("name") ?? ""),
                location: String(formData.get("location") ?? ""),
                status: String(formData.get("status") ?? "") as ProjectStatus,
                notes: String(formData.get("notes") ?? ""),
              }
              const res = await updateProject(raw)
              if (res.ok) {
                setOpen(false)
              } else {
                setError(res.error)
                setErrorField(res.field ?? null)
              }
            })
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              defaultValue={current.name}
              maxLength={120}
              required
            />
            {errorField === "name" && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              name="location"
              defaultValue={current.location}
              maxLength={200}
              required
            />
            {errorField === "location" && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select name="status" defaultValue={current.status}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={current.notes ?? ""}
              maxLength={2000}
              rows={3}
            />
            {errorField === "notes" && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
          {error && !errorField && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify**

```bash
npm run typecheck
npm run lint
```

Expected: both pass. If the import path for `updateProject` is wrong (Next.js relative path) adjust to `@/app/(authed)/projects/actions` style instead.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/edit-project-dialog.tsx"
git commit -m "feat(phase-10): EditProjectDialog component"
```

---

### Task 13: `ExpandCapacityDialog`

**Files:**
- Create: `app/(authed)/projects/[id]/expand-capacity-dialog.tsx`

- [ ] **Step 1: Write the dialog component**

Create `app/(authed)/projects/[id]/expand-capacity-dialog.tsx` with this content:

```tsx
"use client"

import { useMemo, useState, useTransition } from "react"
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
import { expandProjectCapacity } from "../../projects/actions"

type Props = {
  projectId: string
  current: {
    totalUnits: number
    totalParkings: number
    startingUnitNumber?: number
    unitsPerFloor?: number
    parkingPrefix?: string
  }
}

function previewApartments(
  current: number,
  add: number,
  start?: number,
  perFloor?: number
): string {
  if (add <= 0 || start === undefined || perFloor === undefined) return ""
  const baseFloor = Math.floor(start / 100)
  const basePosition = start % 100
  const first = (() => {
    const seq = current
    const floorOffset = Math.floor(seq / perFloor)
    const positionInFloor = seq % perFloor
    const floor = baseFloor + floorOffset
    return floor * 100 + basePosition + positionInFloor
  })()
  const last = (() => {
    const seq = current + add - 1
    const floorOffset = Math.floor(seq / perFloor)
    const positionInFloor = seq % perFloor
    const floor = baseFloor + floorOffset
    return floor * 100 + basePosition + positionInFloor
  })()
  return `${first}–${last}`
}

function previewParkings(
  current: number,
  add: number,
  prefix?: string
): string {
  if (add <= 0 || prefix === undefined) return ""
  const first = current + 1
  const last = current + add
  return `${prefix}${first}–${prefix}${last}`
}

export function ExpandCapacityDialog({ projectId, current }: Props) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [addUnits, setAddUnits] = useState("0")
  const [addParkings, setAddParkings] = useState("0")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const numUnits = Math.max(0, parseInt(addUnits, 10) || 0)
  const numParkings = Math.max(0, parseInt(addParkings, 10) || 0)
  const totalAdding = numUnits + numParkings

  const unitsPreview = useMemo(
    () =>
      previewApartments(
        current.totalUnits,
        numUnits,
        current.startingUnitNumber,
        current.unitsPerFloor
      ),
    [
      current.totalUnits,
      numUnits,
      current.startingUnitNumber,
      current.unitsPerFloor,
    ]
  )
  const parkingsPreview = useMemo(
    () => previewParkings(current.totalParkings, numParkings, current.parkingPrefix),
    [current.totalParkings, numParkings, current.parkingPrefix]
  )

  const handleClose = () => {
    setOpen(false)
    setConfirming(false)
    setAddUnits("0")
    setAddParkings("0")
    setError(null)
  }

  const handleSubmit = () => {
    setError(null)
    startTransition(async () => {
      const res = await expandProjectCapacity({
        projectId,
        additionalUnits: numUnits,
        additionalParkings: numParkings,
      })
      if (res.ok) {
        handleClose()
      } else {
        setError(res.error)
        setConfirming(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Add capacity
        </Button>
      </DialogTrigger>
      <DialogContent
        key={open ? `open-${projectId}` : "closed"}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Add capacity</DialogTitle>
          <DialogDescription>
            Add apartments or parkings to this project. Numbering continues from
            existing units. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {!confirming ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="addUnits">Additional apartments</Label>
              <Input
                id="addUnits"
                type="number"
                min={0}
                max={2000}
                value={addUnits}
                onChange={(e) => setAddUnits(e.target.value)}
              />
              {unitsPreview && (
                <p className="text-sm text-muted-foreground">
                  Will create apartments {unitsPreview}.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="addParkings">Additional parkings</Label>
              <Input
                id="addParkings"
                type="number"
                min={0}
                max={2000}
                value={addParkings}
                onChange={(e) => setAddParkings(e.target.value)}
              />
              {parkingsPreview && (
                <p className="text-sm text-muted-foreground">
                  Will create parkings {parkingsPreview}.
                </p>
              )}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <DialogFooter>
              <Button variant="ghost" onClick={handleClose} disabled={pending}>
                Cancel
              </Button>
              <Button
                onClick={() => setConfirming(true)}
                disabled={pending || totalAdding === 0}
              >
                Continue
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-medium">Confirm capacity expansion</p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                {numUnits > 0 && (
                  <li>
                    {numUnits} apartment{numUnits === 1 ? "" : "s"}
                    {unitsPreview && ` (${unitsPreview})`}
                  </li>
                )}
                {numParkings > 0 && (
                  <li>
                    {numParkings} parking{numParkings === 1 ? "" : "s"}
                    {parkingsPreview && ` (${parkingsPreview})`}
                  </li>
                )}
              </ul>
              <p className="mt-2">This cannot be undone.</p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setConfirming(false)}
                disabled={pending}
              >
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={pending}>
                {pending ? "Creating…" : "Confirm"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify**

```bash
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/expand-capacity-dialog.tsx"
git commit -m "feat(phase-10): ExpandCapacityDialog component"
```

---

### Task 14: `EditUnitDialog`

**Files:**
- Create: `app/(authed)/projects/[id]/inventory/edit-unit-dialog.tsx`

- [ ] **Step 1: Write the dialog component**

Create `app/(authed)/projects/[id]/inventory/edit-unit-dialog.tsx` with this content:

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
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { editUnit } from "./actions"

type Props = {
  unitId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  current: {
    number: string
    floor: number
    areaSqft: number
    salePrice: number
    notes?: string
    status: "available" | "sold"
  }
}

export function EditUnitDialog({
  unitId,
  open,
  onOpenChange,
  current,
}: Props) {
  const [error, setError] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const isSold = current.status === "sold"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        key={open ? `open-${unitId}` : "closed"}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Edit unit</DialogTitle>
          <DialogDescription>
            {isSold
              ? "This unit is sold. Sale-related fields are locked."
              : "Update unit fields."}
          </DialogDescription>
        </DialogHeader>
        <form
          action={(formData) => {
            setError(null)
            setErrorField(null)
            startTransition(async () => {
              const raw: Record<string, unknown> = {
                unitId,
                number: String(formData.get("number") ?? ""),
                floor: formData.get("floor"),
                areaSqft: formData.get("areaSqft"),
                notes: String(formData.get("notes") ?? ""),
              }
              if (!isSold) {
                raw.salePrice = formData.get("salePrice")
              }
              const res = await editUnit(raw)
              if (res.ok) {
                onOpenChange(false)
              } else {
                setError(res.error)
                setErrorField(res.field ?? null)
              }
            })
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="number">Number</Label>
            <Input
              id="number"
              name="number"
              defaultValue={current.number}
              maxLength={20}
              required
            />
            {errorField === "number" && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="floor">Floor</Label>
            <Input
              id="floor"
              name="floor"
              type="number"
              min={0}
              max={99}
              defaultValue={current.floor}
              required
            />
            {errorField === "floor" && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="areaSqft">Area (sqft)</Label>
            <Input
              id="areaSqft"
              name="areaSqft"
              type="number"
              min={1}
              max={100000}
              defaultValue={current.areaSqft}
              required
            />
            {errorField === "areaSqft" && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="salePrice">List price (₹)</Label>
            <Input
              id="salePrice"
              name="salePrice"
              type="number"
              min={0}
              max={1_000_000_000}
              defaultValue={current.salePrice}
              disabled={isSold}
            />
            {isSold && (
              <p className="text-sm text-muted-foreground">
                Sold units retain their list price.
              </p>
            )}
            {errorField === "salePrice" && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={current.notes ?? ""}
              maxLength={2000}
              rows={3}
            />
          </div>
          {error && !errorField && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify**

```bash
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/inventory/edit-unit-dialog.tsx"
git commit -m "feat(phase-10): EditUnitDialog component"
```

---

## Group H — Wire dialogs into pages

### Task 15: Wire Edit + Expand into the project detail page

**Files:**
- Modify: `app/(authed)/projects/[id]/page.tsx`

- [ ] **Step 1: Add imports**

Add at the top of the file:

```tsx
import { EditProjectDialog } from "./edit-project-dialog"
import { ExpandCapacityDialog } from "./expand-capacity-dialog"
```

- [ ] **Step 2: Render the two dialogs in the page header — admin-only**

Locate the project header section of the page (the area that displays project name, status, etc.). The user role is available via the existing `requireAuth()` call (it returns `{ id, role, ... }`).

Add this near the header, conditional on `user.role === "admin"`:

```tsx
{user.role === "admin" && (
  <div className="flex gap-2">
    <EditProjectDialog
      projectId={project._id.toHexString()}
      current={{
        name: project.name,
        location: project.location,
        status: project.status,
        notes: project.notes,
      }}
    />
    <ExpandCapacityDialog
      projectId={project._id.toHexString()}
      current={{
        totalUnits: project.totalUnits,
        totalParkings: project.totalParkings,
        startingUnitNumber: project.startingUnitNumber,
        unitsPerFloor: project.unitsPerFloor,
        parkingPrefix: project.parkingPrefix,
      }}
    />
  </div>
)}
```

The exact JSX placement depends on the existing header layout — fit it in next to existing header content (e.g. inside the same flex row). If `user` is named differently in this file (could be `session.user`), use that name.

- [ ] **Step 3: Verify**

```bash
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 4: Smoke-test in the dev app**

```bash
npm run dev
```

As admin, navigate to a project detail page. Verify the two buttons appear in the header. Open Edit project, change the name, save — the page reloads with the new name. Open Add capacity, add 2 apartments, confirm — the inventory table now has 2 more units with continuation numbering.

As FM (sign in with non-admin account), navigate to the same page — buttons should not render.

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add "app/(authed)/projects/[id]/page.tsx"
git commit -m "feat(phase-10): wire Edit + Expand dialogs into project header"
```

---

### Task 16: Wire Edit into the inventory unit row

**Files:**
- Modify: `app/(authed)/projects/[id]/inventory/unit-row.tsx`

- [ ] **Step 1: Read the current unit-row component**

```bash
sed -n '1,200p' "app/(authed)/projects/[id]/inventory/unit-row.tsx"
```

Observe: this is a client component that renders a `<tr>` with a row click handler (Phase 9 drilldown), an actions cell containing `MarkSoldButton` / `UnmarkButton`, etc.

- [ ] **Step 2: Add imports**

Add at the top of the file (next to existing imports):

```tsx
import { useState } from "react"
import { EditUnitDialog } from "./edit-unit-dialog"
import { Button } from "@/components/ui/button"
```

Also extend the props to accept the `role`:

```tsx
type Props = {
  // ... existing props ...
  role: "admin" | "floor_manager"
}
```

(Match the prop-destructuring pattern already in place.)

- [ ] **Step 3: Add Edit button to the actions cell (admin-only)**

Inside the actions `<td>`, alongside the existing `MarkSoldButton` / `UnmarkButton`, add:

```tsx
const [editOpen, setEditOpen] = useState(false)

// ... in the actions <td>, wrapping the existing buttons in a Fragment ...
{role === "admin" && (
  <>
    <Button
      size="sm"
      variant="ghost"
      onClick={(e) => {
        e.stopPropagation()
        setEditOpen(true)
      }}
    >
      Edit
    </Button>
    <EditUnitDialog
      unitId={unit._id.toHexString()}
      open={editOpen}
      onOpenChange={setEditOpen}
      current={{
        number: unit.number,
        floor: unit.floor,
        areaSqft: unit.areaSqft,
        salePrice: unit.salePrice,
        notes: unit.notes,
        status: unit.status,
      }}
    />
  </>
)}
```

The `e.stopPropagation()` is critical — without it, the row click triggers the drilldown instead.

- [ ] **Step 4: Update the caller (inventory-table.tsx) to pass `role`**

Open `app/(authed)/projects/[id]/inventory/inventory-table.tsx`. The component renders `<UnitRow>` for each unit. Pass the existing `role` (which is already a prop on the table per Phase 9) down:

```tsx
<UnitRow {...} role={role} />
```

If `role` isn't a prop on `<InventoryTable>` today, add it — and trace upward through the project-detail page to pass it down from the already-resolved `user.role`.

- [ ] **Step 5: Verify**

```bash
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 6: Smoke-test**

```bash
npm run dev
```

As admin: open inventory, see Edit button on each row, edit a unit's number/area, save. Page reloads with new values. As FM: Edit button doesn't appear.

Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add "app/(authed)/projects/[id]/inventory/unit-row.tsx" "app/(authed)/projects/[id]/inventory/inventory-table.tsx"
git commit -m "feat(phase-10): wire EditUnitDialog into inventory unit row"
```

---

## Group I — Inline "Last updated by" surfaces

### Task 17: Inline meta lines + drilldown sheet rendering

**Files:**
- Create: `app/(authed)/catalog/material-meta-line.tsx`
- Modify: `app/(authed)/catalog/page.tsx` (or whichever material-row component exists)
- Modify: `app/(authed)/projects/[id]/page.tsx`
- Modify: `app/(authed)/components/drilldown-sheet.tsx`

- [ ] **Step 1: Write the shared meta-line component**

Create `app/(authed)/catalog/material-meta-line.tsx`:

```tsx
type Props = {
  actorName: string
  at: Date
}

function formatDate(d: Date): string {
  // LOCAL components — never toISOString (UTC drift). Convention from Phase 8.
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

export function LastUpdatedLine({ actorName, at }: Props) {
  return (
    <p className="text-xs text-muted-foreground">
      Last updated by {actorName} • {formatDate(at)}
    </p>
  )
}
```

- [ ] **Step 2: Use the meta-line on the catalog page**

Open `app/(authed)/catalog/page.tsx` (or the row component it uses to render each material). For each material that has `lastUpdatedBy` populated, fetch the actor's name (bulk-style if many rows — `Promise.all` an array of user lookups, or use the existing audit denormalize pattern as a reference) and render `<LastUpdatedLine actorName={...} at={material.lastUpdatedAt} />` underneath the material's name.

Concretely, in `app/(authed)/catalog/page.tsx`, before mapping materials into rows, gather user names:

```ts
const updaterIds = [
  ...new Set(
    materials
      .map((m) => m.lastUpdatedBy?.toHexString())
      .filter((x): x is string => !!x)
  ),
].map((s) => new ObjectId(s))

const updaters = updaterIds.length > 0
  ? await getDb()
      .collection<{ _id: ObjectId; name?: string; email?: string }>("users")
      .find({ _id: { $in: updaterIds } }, { projection: { name: 1, email: 1 } })
      .toArray()
  : []
const updaterById = new Map(
  updaters.map((u) => [u._id.toHexString(), u.name ?? u.email ?? "(unknown)"])
)
```

Then, in the row render:

```tsx
{m.lastUpdatedBy && m.lastUpdatedAt && (
  <LastUpdatedLine
    actorName={updaterById.get(m.lastUpdatedBy.toHexString()) ?? "(unknown)"}
    at={m.lastUpdatedAt}
  />
)}
```

(Adapt to whatever the file already uses for material rendering — server component returning JSX directly, or a per-row sub-component.)

- [ ] **Step 3: Use the meta-line on the project detail page header**

In `app/(authed)/projects/[id]/page.tsx`, near the project header, after fetching the project, look up the updater name if `lastUpdatedBy` is set:

```ts
let updaterName: string | null = null
if (project.lastUpdatedBy) {
  const u = await getDb()
    .collection<{ _id: ObjectId; name?: string; email?: string }>("users")
    .findOne(
      { _id: project.lastUpdatedBy },
      { projection: { name: 1, email: 1 } }
    )
  updaterName = u?.name ?? u?.email ?? "(unknown)"
}
```

Then in the header JSX:

```tsx
{updaterName && project.lastUpdatedAt && (
  <LastUpdatedLine actorName={updaterName} at={project.lastUpdatedAt} />
)}
```

- [ ] **Step 4: Surface in drilldown sheet (UnitDrilldown variant)**

Open `app/(authed)/components/drilldown-sheet.tsx`. Add the import:

```tsx
import { LastUpdatedLine } from "../catalog/material-meta-line"
```

Find the body for the `unit` variant of `DrilldownDetail`. After the existing fields render, add:

```tsx
{detail.lastUpdatedBy && (
  <LastUpdatedLine
    actorName={detail.lastUpdatedBy.actorName}
    at={detail.lastUpdatedBy.at}
  />
)}
```

(If the drilldown variant rendering is in a dedicated sub-component for unit details, place it there instead. Match local styling conventions.)

- [ ] **Step 5: Verify**

```bash
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add "app/(authed)/catalog/material-meta-line.tsx" "app/(authed)/catalog/page.tsx" "app/(authed)/projects/[id]/page.tsx" "app/(authed)/components/drilldown-sheet.tsx"
git commit -m "feat(phase-10): inline 'Last updated by' on catalog, project header, drilldown"
```

---

## Group J — Final verification

### Task 18: Full verification + manual T-tasks

- [ ] **Step 1: Full typecheck and lint**

```bash
npm run typecheck
npm run lint
```

Both must pass.

- [ ] **Step 2: Production build smoke**

```bash
npm run build
```

Must succeed.

- [ ] **Step 3: Run the dev app and walk the T-tasks**

```bash
npm run dev
```

**Migration**
- [ ] **T-meta-1:** Already verified during Task 4 (dev DB pre-existing projects gained numbering fields). Re-confirm with one fresh check (open Mongo shell or compass; pick any pre-Phase-10 project; confirm the three fields are present).
- [ ] **T-meta-2:** Create a synthetic project with 0 apartments (manually delete its units in Mongo, then re-run the migration script). Verify the script keeps defaults `101/4` without crashing.

**`updateProject`**
- [ ] **T-edit-1:** As admin, edit a project's name + status via Edit Project dialog. Visit `/audit`, filter by action=Updated. One row appears: `"Updated project: <new name>"`, actor is you, time is now.
- [ ] **T-edit-2:** As FM (different account), open the project detail page — Edit project / Add capacity buttons are not rendered. Attempt to invoke `updateProject` via DevTools console (`fetch` to the action endpoint) — verify the action returns/redirects via `requireAdmin`. Same for `editUnit` and `expandProjectCapacity`.

**`editUnit`**
- [ ] **T-edit-3:** As admin, on inventory page, edit a unit's number to one that already exists in the project — error returned, no mutation occurred (verify the displayed number is unchanged after the dialog closes/reopens).
- [ ] **T-edit-4:** As admin, try to edit `salePrice` on a sold unit — field is disabled in the UI. Now manually call the action with `salePrice` set on a sold unit (DevTools console): action returns the field error.
- [ ] **T-edit-5:** As admin, edit `notes` on a sold unit — succeeds. Audit log shows `updated`.

**`expandProjectCapacity`**
- [ ] **T-expand-1:** Pick a project with `totalUnits=12`, `totalParkings=10`. As admin, Add capacity dialog → +4 apartments, +2 parkings → Continue → Confirm. Verify: inventory table now shows 16 apartments and 12 parkings; the new ones have continuation numbering (e.g. 305–308, P11–P12 depending on the project's params); the audit log shows 1 project `updated` event + 6 unit `created` events.
- [ ] **T-expand-2:** Add capacity dialog with both counts 0 → Continue button is disabled.
- [ ] **T-expand-3:** Mid-transaction failure: not easily reproducible from the UI. Inject an error by editing `expandProjectCapacity` temporarily to throw after `insertMany`, run once, confirm by counting units in Mongo: no new units were committed. Revert the injected error and re-verify normal flow.
- [ ] **T-expand-4:** Create a project (Task 5's flow ensures new projects have numbering params). Then DELETE the three numbering fields in Mongo for that project. Try to expand it via the dialog → operator error message about migration. Re-add the fields and verify expand works.

**Audit**
- [ ] **T-audit-1:** Filter `/audit` by action=Updated + project scope. Shows only that project's updated events (project itself + units in scope, plus materials globally if not project-scoped).
- [ ] **T-audit-2:** A pre-Phase-10 project that has not been edited still shows only its `created` event in `/audit`.
- [ ] **T-audit-3:** Edit the same project twice in quick succession (10am, 10:05am simulated by your own edits). The audit log shows ONE `updated` event reflecting the most recent edit. This confirms the documented single-most-recent-edit limitation.

**Drilldown**
- [ ] **T-history-1:** Edit a unit. Open its drilldown sheet → History tab. Verify the unit shows `created` + `updated` events in chronological order.

**Retrofit**
- [ ] **T-retrofit-1:** Edit a material via the existing catalog Edit dialog. Visit `/audit`, filter by action=Updated, entityType=Material — one row appears.

**Inline meta lines**
- [ ] **T-meta-3:** On a catalog row, after edit, `"Last updated by <you> • <date>"` appears under the material name.
- [ ] **T-meta-4:** On the project detail page header, after edit, the same line appears next to project info.
- [ ] **T-meta-5:** Drilldown sheet on an edited unit: "Last updated by …" appears in the Details tab.

- [ ] **Step 4: Final commit (if any cosmetic fixes were needed during T-tasks)**

If any of the T-tasks required small fixes, commit them now:

```bash
git status
git add <files>
git commit -m "fix(phase-10): <description>"
```

Otherwise skip.

- [ ] **Step 5: Phase complete — handoff**

Phase 10 is shippable. Open `superpowers:finishing-a-development-branch` to decide on merge / PR / next steps.

---

## Self-review notes

**Spec coverage check:**
- Schema fields → Task 1 ✓
- `withUpdateMeta` helper → Task 2 ✓
- Migration → Task 4 ✓
- `createProject` persists numbering → Task 5 ✓
- `updateMaterial` retrofit → Task 3 ✓
- `updateProject` → Task 6 ✓
- `editUnit` → Task 7 ✓
- `expandProjectCapacity` → Task 8 ✓
- Audit fetchers + `listEntityHistory` → Tasks 9–10 ✓
- Audit UI (filter + badge) → Task 10 ✓
- Drilldown action → Task 11 ✓
- Three dialogs → Tasks 12–14 ✓
- Wire into pages → Tasks 15–16 ✓
- Inline meta lines → Task 17 ✓
- T-tasks → Task 18 ✓
- "Last updated by" on drilldown sheet → Task 17 ✓ (covered alongside catalog/header)

**Type consistency:**
- `withUpdateMeta(set, userId)` signature: used identically in Tasks 3, 6, 7, 8.
- `ActionResult<void>` return shape: used identically across Tasks 6, 7, 8.
- `LastUpdatedLine` import path: defined in Task 17, used in Tasks 17.
- `EditProjectDialog`, `ExpandCapacityDialog`, `EditUnitDialog` prop shapes match Tasks 15–16's wiring.
- `lastUpdatedBy` on Unit drilldown: schema defined in Task 1 Step 5, populated in Task 11, rendered in Task 17 Step 4.

**Known approximations (callouts in plan):**
- Task 5 references the existing `createProject` insertOne object structure without showing the full current code — engineer must read the file. This is intentional — the action exists already and its exact local-variable names may differ from the plan.
- Task 8's apartment-numbering formula must be cross-checked against the existing `createProject` formula. Plan flags this explicitly.
- Task 10 audit-filter and audit-table JSX is approximated — engineer matches the file's existing pattern.
- Task 16's `<UnitRow>` prop changes propagate to `<InventoryTable>` and possibly higher — engineer follows the chain.

These approximations are unavoidable because they describe edits to specific lines whose surrounding code shape the engineer must inspect. All other code (new files, schema additions, helper) is fully spelled out.
