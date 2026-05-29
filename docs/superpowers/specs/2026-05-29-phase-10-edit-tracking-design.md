# Phase 10 — Edit Tracking + Project/Unit Edit Features (design)

**Date:** 2026-05-29
**Status:** Brainstormed and approved. Ready for implementation plan.
**Supersedes:** `2026-05-17-phase-10-edit-tracking-skeleton.md`
**Depends on:** Phases 1–9 merged to local master (HEAD `238c7d3`).

## Goal

Two interlocking capabilities:

1. **Edit tracking.** Add `lastUpdatedBy` + `lastUpdatedAt` to projects, units, and the materials catalog. Extend the audit log with an `updated` action so edits to these entities are no longer anonymous.
2. **Edit features.** Build the missing `updateProject` and `editUnit` server actions (the existing `updateMaterial` is the only entity-level update in the codebase today). Add an `expandProjectCapacity` action so admins can grow a project's unit/parking count after creation, with auto-generated continuation numbering.

These ship together because tracking with nothing to track is a no-op, and edit features without tracking would re-create the gap Phase 7 left open.

## Non-goals

- A full event-sourced audit collection. Continues Phase 7's read-from-existing-fields pattern. The `lastUpdatedAt` field is overwritten on each edit; **only the most-recent edit is visible in the audit log**, by deliberate design (see Limitations).
- Backfill of historical edits. Pre-Phase-10 docs have no `lastUpdatedBy`; they will only show their `created` event in audit forever (until the first post-Phase-10 edit).
- Field-level diff tracking (`"price changed from ₹50L to ₹55L"`). Audit summaries stay generic.
- Edit history on append-only entities (transactions, materialMovements). Corrections continue to go through reverse/void.
- Decreasing `totalUnits` / `totalParkings`. Would orphan units and possibly transactions. Out of scope, may not ever be in scope.
- DB-level unique compound index `{ projectId, number }` on units. The application-level pre-write check is sufficient at the current scale and edit volume; can be added later if races become real.
- FM-accessible edit actions. All three new actions are admin-only.

## Locked-in design decisions

1. **Scope is "Track-and-add-edit-features" (Option B from brainstorm).** Adding `lastUpdatedBy` to entities is paired with building the missing edit actions in the same phase.
2. **`updateProject` editable fields:** `name`, `location`, `status`, `notes`. Plus a separate `expandProjectCapacity` action for increasing `totalUnits` / `totalParkings`. Combining these into one form was rejected — they have different blast radius.
3. **Numbering continuation for capacity expansion:** A one-time migration backfills `startingUnitNumber`, `unitsPerFloor`, `parkingPrefix` onto existing Project docs. `createProject` is updated to persist these going forward. The expand form then only needs to ask "how many more?"
4. **`editUnit` editable fields:** `number`, `floor`, `areaSqft`, `salePrice`, `notes`. `salePrice` is blocked on sold units (status === "sold"); other fields remain editable post-sale (legitimate fix-typo use case).
5. **Audit event semantics:** Every save emits one `updated` event regardless of which fields changed. Simplest rule; tolerates no-op saves as marginal log noise.
6. **Role gate:** All three actions (`updateProject`, `expandProjectCapacity`, `editUnit`) and the existing `updateMaterial` require admin. Matches existing catalog pattern.
7. **Pre-Phase-10 doc behavior:** No backfill of `lastUpdatedBy`. Audit fetchers conditionally emit `updated` events only when both `lastUpdatedBy` and `lastUpdatedAt` are present. Pre-existing docs stay quiet.
8. **Audit summary content:** Generic — `"Updated project: <name>"`, `"Updated <type>: <number>"`, `"Updated material in catalog: <name>"`. No field-level diff in summary.
9. **Atomicity enforcement:** Tiny shared helper `withUpdateMeta(set, userId)` at `lib/audit/update-meta.ts`. Used by every entity-level update action. Makes the rule grep-able and protects against future drift when a 4th edit action gets added.

## Schema changes

### `lib/projects/schemas.ts`

Add to `Project` type:

```ts
lastUpdatedBy?: ObjectId
lastUpdatedAt?: Date

// Now persisted (moved from CreateProjectInput-only → stored on the doc)
startingUnitNumber: number
unitsPerFloor: number
parkingPrefix: string
```

Add to `Unit` type:

```ts
lastUpdatedBy?: ObjectId
lastUpdatedAt?: Date
```

New input schemas:

