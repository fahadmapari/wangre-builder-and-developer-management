# Joint Venture Project & Units — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `isJointVenture` flag to projects and `isJointVentureUnit` flag to apartments, excluding JV unit sales from the project P&L while keeping them fully trackable.

**Architecture:** Two new optional booleans threaded through schemas → repository → server actions → UI. `getProjectFunds` is updated to subtract JV unit revenue from `availableFunds`. A new `getProjectJVStats` repository function provides unit counts for a dedicated summary card on the project detail page.

**Tech Stack:** Next.js 15 App Router, MongoDB (native driver), Zod, React 19, Shadcn/ui, TypeScript.

---

## File Map

| File | Change |
|------|--------|
| `lib/projects/schemas.ts` | Add `isJointVenture` to `Project` + Zod schemas; add `isJointVentureUnit` to `Unit` + Zod schema |
| `lib/projects/repository.ts` | Add `jvRevenue` to `ProjectFunds`; update `getProjectFunds`; update `createProjectWithUnits`; add `getProjectJVStats` |
| `app/(authed)/projects/actions.ts` | Pass `isJointVenture` through `createProject` and `updateProject` |
| `app/(authed)/projects/[id]/inventory/actions.ts` | Pass `isJointVentureUnit` through `editUnit` |
| `app/(authed)/projects/new-project-dialog.tsx` | Add `isJointVenture` checkbox |
| `app/(authed)/projects/[id]/edit-project-dialog.tsx` | Add `isJointVenture` toggle |
| `app/(authed)/projects/[id]/inventory/edit-unit-dialog.tsx` | Add `isJointVentureProject` prop and conditional JV checkbox |
| `app/(authed)/projects/[id]/inventory/unit-row.tsx` | Add `isJointVentureUnit` to unit shape; show "JV" badge; thread `isJointVentureProject` to `EditUnitDialog` |
| `app/(authed)/projects/[id]/inventory/inventory-table.tsx` | Add `isJointVentureProject` prop; thread to `UnitRow` |
| `app/(authed)/projects/[id]/page.tsx` | Call `getProjectJVStats`; pass `isJointVentureProject` to `InventoryTable`; update `EditProjectDialog`; render JV summary card |

---

## Task 1: Update schemas

**Files:**
- Modify: `lib/projects/schemas.ts`

- [ ] **Step 1: Add `isJointVenture` to `CreateProjectInputSchema`**

In `lib/projects/schemas.ts`, add the field after the `parkingPrefix` field inside `CreateProjectInputSchema`:

```ts
    isJointVenture: z.boolean().default(false),
```

So the `.object({...})` call gains this field before the `.refine(...)` call.

- [ ] **Step 2: Add `isJointVenture` to the `Project` type**

After `parkingPrefix?: string`:

```ts
  isJointVenture?: boolean
```

- [ ] **Step 3: Add `isJointVenture` to `UpdateProjectInputSchema`**

In `UpdateProjectInputSchema` add after `notes`:

```ts
  isJointVenture: z.boolean().optional(),
```

- [ ] **Step 4: Add `isJointVentureUnit` to the `Unit` type**

After `notes?: string` in the `Unit` type:

```ts
  isJointVentureUnit?: boolean
```

- [ ] **Step 5: Add `isJointVentureUnit` to `EditUnitInputSchema`**

After `notes` in `EditUnitInputSchema`:

```ts
  isJointVentureUnit: z.boolean().optional(),
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add lib/projects/schemas.ts
git commit -m "feat(jv): add isJointVenture + isJointVentureUnit to schemas"
```

---

## Task 2: Update repository

**Files:**
- Modify: `lib/projects/repository.ts`

- [ ] **Step 1: Update `ProjectFunds` type**

Replace the existing `ProjectFunds` type:

```ts
export type ProjectFunds = {
  totalCapital: number
  totalRevenue: number    // gross income (all non-voided income transactions)
  totalSpent: number
  availableFunds: number  // capital + (revenue - jvRevenue) - spent
  jvRevenue: number       // JV unit sale revenue excluded from availableFunds
}
```

- [ ] **Step 2: Update `getProjectFunds` to subtract JV revenue**

Replace the entire `getProjectFunds` function:

```ts
export async function getProjectFunds(projectId: ObjectId): Promise<ProjectFunds> {
  const db = getDb()
  const [capitalResult, revenueResult, spentResult, jvRevenueResult] = await Promise.all([
    db
      .collection<CapitalInjection>("capitalInjections")
      .aggregate<{ total: number }>([
        { $match: { projectId } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray(),
    db
      .collection("transactions")
      .aggregate<{ total: number }>([
        { $match: { projectId, kind: "income", voided: { $ne: true } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray(),
    db
      .collection("transactions")
      .aggregate<{ total: number }>([
        { $match: { projectId, kind: "expense", voided: { $ne: true } } },
        {
          $group: {
            _id: null,
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
      ])
      .toArray(),
    db
      .collection<Unit>("units")
      .aggregate<{ total: number }>([
        {
          $match: {
            projectId,
            isJointVentureUnit: true,
            type: "apartment",
            status: "sold",
          },
        },
        { $group: { _id: null, total: { $sum: "$soldPriceTotal" } } },
      ])
      .toArray(),
  ])
  const totalCapital = capitalResult[0]?.total ?? 0
  const totalRevenue = revenueResult[0]?.total ?? 0
  const totalSpent = spentResult[0]?.total ?? 0
  const jvRevenue = jvRevenueResult[0]?.total ?? 0
  return {
    totalCapital,
    totalRevenue,
    totalSpent,
    jvRevenue,
    availableFunds: totalCapital + totalRevenue - jvRevenue - totalSpent,
  }
}
```

- [ ] **Step 3: Update `createProjectWithUnits` to accept and persist `isJointVenture`**

Add `isJointVenture?: boolean` to the input parameter object (after `initialCapital?`):

```ts
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
    initialCapital?: number
    isJointVenture?: boolean
  },
  userId: string
): Promise<{ projectId: ObjectId }> {
```

Then in the `projectDoc` object inside the transaction, add after `parkingPrefix`:

```ts
        isJointVenture: input.isJointVenture ?? false,
```

- [ ] **Step 4: Add `getProjectJVStats`**

Add this function after `getProjectFunds`:

```ts
export type ProjectJVStats = {
  totalJVUnits: number
  soldJVUnits: number
  jvRevenue: number
}

export async function getProjectJVStats(
  projectId: ObjectId
): Promise<ProjectJVStats> {
  const db = getDb()
  const [totalResult, soldResult, revenueResult] = await Promise.all([
    db
      .collection<Unit>("units")
      .countDocuments({ projectId, isJointVentureUnit: true, type: "apartment" }),
    db
      .collection<Unit>("units")
      .countDocuments({
        projectId,
        isJointVentureUnit: true,
        type: "apartment",
        status: "sold",
      }),
    db
      .collection<Unit>("units")
      .aggregate<{ total: number }>([
        {
          $match: {
            projectId,
            isJointVentureUnit: true,
            type: "apartment",
            status: "sold",
          },
        },
        { $group: { _id: null, total: { $sum: "$soldPriceTotal" } } },
      ])
      .toArray(),
  ])
  return {
    totalJVUnits: totalResult,
    soldJVUnits: soldResult,
    jvRevenue: revenueResult[0]?.total ?? 0,
  }
}
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add lib/projects/repository.ts
git commit -m "feat(jv): update repository — getProjectFunds excludes JV revenue, add getProjectJVStats"
```

---

## Task 3: Update project actions

**Files:**
- Modify: `app/(authed)/projects/actions.ts`

- [ ] **Step 1: Pass `isJointVenture` through `createProject`**

In `createProject`, the `parsed.data` now includes `isJointVenture` (from schema). `createProjectWithUnits` already accepts it after Task 2. No extra change is needed — `parsed.data` is spread directly. Verify the call already passes the full `parsed.data`:

```ts
    const { projectId } = await createProjectWithUnits(parsed.data, user.id)
```

This is already correct — `parsed.data` now includes `isJointVenture`.

- [ ] **Step 2: Pass `isJointVenture` through `updateProject`**

In `updateProject`, after the block that builds `set`, add:

```ts
  if (input.isJointVenture !== undefined) set.isJointVenture = input.isJointVenture
```

The full `set`-building block should look like:

```ts
  const set: Record<string, unknown> = {}
  if (input.name !== undefined) set.name = input.name
  if (input.location !== undefined) set.location = input.location
  if (input.status !== undefined) set.status = input.status
  if (input.notes !== undefined) set.notes = input.notes
  if (input.isJointVenture !== undefined) set.isJointVenture = input.isJointVenture
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/\(authed\)/projects/actions.ts
git commit -m "feat(jv): thread isJointVenture through createProject and updateProject actions"
```

---

## Task 4: Update inventory action

**Files:**
- Modify: `app/(authed)/projects/[id]/inventory/actions.ts`

- [ ] **Step 1: Pass `isJointVentureUnit` through `editUnit`**

In `editUnit`, after the block that builds `set`, add:

```ts
    if (input.isJointVentureUnit !== undefined) set.isJointVentureUnit = input.isJointVentureUnit
```

