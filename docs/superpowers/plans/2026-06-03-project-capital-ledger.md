# Project Capital Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add initial capital tracking to projects — an optional initial capital at creation, a per-project capital injections ledger, and a computed available-funds display (Total Capital / Total Spent / Available Funds) on the project detail page.

**Architecture:** New `capitalInjections` MongoDB collection stores all injections (including the first one created at project creation). Available funds is computed on demand from two aggregations — no denormalized field on the project document. This means void purchases are handled automatically since they are already flagged `voided: true` in `transactions`.

**Tech Stack:** Next.js 15 App Router, MongoDB native driver, Zod, React 19, Tailwind CSS / shadcn/ui.

---

### Task 1: Extend schemas

**Files:**
- Modify: `lib/projects/schemas.ts`

- [ ] **Step 1: Add `CapitalInjection` type**

In `lib/projects/schemas.ts`, add after the closing brace of the `Project` type (after line 89):

```ts
export type CapitalInjection = {
  _id: ObjectId
  projectId: ObjectId
  amount: number
  notes?: string
  occurredAt: Date
  createdBy: ObjectId
  createdAt: Date
}
```

- [ ] **Step 2: Add `AddCapitalInputSchema`**

Still in `lib/projects/schemas.ts`, add after the `CapitalInjection` type:

```ts
export const AddCapitalInputSchema = z.object({
  projectId: z.string().min(1, "Missing project"),
  amount: z.coerce
    .number()
    .int("Must be a whole number")
    .min(1, "Must be at least ₹1")
    .max(9_99_99_99_999, "Too large"),
  notes: z.string().max(500, "Notes too long").optional().default(""),
  occurredAt: z.coerce.date(),
})
export type AddCapitalInput = z.infer<typeof AddCapitalInputSchema>
```

- [ ] **Step 3: Add `initialCapital` to `CreateProjectInputSchema`**

Inside the `.object({...})` block of `CreateProjectInputSchema`, add after the `notes` field (after `notes: z.string().max(2000).optional().default(""),`):

```ts
    initialCapital: z.coerce
      .number()
      .int("Must be a whole number")
      .min(1, "Must be at least ₹1")
      .max(9_99_99_99_999, "Too large")
      .optional(),
```

- [ ] **Step 4: Verify TypeScript**

Run:
```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/projects/schemas.ts
git commit -m "feat(capital): add CapitalInjection type and schemas"
```

---

### Task 2: Repository functions

**Files:**
- Modify: `lib/projects/repository.ts`

- [ ] **Step 1: Add `CapitalInjection` import and `ProjectFunds` export type**

Update the import from `./schemas` at the top of `lib/projects/repository.ts`:

```ts
import type {
  Project,
  Unit,
  UnitType,
  UnitStatus,
  ProjectStatus,
  CapitalInjection,
} from "./schemas"
```

After the imports, add:

```ts
export type ProjectFunds = {
  totalCapital: number
  totalSpent: number
  availableFunds: number
}
```

- [ ] **Step 2: Add `getProjectFunds`**

Append to `lib/projects/repository.ts`:

```ts
export async function getProjectFunds(projectId: ObjectId): Promise<ProjectFunds> {
  const db = getDb()
  const [capitalResult, spentResult] = await Promise.all([
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
        { $match: { projectId, kind: "expense", voided: { $ne: true } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray(),
  ])
  const totalCapital = capitalResult[0]?.total ?? 0
  const totalSpent = spentResult[0]?.total ?? 0
  return { totalCapital, totalSpent, availableFunds: totalCapital - totalSpent }
}
```

- [ ] **Step 3: Add `listCapitalInjections`**

Append to `lib/projects/repository.ts`:

```ts
export async function listCapitalInjections(
  projectId: ObjectId
): Promise<CapitalInjection[]> {
  const db = getDb()
  return db
    .collection<CapitalInjection>("capitalInjections")
    .find({ projectId })
    .sort({ occurredAt: -1 })
    .toArray()
}
```

- [ ] **Step 4: Add `addCapitalInjection`**

Append to `lib/projects/repository.ts`:

```ts
export async function addCapitalInjection(
  input: {
    projectId: ObjectId
    amount: number
    notes: string
    occurredAt: Date
  },
  userId: string
): Promise<void> {
  const db = getDb()
  const doc: Omit<CapitalInjection, "_id"> = {
    projectId: input.projectId,
    amount: input.amount,
    occurredAt: input.occurredAt,
    createdBy: new ObjectId(userId),
    createdAt: new Date(),
  }
  if (input.notes) doc.notes = input.notes
  await db
    .collection<Omit<CapitalInjection, "_id">>("capitalInjections")
    .insertOne(doc)
}
```

- [ ] **Step 5: Extend `createProjectWithUnits` to accept and insert `initialCapital`**