```ts
export const UpdateProjectInputSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  location: z.string().trim().min(1).max(200).optional(),
  status: ProjectStatusSchema.optional(),
  notes: z.string().max(2000).optional(),
})

export const ExpandProjectCapacityInputSchema = z
  .object({
    projectId: z.string().min(1),
    additionalUnits: z.coerce.number().int().min(0).max(2000).default(0),
    additionalParkings: z.coerce.number().int().min(0).max(2000).default(0),
  })
  .refine((v) => v.additionalUnits + v.additionalParkings > 0, {
    message: "Specify at least one count to add",
  })

export const EditUnitInputSchema = z.object({
  unitId: z.string().min(1),
  number: z.string().trim().min(1).max(20).optional(),
  floor: z.coerce.number().int().min(0).max(99).optional(),
  areaSqft: z.coerce.number().positive().max(100_000).optional(),
  salePrice: z.coerce.number().min(0).max(1_000_000_000).optional(),
  notes: z.string().max(2000).optional(),
})
```

### `lib/materials/schemas.ts`

Add to `Material` type:

```ts
lastUpdatedBy?: ObjectId
lastUpdatedAt?: Date
```

### `lib/audit/schemas.ts`

```ts
export const AuditActionSchema = z.enum(["created", "voided", "reversed", "updated"])
```

### `lib/drilldown/schemas.ts`

`UnitDrilldown` variant gains:

```ts
lastUpdatedBy: { actorName: string; at: Date } | null
```

## One-time migration

**File:** `scripts/migrate-phase-10.mjs`

Idempotent (selects on `{ startingUnitNumber: { $exists: false } }`). Re-runnable.

For each existing Project missing the numbering fields:

1. Read its apartment units. Min `number` parsed as int → `startingUnitNumber`. Sequential consecutive numbers within a single floor → `unitsPerFloor`. If 0 apartments, default `startingUnitNumber=101`, `unitsPerFloor=4`.
2. Read its parking units. Non-digit prefix of the first parking's `number` → `parkingPrefix`. If 0 parkings, default `"P"`.
3. `$set` the three fields in one update per project.

`lastUpdatedBy` / `lastUpdatedAt` are **not** backfilled (Decision 7). Pre-Phase-10 docs stay clean.

**Failure mode:** any project whose units violate the assumed numbering pattern is logged and skipped. Operator hand-fixes and re-runs.

**Run model:** `node --env-file-if-exists=.env scripts/migrate-phase-10.mjs`. Print "Migrated N projects" on completion.

**No new indexes required.**

## New server actions

### `updateProject` — `app/(authed)/projects/actions.ts`