The full `set`-building block should look like:

```ts
    const set: Record<string, unknown> = {}
    if (input.number !== undefined) set.number = input.number
    if (input.floor !== undefined) set.floor = input.floor
    if (input.areaSqft !== undefined) set.areaSqft = input.areaSqft
    if (input.salePrice !== undefined) set.salePrice = input.salePrice
    if (input.notes !== undefined) set.notes = input.notes
    if (input.isJointVentureUnit !== undefined) set.isJointVentureUnit = input.isJointVentureUnit
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/inventory/actions.ts"
git commit -m "feat(jv): thread isJointVentureUnit through editUnit action"
```

---

## Task 5: New project dialog

**Files:**
- Modify: `app/(authed)/projects/new-project-dialog.tsx`

- [ ] **Step 1: Add `Checkbox` import**

Add to the existing import block at the top:

```ts
import { Checkbox } from "@/components/ui/checkbox"
```

- [ ] **Step 2: Add `isJointVenture` to `FormState` and `INITIAL`**

In the `FormState` type, add:

```ts
  isJointVenture: boolean
```

In `INITIAL`, add:

```ts
  isJointVenture: false,
```

- [ ] **Step 3: Add the checkbox to the form**

After the Status `<Field>` block (lines 187–204) and before the Notes `<Field>`, add:

```tsx
          <div className="flex items-center gap-3">
            <Checkbox
              id="isJointVenture"
              checked={form.isJointVenture}
              onCheckedChange={(checked) =>
                set("isJointVenture", checked === true)
              }
              disabled={isPending}
            />
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="isJointVenture" className="cursor-pointer">
                Is Joint Venture?
              </Label>
              <p className="text-xs text-muted-foreground">
                JV unit sales will be excluded from project financials.
              </p>
            </div>
          </div>
```

- [ ] **Step 4: Verify `isJointVenture` is in the submitted payload**

In `handleSubmit`, the `payload` is `{ ...form, ... }`. Since `form` now contains `isJointVenture`, it is automatically included. No extra change needed.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(authed)/projects/new-project-dialog.tsx"
git commit -m "feat(jv): add isJointVenture checkbox to new project dialog"
```

---

## Task 6: Edit project dialog

**Files:**
- Modify: `app/(authed)/projects/[id]/edit-project-dialog.tsx`

- [ ] **Step 1: Add `Checkbox` import**

Add to imports:

```ts
import { Checkbox } from "@/components/ui/checkbox"
```

- [ ] **Step 2: Add `isJointVenture` to `Props.current`**

```ts
type Props = {
  projectId: string
  current: {
    name: string
    location: string
    status: ProjectStatus
    notes?: string
    isJointVenture?: boolean
  }
}
```

- [ ] **Step 3: Add the toggle to the form**

Add after the Status block (lines 117–130) and before the Notes block:

```tsx
          <div className="flex items-center gap-3">
            <Checkbox
              id="isJointVenture"
              name="isJointVenture"
              defaultChecked={current.isJointVenture ?? false}
            />
            <Label htmlFor="isJointVenture" className="cursor-pointer">
              Is Joint Venture?
            </Label>
          </div>
```

- [ ] **Step 4: Include `isJointVenture` in the submitted `raw` object**

In the form's `action` callback, add to the `raw` object:

```ts
                isJointVenture: formData.get("isJointVenture") === "on",