Update the function signature to add `initialCapital?: number` to the `input` parameter:

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
  },
  userId: string
): Promise<{ projectId: ObjectId }> {
```

Inside the `session.withTransaction` callback, after the `if (parkings.length > 0) await units.insertMany(parkings, { session })` line, add:

```ts
      if (input.initialCapital) {
        await db
          .collection<Omit<CapitalInjection, "_id">>("capitalInjections")
          .insertOne(
            {
              projectId,
              amount: input.initialCapital,
              occurredAt: now,
              createdBy,
              createdAt: now,
            },
            { session }
          )
      }
```

- [ ] **Step 6: Verify TypeScript**

Run:
```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/projects/repository.ts
git commit -m "feat(capital): add capital injection repository functions"
```

---

### Task 3: Server action

**Files:**
- Modify: `app/(authed)/projects/actions.ts`

- [ ] **Step 1: Update imports**

In `app/(authed)/projects/actions.ts`, update the schema import:

```ts
import {
  CreateProjectInputSchema,
  UpdateProjectInputSchema,
  ExpandProjectCapacityInputSchema,
  AddCapitalInputSchema,
  type ActionResult,
} from "@/lib/projects/schemas"
```

Update the repository import:

```ts
import { createProjectWithUnits, addCapitalInjection } from "@/lib/projects/repository"
```

- [ ] **Step 2: Add `addCapital` action**

Append to `app/(authed)/projects/actions.ts`:

```ts
export async function addCapital(raw: unknown): Promise<ActionResult<void>> {
  const user = await requireAdmin()
  const parsed = AddCapitalInputSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      error: first?.message ?? "Invalid input",
      field: first?.path.join(".") || undefined,
    }
  }
  const { projectId, amount, notes, occurredAt } = parsed.data
  if (!ObjectId.isValid(projectId)) {
    return { ok: false, error: "Invalid project id" }
  }
  try {
    await addCapitalInjection(
      { projectId: new ObjectId(projectId), amount, notes, occurredAt },
      user.id
    )
    revalidatePath(`/projects/${projectId}`)
    return { ok: true, data: undefined }
  } catch (err) {
    console.error("[addCapital]", err)
    return { ok: false, error: "Could not add funds. Please try again." }
  }
}
```

Note: `createProject` already calls `createProjectWithUnits(parsed.data, user.id)` and `parsed.data` now includes `initialCapital?: number` from the updated schema — no change needed to that action.

- [ ] **Step 3: Verify TypeScript**

Run:
```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(authed)/projects/actions.ts"
git commit -m "feat(capital): add addCapital server action"
```

---

### Task 4: Initial capital field in new-project dialog

**Files:**
- Modify: `app/(authed)/projects/new-project-dialog.tsx`

- [ ] **Step 1: Add `initialCapital` to `FormState` and `INITIAL`**

Update the `FormState` type — add `initialCapital: string` (empty string = not provided):

```ts
type FormState = {
  name: string
  location: string
  totalUnits: number
  totalParkings: number
  status: string
  notes: string
  startingUnitNumber: number
  unitsPerFloor: number
  parkingPrefix: string
  initialCapital: string
}
```

Update `INITIAL`:

```ts
const INITIAL: FormState = {
  name: "",
  location: "",
  totalUnits: 12,
  totalParkings: 4,
  status: "planning",
  notes: "",
  startingUnitNumber: 101,
  unitsPerFloor: 4,
  parkingPrefix: "P",
  initialCapital: "",
}
```

- [ ] **Step 2: Update `handleSubmit` to convert `initialCapital`**

`z.coerce.number()` converts `""` to `0` which fails `min(1)`. Convert the empty string to `undefined` before passing to the server action. Replace the `handleSubmit` function body:

```ts
function handleSubmit() {
  setErrorMsg(null)
  setErrorField(null)
  startTransition(async () => {
    const payload = {
      ...form,
      initialCapital:
        form.initialCapital !== "" ? Number(form.initialCapital) : undefined,
    }
    const result = await createProject(payload)
    if (!result.ok) {
      setErrorMsg(result.error)
      setErrorField(result.field ?? null)
      return
    }
    onOpenChange(false)
    router.push(`/projects/${result.data.projectId}`)
  })
}
```

- [ ] **Step 3: Add the field to the form JSX**

After the Notes `<Field>` block and before the advanced toggle `<button>`, add:

```tsx
          <Field
            label="Initial capital (₹)"
            htmlFor="initialCapital"
            error={errorField === "initialCapital" ? errorMsg : null}
          >
            <Input
              id="initialCapital"
              type="number"
              min={1}
              step={1}
              placeholder="Optional — leave blank to set later"
              value={form.initialCapital}
              onChange={(e) => set("initialCapital", e.target.value)}
              disabled={isPending}
            />
          </Field>