- `requireAdmin()` as first executable line.
- Build `$set` from only present fields (don't clobber unrelated fields).
- Apply via `withUpdateMeta($set, userId)` → single `findOneAndUpdate`.
- No transaction needed (single doc).
- `revalidatePath` for `/projects/[id]`, `/projects`, `/audit`.
- Returns `ActionResult<void>`.

### `expandProjectCapacity` — `app/(authed)/projects/actions.ts`

- `requireAdmin()` as first executable line.
- Open Mongo session + `withTransaction`.
- Read project. Hard-error if any of `startingUnitNumber` / `unitsPerFloor` / `parkingPrefix` is missing (signals the migration was not run; operator-facing error message).
- Compute new unit numbers continuing from `currentTotalUnits` using the stored numbering params and the same XYZ floor-position formula as `createProject`. Same for parkings.
- `insertMany` the new unit docs. Each carries `createdBy = current user`, `createdAt = now`.
- `findOneAndUpdate` the project: `$inc: { totalUnits, totalParkings }` plus `withUpdateMeta($set, userId)`.
- All within one transaction; both reads use `{ session }`.
- New units each get their own `created` audit event (free, via `fetchUnitEvents`). The project gets one `updated` event (free, via `fetchProjectEvents` once it reads `lastUpdatedAt`).
- `revalidatePath` for `/projects/[id]`, `/audit`.
- Returns `ActionResult<void>`.

### `editUnit` — `app/(authed)/projects/[id]/inventory/actions.ts`

- `requireAdmin()` as first executable line.
- Read the unit.
- If `salePrice` is in input AND `unit.status === "sold"`: return `{ ok: false, error: "Cannot change list price of a sold unit", field: "salePrice" }`.
- If `number` is in input: pre-write collision check `findOne({ projectId, number, _id: { $ne: unitId } })`. If hit, return field error. Race-acceptable at this scale.
- Build `$set` from present fields.
- Apply via `withUpdateMeta($set, userId)` → single `findOneAndUpdate`.
- No transaction needed.
- `revalidatePath` for `/projects/[id]`, `/projects/[id]/inventory`, `/audit`. (Not `/financials` — list price isn't shown there; `soldPriceTotal` is.)
- Returns `ActionResult<void>`.

### `createProject` — modified

Persist `startingUnitNumber`, `unitsPerFloor`, `parkingPrefix` on the inserted Project doc. Currently consumed-and-discarded at create time.

### `updateMaterial` — retrofit

In `app/(authed)/catalog/actions.ts`: replace the inline `$set: { name, unit, ... }` with `$set: withUpdateMeta({ name, unit, ... }, userId)`. Add `revalidatePath("/audit")` (not currently called).

## `withUpdateMeta` helper

**File:** `lib/audit/update-meta.ts`

```ts
import { ObjectId } from "mongodb"

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

- Sets `updatedAt` in addition to `lastUpdatedAt` (existing convention; every entity has `updatedAt`).
- Caller passes `userId` as a string (from `(await requireAuth()).id`). Matches the `createdBy` pattern.
- Lives under `lib/audit/` because the contract it enforces is audit-shaped.

## Audit extensions

### Fetchers — `lib/audit/repository.ts`

`fetchProjectEvents`, `fetchUnitEvents`, `fetchMaterialEvents` each:

- Change base query from `{ createdAt: { $gte, $lte } }` to:
  ```ts
  { $or: [
      { createdAt: { $gte, $lte } },
      { lastUpdatedAt: { $gte, $lte } },
  ]}
  ```
- The row-to-events loop emits a `created` event if `createdAt` is in range, AND independently an `updated` event if `lastUpdatedBy && lastUpdatedAt && inRange(lastUpdatedAt)`. The `&& lastUpdatedBy` guard makes Decision 7 natural.

**Summary content:**
- `"Updated project: ${name}"`
- `"Updated ${type}: ${number}"` (e.g. "Updated apartment: 304")
- `"Updated material in catalog: ${name}"`

**Synthetic event id format:** `${entityType}:${entityId}:updated`. Parallel to `created` / `voided` / `reversed`.

### `listEntityHistory` — same three branches

Each project/unit/material branch in `listEntityHistory` extends its current single-`created`-event emission to also emit an `updated` event when the fields are present. Drilldown sheet's History tab picks it up automatically — no UI change there.

### UI

- `app/(authed)/audit/audit-filters.tsx` — add `<option value="updated">Updated</option>` to the Action select.
- `app/(authed)/audit/audit-table.tsx` — add a badge variant for `"updated"` (e.g. amber tone, distinct from existing colors). One-line addition to the badge switch.

## UI surfaces — new dialogs

All dialogs follow Phase 7's `<Dialog key={open ? \`open-${id}\` : "closed"}>` state-reset pattern.

### `app/(authed)/projects/[id]/edit-project-dialog.tsx`
- Trigger: "Edit project" button on the project detail page header (admin-only conditional render).
- Fields: name, location, status (select), notes. Pre-filled from current values.

### `app/(authed)/projects/[id]/expand-capacity-dialog.tsx`
- Trigger: separate "Add capacity" button on project detail page header (admin-only).
- Fields: `additionalUnits` (number), `additionalParkings` (number) — both default 0.
- Live preview text computed client-side from current totals + stored numbering params: "This will create apartments 305–308 and parkings P15–P18."
- Two-step confirmation: client-side modal "Confirm: this creates N units and cannot be undone." before submit. Cascading writes warrant the extra click.

### `app/(authed)/projects/[id]/inventory/edit-unit-dialog.tsx`
- Trigger: "Edit" entry in the per-row actions menu in the inventory table (admin-only render).
- Fields: number, floor, areaSqft, salePrice, notes.
- `salePrice` input is disabled with helper text "Sold units retain their list price" when the unit is sold.

### Edit Material — retrofit only
- Existing catalog "Edit" button. No new dialog file. Action body changes to use `withUpdateMeta`.

### Inline "Last updated by" lines
- Catalog row, project detail page header, unit drilldown sheet — each shows a small "Last updated by X • <date>" line if `lastUpdatedBy` is populated. Hidden otherwise.

## Limitations (deliberate, documented)

1. **Single-most-recent edit only.** Because `lastUpdatedAt` is a single field overwritten on each save, the audit log shows ONE `updated` event per entity, reflecting the latest edit. If admin A edits at 10am and admin B edits at 11am, only B's edit appears in audit. This is the natural consequence of staying on Phase 7's read-from-fields pattern. If a future phase requires per-edit history, that requires an event-sourced audit collection — explicit non-goal of Phase 10.

2. **Race on unit number uniqueness.** `editUnit`'s pre-write collision check is not atomic with the update. Two simultaneous edits could both pass the check. Acceptable at current admin-only, low-volume edit cadence. A unique compound index `{ projectId: 1, number: 1 }` would harden this; deferred.

3. **`expandProjectCapacity` hard-errors if migration wasn't run.** Operator-visible error, not a silent failure. Intentional safety.

4. **No decrease path on capacity.** Reducing totalUnits would orphan units and possibly attached transactions. Out of scope.

5. **Pre-Phase-10 docs stay anonymous.** No backfill of `lastUpdatedBy`. Operator must accept that edits before the migration are not attributable.

## Verification (manual T-tasks)

**Migration**
- **T-meta-1:** Run on dev DB with pre-Phase-10 fixtures. All projects gain numbering fields. Re-run is no-op (count unchanged).
- **T-meta-2:** Migration on a project with 0 apartments. Defaults applied (`101 / 4`). No crash.

**`updateProject`**
- **T-edit-1:** Admin edits a project's name + status. Audit log shows one `"Updated project: <new name>"` event with correct actor + time.
- **T-edit-2:** FM attempts `updateProject` directly. `requireAdmin` blocks. Same for `editUnit`, `expandProjectCapacity`.

**`editUnit`**
- **T-edit-3:** Admin edits a unit's `number` to collide with existing — field error returned, no mutation.
- **T-edit-4:** Admin attempts to edit `salePrice` on a sold unit — disabled in UI; if bypassed, action returns field error.
- **T-edit-5:** Edit `notes` on a sold unit — works. Audit shows `updated`.

**`expandProjectCapacity`**
- **T-expand-1:** Expand a project by 4 apartments + 2 parkings. Verify: 4 new unit docs with continuation numbering, 2 new parking docs, project totals `$inc`'d, audit log shows 1 project `updated` + 6 unit `created` events.
- **T-expand-2:** Expand with both counts 0. Form blocks.
- **T-expand-3:** Mid-transaction failure simulation. No partial state.
- **T-expand-4:** Expand on a project where migration was skipped. Operator-facing error, no writes.

**Audit**
- **T-audit-1:** Filter by action=Updated + project scope. Shows all and only that project's updated events.
- **T-audit-2:** Pre-Phase-10 project that was never edited still shows only its `created` event.
- **T-audit-3:** Edit same project twice (10am, 11am). Audit log shows one `updated` event reflecting 11am — verify single-most-recent limitation matches documented behavior.

**Drilldown**
- **T-history-1:** Open drilldown on an edited unit. History tab shows created + updated rows in chronological order.

**Retrofit**
- **T-retrofit-1:** Edit a material via existing catalog dialog. Audit log now shows `updated` event (was anonymous before Phase 10).

## File inventory

**New (5):**
- `scripts/migrate-phase-10.mjs`
- `lib/audit/update-meta.ts`
- `app/(authed)/projects/[id]/edit-project-dialog.tsx`
- `app/(authed)/projects/[id]/expand-capacity-dialog.tsx`
- `app/(authed)/projects/[id]/inventory/edit-unit-dialog.tsx`

**Modified (~13):**
- `lib/projects/schemas.ts` — Project + Unit field additions; new persistent numbering fields; new input schemas
- `lib/materials/schemas.ts` — Material field additions
- `lib/drilldown/schemas.ts` — UnitDrilldown lastUpdatedBy
- `lib/drilldown/actions.ts` — populate UnitDrilldown.lastUpdatedBy
- `lib/audit/schemas.ts` — `"updated"` in AuditAction enum
- `lib/audit/repository.ts` — extend 3 fetchers + 3 `listEntityHistory` branches
- `app/(authed)/projects/actions.ts` — `createProject` persists numbering fields; new `updateProject`, `expandProjectCapacity`
- `app/(authed)/projects/[id]/inventory/actions.ts` — new `editUnit`
- `app/(authed)/catalog/actions.ts` — `updateMaterial` calls `withUpdateMeta`; add `revalidatePath("/audit")`
- `app/(authed)/projects/[id]/page.tsx` — Edit + Expand buttons (admin-only)
- `app/(authed)/projects/[id]/inventory/unit-row.tsx` — Edit entry in actions menu (admin-only)
- `app/(authed)/catalog/page.tsx` (or material-row component) — "Last updated by" inline line + use existing edit dialog as-is
- `app/(authed)/audit/audit-filters.tsx` — Updated option
- `app/(authed)/audit/audit-table.tsx` — Updated badge variant

**Total: 5 new + ~13 modified ≈ 18 files.**

## Open items intentionally deferred

- Project-level drilldown sheet (would surface project edit history nicely; not in this phase).
- Material-level drilldown sheet (same).
- Unique compound index `{ projectId, number }` on units.
- Event-sourced audit collection (would lift the single-most-recent limitation).
- Decrease-capacity path on `expandProjectCapacity`.