```

The full `raw` object:

```ts
              const raw = {
                projectId,
                name: String(formData.get("name") ?? ""),
                location: String(formData.get("location") ?? ""),
                status: String(formData.get("status") ?? "") as ProjectStatus,
                notes: String(formData.get("notes") ?? ""),
                isJointVenture: formData.get("isJointVenture") === "on",
              }
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(authed)/projects/[id]/edit-project-dialog.tsx"
git commit -m "feat(jv): add isJointVenture toggle to edit project dialog"
```

---

## Task 7: Edit unit dialog

**Files:**
- Modify: `app/(authed)/projects/[id]/inventory/edit-unit-dialog.tsx`

- [ ] **Step 1: Add `Checkbox` import**

Add to imports:

```ts
import { Checkbox } from "@/components/ui/checkbox"
```

- [ ] **Step 2: Update `Props`**

Replace the `Props` type:

```ts
type Props = {
  unitId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  isJointVentureProject: boolean
  current: {
    number: string
    floor: number
    areaSqft: number
    salePrice: number
    notes?: string
    status: "available" | "sold"
    type: "apartment" | "parking"
    isJointVentureUnit?: boolean
  }
}
```

- [ ] **Step 3: Update the component signature**

```ts
export function EditUnitDialog({
  unitId,
  open,
  onOpenChange,
  isJointVentureProject,
  current,
}: Props) {
```

- [ ] **Step 4: Build `isJointVentureUnit` from formData and include in `raw`**

In the form `action` callback, the `raw` object is built. Add `isJointVentureUnit` after `notes`:

```ts
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
              if (isJointVentureProject && current.type === "apartment") {
                raw.isJointVentureUnit = formData.get("isJointVentureUnit") === "on"
              }
```

- [ ] **Step 5: Add the JV checkbox to the form UI**

Add after the Notes `<div>` block and before the error paragraph:

```tsx
          {isJointVentureProject && current.type === "apartment" && (
            <div className="flex items-center gap-3">
              <Checkbox
                id="isJointVentureUnit"
                name="isJointVentureUnit"
                defaultChecked={current.isJointVentureUnit ?? false}
              />
              <Label htmlFor="isJointVentureUnit" className="cursor-pointer">
                Mark as Joint Venture Unit
              </Label>
            </div>
          )}
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add "app/(authed)/projects/[id]/inventory/edit-unit-dialog.tsx"
git commit -m "feat(jv): add isJointVentureUnit checkbox to edit unit dialog"
```

---

## Task 8: Unit row

**Files:**
- Modify: `app/(authed)/projects/[id]/inventory/unit-row.tsx`

- [ ] **Step 1: Add `isJointVentureUnit` to the `unit` prop shape and add `isJointVentureProject` prop**

Replace the component signature:

```ts
export function UnitRow({
  unit,
  projectId,
  role,
  isJointVentureProject,
}: {
  unit: {
    _id: string
    number: string
    type: "apartment" | "parking"
    floor: number | null
    areaSqft: number
    salePrice: number
    notes: string | null
    status: "available" | "sold"
    buyerName: string | null
    soldPriceTotal: number | null
    soldAt: string | null
    isJointVentureUnit: boolean
  }
  projectId: string
  role: Role
  isJointVentureProject: boolean
}) {
```

- [ ] **Step 2: Add the "JV" badge next to the unit number**

Replace the number cell:

```tsx
        <td className="px-4 py-3 font-mono">
          <span className="flex items-center gap-1.5">
            {unit.number}
            {unit.isJointVentureUnit && (
              <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900 dark:text-indigo-300 text-[10px] px-1.5 py-0">
                JV
              </Badge>
            )}
          </span>
        </td>
```

- [ ] **Step 3: Pass new props to `EditUnitDialog`**

Replace the `EditUnitDialog` usage:

```tsx
            <EditUnitDialog
              unitId={unit._id}
              open={editOpen}
              onOpenChange={setEditOpen}
              isJointVentureProject={isJointVentureProject}
              current={{
                number: unit.number,
                floor: unit.floor ?? 0,
                areaSqft: unit.areaSqft,
                salePrice: unit.salePrice,
                notes: unit.notes ?? undefined,
                status: unit.status,
                type: unit.type,
                isJointVentureUnit: unit.isJointVentureUnit,
              }}
            />
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(authed)/projects/[id]/inventory/unit-row.tsx"
git commit -m "feat(jv): add JV badge to unit row and thread isJointVentureProject to EditUnitDialog"
```

---

## Task 9: Inventory table

**Files:**
- Modify: `app/(authed)/projects/[id]/inventory/inventory-table.tsx`

- [ ] **Step 1: Add `isJointVentureProject` to `InventoryTable` props**

Add to the function signature:

```ts
export async function InventoryTable({
  projectId,
  role,
  searchParams,
  page,
  pageSize,
  currentSearchParams,
  isJointVentureProject,
}: {
  projectId: string
  role: Role
  searchParams: InventoryFilterParams
  page: number
  pageSize: number
  currentSearchParams: Record<string, string | string[] | undefined>
  isJointVentureProject: boolean
}) {
```

- [ ] **Step 2: Pass `isJointVentureUnit` and `isJointVentureProject` to each `UnitRow`**

In the `units.map(...)` call, update `UnitRow` usage:

```tsx
            {units.map((u) => (
              <UnitRow
                key={String(u._id)}
                unit={{
                  _id: String(u._id),
                  number: u.number,
                  type: u.type,
                  floor: u.floor ?? null,
                  areaSqft: u.areaSqft,
                  salePrice: u.salePrice,
                  notes: u.notes ?? null,
                  status: u.status,
                  buyerName: u.buyerName ?? null,
                  soldPriceTotal: u.soldPriceTotal ?? null,
                  soldAt: u.soldAt ? u.soldAt.toISOString() : null,
                  isJointVentureUnit: u.isJointVentureUnit ?? false,
                }}
                projectId={projectId}
                role={role}
                isJointVentureProject={isJointVentureProject}
              />
            ))}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(authed)/projects/[id]/inventory/inventory-table.tsx"
git commit -m "feat(jv): thread isJointVentureProject and isJointVentureUnit through InventoryTable"
```

---

## Task 10: Project detail page

**Files:**
- Modify: `app/(authed)/projects/[id]/page.tsx`

- [ ] **Step 1: Import `getProjectJVStats` and `ProjectJVStats`**

Add to the existing repository import:

```ts
import {
  countSoldUnits,
  getProject,
  listProjects,
  getProjectFunds,
  getProjectJVStats,
  listCapitalInjections,
  type ProjectFunds,
  type ProjectJVStats,
} from "@/lib/projects/repository"
```

- [ ] **Step 2: Add `jvStats` to the `Promise.all` block**

Add `jvStats` as the last entry in the parallel fetch:

```ts
  const [
    project,
    soldCount,
    revenue,
    materialRows,
    catalog,
    ledgerResult,
    totals,
    allProjects,
    funds,
    capitalInjections,
    jvStats,
  ] = await Promise.all([
    getProject(id),
    countSoldUnits(projectObjectId),
    sumProjectRevenue(projectObjectId),
    listProjectMaterials(projectObjectId),
    listCatalog(),
    isAdmin
      ? listLedger(projectObjectId, filters, page, LEDGER_PAGE_SIZE)
      : Promise.resolve({ rows: [], total: 0 }),
    isAdmin
      ? computeTotals(projectObjectId, filters)
      : Promise.resolve({ revenue: 0, expenses: 0, net: 0, transfersIn: 0, transfersOut: 0 }),
    listProjects(),
    isAdmin
      ? getProjectFunds(projectObjectId)
      : Promise.resolve<ProjectFunds>({ totalCapital: 0, totalRevenue: 0, totalSpent: 0, availableFunds: 0, jvRevenue: 0 }),
    isAdmin
      ? listCapitalInjections(projectObjectId)
      : Promise.resolve<CapitalInjection[]>([]),
    getProjectJVStats(projectObjectId),
  ])
```

- [ ] **Step 3: Update `EditProjectDialog` to pass `isJointVenture`**

Find the `EditProjectDialog` usage and update its `current` prop:

```tsx
                <EditProjectDialog
                  projectId={project._id.toHexString()}
                  current={{
                    name: project.name,
                    location: project.location,
                    status: project.status,
                    notes: project.notes,
                    isJointVenture: project.isJointVenture ?? false,
                  }}
                />
```

- [ ] **Step 4: Pass `isJointVentureProject` to `InventoryTable`**

Find the `InventoryTable` usage and add the prop:

```tsx
            <InventoryTable
              projectId={id}
              role={user.role}
              searchParams={sp}
              page={parsePage(sp.unitsPage)}
              pageSize={UNITS_PAGE_SIZE}
              currentSearchParams={sp}
              isJointVentureProject={project.isJointVenture ?? false}
            />
```

- [ ] **Step 5: Add the JV summary card**

After the Capital `<section>` block (after the closing `}`  of `{isAdmin && (...)}` at around line 386), add:

```tsx
      {project.isJointVenture && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold tracking-tight">
            Joint Venture
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Tile
              label="JV units"
              value={`${jvStats.soldJVUnits} sold / ${jvStats.totalJVUnits} total`}
            />
            <Tile
              label="JV revenue (excl. from P&L)"
              value={`₹${INR.format(funds.jvRevenue)}`}
            />
          </div>
        </section>
      )}
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add "app/(authed)/projects/[id]/page.tsx"
git commit -m "feat(jv): wire JV stats, summary card, and isJointVentureProject prop on project detail page"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All 5 spec UI sections covered (Tasks 5, 6, 7, 8, 10). Financial logic covered (Tasks 2, 3, 4). Data model covered (Task 1).
- [x] **No placeholders:** All code is complete and concrete.
- [x] **Type consistency:** `isJointVentureProject: boolean` is the prop name used consistently across Tasks 7, 8, 9, 10. `isJointVentureUnit: boolean` is used consistently in Tasks 1, 4, 7, 8, 9. `jvRevenue` appears in `ProjectFunds` (Task 2) and is used in Task 10. `ProjectJVStats` is defined in Task 2 and imported in Task 10.
- [x] **Edge case from spec:** Toggling `isJointVenture` off does not clear `isJointVentureUnit` on units — correct, since the checkbox is simply hidden (not force-set to false) when `isJointVentureProject` is false.