```

- [ ] **Step 4: Verify TypeScript**

Run:
```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(authed)/projects/new-project-dialog.tsx"
git commit -m "feat(capital): add initial capital field to new project dialog"
```

---

### Task 5: Add Capital dialog component

**Files:**
- Create: `app/(authed)/projects/[id]/add-capital-dialog.tsx`

- [ ] **Step 1: Create the file**

Create `app/(authed)/projects/[id]/add-capital-dialog.tsx`:

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
import { addCapital } from "../../actions"

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function AddCapitalDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState("")
  const [occurredAt, setOccurredAt] = useState(todayIso)
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function reset() {
    setAmount("")
    setOccurredAt(todayIso())
    setNotes("")
    setError(null)
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    setOpen(next)
  }

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const result = await addCapital({
        projectId,
        amount: Number(amount),
        occurredAt: new Date(occurredAt),
        notes,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      reset()
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Add funds
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add funds</DialogTitle>
          <DialogDescription>
            Record a capital injection for this project.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSubmit()
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cap-amount">Amount (₹)</Label>
            <Input
              id="cap-amount"
              type="number"
              min={1}
              step={1}
              placeholder="e.g. 5000000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={pending}
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cap-date">Date</Label>
            <Input
              id="cap-date"
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cap-notes">
              Notes{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="cap-notes"
              rows={2}
              placeholder="e.g. Second tranche"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={pending}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !amount}>
              {pending ? "Adding…" : "Add funds"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

Run:
```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/add-capital-dialog.tsx"
git commit -m "feat(capital): add AddCapitalDialog component"
```

---

### Task 6: Project detail page — capital section

**Files:**
- Modify: `app/(authed)/projects/[id]/page.tsx`

- [ ] **Step 1: Update imports**

In `app/(authed)/projects/[id]/page.tsx`, update the repository import:

```ts
import {
  countSoldUnits,
  getProject,
  listProjects,
  getProjectFunds,
  listCapitalInjections,
  type ProjectFunds,
} from "@/lib/projects/repository"
```

Add the type import for `CapitalInjection`:

```ts
import type { CapitalInjection } from "@/lib/projects/schemas"
```

Add the dialog import alongside the other local dialog imports:

```ts
import { AddCapitalDialog } from "./add-capital-dialog"
```

- [ ] **Step 2: Fetch capital data**

The existing destructure at the top of the component body is:

```ts
const [project, soldCount, revenue, materialRows, catalog, ledgerResult, totals, allProjects] =
  await Promise.all([
    getProject(id),
    ...
    listProjects(),
  ])
```

Replace it with:

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
    : Promise.resolve<ProjectFunds>({ totalCapital: 0, totalSpent: 0, availableFunds: 0 }),
  isAdmin
    ? listCapitalInjections(projectObjectId)
    : Promise.resolve<CapitalInjection[]>([]),
])
```

- [ ] **Step 3: Add capital section to JSX**

In the return statement, after the closing `</header>` tag and before `<ProjectTabs .../>`, add:

```tsx
      {isAdmin && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight">Capital</h2>
            <AddCapitalDialog projectId={id} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Tile
              label="Total capital"
              value={`₹${INR.format(funds.totalCapital)}`}
            />
            <Tile
              label="Total spent"
              value={`₹${INR.format(funds.totalSpent)}`}
            />
            <Tile
              label="Available funds"
              value={`₹${INR.format(Math.abs(funds.availableFunds))}${funds.availableFunds < 0 ? " (deficit)" : ""}`}
              negative={funds.availableFunds < 0}
            />
          </div>
          {capitalInjections.length > 0 && (
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 text-left font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {capitalInjections.map((inj) => (
                    <tr
                      key={inj._id.toHexString()}
                      className="border-b last:border-0"
                    >
                      <td className="px-3 py-2 text-muted-foreground">
                        {inj.occurredAt.toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        ₹{INR.format(inj.amount)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {inj.notes ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
```

- [ ] **Step 4: Extend `Tile` to support `negative` prop**

The `Tile` function at the bottom of `page.tsx` currently accepts `{ label, value }`. Update it to support an optional `negative` flag:

```tsx
function Tile({
  label,
  value,
  negative,
}: {
  label: string
  value: string
  negative?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3">
      <span className="text-xs uppercase tracking-wide">{label}</span>
      <span className={`font-mono text-xl${negative ? " text-destructive" : ""}`}>
        {value}
      </span>
    </div>
  )
}
```

- [ ] **Step 5: Verify TypeScript**

Run:
```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(authed)/projects/[id]/page.tsx"
git commit -m "feat(capital): render capital section on project detail page"
```

---

### Task 7: Final build verification

- [ ] **Step 1: Run full Next.js build**

```
npm run build
```

Expected: exits 0 with no TypeScript or compilation errors.

- [ ] **Step 2: Manual smoke test** (run `npm run dev`, open browser)

1. Create a new project with an Initial Capital value (e.g. ₹50,00,000) → navigate to the project detail page → confirm the Capital section shows Total Capital = ₹50,00,000, Total Spent = ₹0, Available Funds = ₹50,00,000.
2. Click "Add funds" → enter ₹10,00,000, a date, and a note → confirm Total Capital updates to ₹60,00,000 and the ledger table shows two rows.
3. Record a purchase on the Materials tab → confirm Total Spent increases and Available Funds decreases by the purchase amount.
4. Create a project with no Initial Capital → confirm the Capital section shows all ₹0 and an empty ledger.
5. Force a deficit (Total Spent > Total Capital) → confirm Available Funds shows in red with "(deficit)".
