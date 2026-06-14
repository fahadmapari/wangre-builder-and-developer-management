# Skeleton & Lazy Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add instant, layout-matching loading skeletons to every data-backed route and code-split `recharts` (and, if measurement justifies, the dialog/sheet bodies) so the app feels responsive and ships less initial JS.

**Architecture:** Route-level `loading.tsx` files render layout-matching skeletons built from a small set of reusable primitives while each `async` server page resolves; the `(authed)` header shell stays mounted. The three dashboard chart sections become `next/dynamic` `ssr:false` lazy chunks behind a chart skeleton. Dialog/sheet code-splitting is sequenced **after a production-build measurement** and applied only where it meaningfully reduces a route's First Load JS.

**Tech Stack:** Next.js 16 (App Router), React 19, shadcn/ui, Tailwind v4, `recharts`, `next/dynamic`.

**Spec:** `docs/superpowers/specs/2026-06-11-skeleton-and-lazy-loading-design.md`

**Note on testing:** this repo has **no test runner** (no jest/vitest in `package.json`). Verification for every task is `npm run typecheck`, `npm run lint`, `npm run build`, plus a described manual check. Do not add a test framework — it is out of scope.

---

## File Structure

**New files:**
- `components/ui/skeleton.tsx` — `Skeleton` base primitive.
- `components/skeletons/index.tsx` — composable building blocks (`TileSkeleton`, `CardGridSkeleton`, `TableSkeleton`, `ChartCardSkeleton`, `FilterBarSkeleton`, `FormFieldSkeleton`).
- `app/(authed)/projects/loading.tsx`
- `app/(authed)/projects/[id]/loading.tsx`
- `app/(authed)/dashboard/loading.tsx`
- `app/(authed)/financials/loading.tsx`
- `app/(authed)/catalog/loading.tsx`
- `app/(authed)/transfers/loading.tsx`
- `app/(authed)/audit/loading.tsx`
- `app/(authed)/settings/loading.tsx`
- `app/(authed)/dashboard/financial-trends.client.tsx` / `sales-inventory.client.tsx` / `materials-procurement.client.tsx` — the existing recharts impls, renamed.

**Modified files:**
- `app/(authed)/dashboard/financial-trends.tsx` / `sales-inventory.tsx` / `materials-procurement.tsx` — replaced with thin lazy wrappers (same export names; dashboard imports unchanged).
- `lib/hooks/use-disclosure.ts` — add `mounted` flag (Phase 5 only).
- Dialog/sheet trigger files + new `*.body.tsx` files (Phase 5 only, measure-gated).

---

## Task 1: Baseline production-build measurement

Capture current First Load JS so the recharts win and the Phase 5 gate have a before/after.

**Files:** none (measurement only).

- [ ] **Step 1: Build and record the route table**

Run: `npm run build`
Expected: build succeeds. In the printed **Route (app)** table, record the **First Load JS** column for at least `/dashboard`, `/financials`, `/transfers`, `/catalog`, `/audit`, `/projects`, and `/projects/[id]`, plus the **shared by all** figure. Paste them into a scratch note (or a comment in the PR) labelled "BEFORE".

- [ ] **Step 2: Commit nothing**

No code changed. Proceed to Task 2.

---

## Task 2: Skeleton primitives

**Files:**
- Create: `components/ui/skeleton.tsx`
- Create: `components/skeletons/index.tsx`

- [ ] **Step 1: Create the `Skeleton` base**

`components/ui/skeleton.tsx`:

```tsx
import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
```

- [ ] **Step 2: Create the building blocks**

`components/skeletons/index.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton"

export function TileSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-6 w-24" />
    </div>
  )
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i}>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <Skeleton className="h-24 w-full rounded-none" />
            <div className="flex flex-col gap-3 p-5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function FilterBarSkeleton({ fields = 3 }: { fields?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {Array.from({ length: fields }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-40" />
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex gap-4 border-b border-border bg-muted px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4 px-4 py-3">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function ChartCardSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-[260px] w-full" />
    </div>
  )
}

export function FormFieldSkeleton() {
  return (
    <div className="flex flex-col gap-1.5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-9 w-full" />
    </div>
  )
}
```

- [ ] **Step 3: Verify typecheck + lint**

Run: `npm run typecheck`
Expected: no errors.
Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/ui/skeleton.tsx components/skeletons/index.tsx
git commit -m "feat(ui): add Skeleton primitive and reusable skeleton blocks"
```

---

## Task 3: Route loading skeletons

One layout-matching `loading.tsx` per data-backed route. Container classes mirror each page so content drops in without a jump. All are plain server components (no `"use client"`).

**Files (all Create):**
`app/(authed)/projects/loading.tsx`, `app/(authed)/projects/[id]/loading.tsx`,
`app/(authed)/dashboard/loading.tsx`, `app/(authed)/financials/loading.tsx`,
`app/(authed)/catalog/loading.tsx`, `app/(authed)/transfers/loading.tsx`,
`app/(authed)/audit/loading.tsx`, `app/(authed)/settings/loading.tsx`.

- [ ] **Step 1: `app/(authed)/projects/loading.tsx`**

```tsx
import { CardGridSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-9 w-full max-w-md" />
      <CardGridSkeleton count={6} />
    </div>
  )
}
```

- [ ] **Step 2: `app/(authed)/dashboard/loading.tsx`**

```tsx
import { ChartCardSkeleton, FilterBarSkeleton, TileSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <FilterBarSkeleton fields={3} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <TileSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCardSkeleton />
        <ChartCardSkeleton />
        <div className="lg:col-span-2">
          <ChartCardSkeleton />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: `app/(authed)/financials/loading.tsx`**

```tsx
import { FilterBarSkeleton, TableSkeleton, TileSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-8 w-36" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <TileSkeleton />
        <TileSkeleton />
        <TileSkeleton />
      </div>
      <FilterBarSkeleton fields={2} />
      <TableSkeleton rows={8} cols={5} />
    </div>
  )
}
```

- [ ] **Step 4: `app/(authed)/catalog/loading.tsx`**

```tsx
import { TableSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <TableSkeleton rows={8} cols={6} />
    </div>
  )
}
```

- [ ] **Step 5: `app/(authed)/transfers/loading.tsx`**

```tsx
import { FilterBarSkeleton, TableSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-80" />
      </div>
      <FilterBarSkeleton fields={2} />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
      </div>
      <TableSkeleton rows={8} cols={6} />
    </div>
  )
}
```

- [ ] **Step 6: `app/(authed)/audit/loading.tsx`**

```tsx
import { FilterBarSkeleton, TableSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-baseline justify-between">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-4 w-40" />
      </div>
      <FilterBarSkeleton fields={4} />
      <TableSkeleton rows={10} cols={5} />
    </div>
  )
}
```

- [ ] **Step 7: `app/(authed)/settings/loading.tsx`**

```tsx
import { FormFieldSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-8 flex flex-col gap-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-64" />
        <FormFieldSkeleton />
        <FormFieldSkeleton />
        <FormFieldSkeleton />
      </div>
    </div>
  )
}
```

- [ ] **Step 8: `app/(authed)/projects/[id]/loading.tsx`**

```tsx
import { TableSkeleton, TileSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="mx-auto flex h-[calc(100svh-3.5rem)] w-full max-w-6xl flex-col overflow-hidden px-6">
      <div className="shrink-0 pb-4 pt-10">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 pb-8">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <TileSkeleton key={i} />
          ))}
        </div>
        <Skeleton className="h-9 w-72" />
        <TableSkeleton rows={8} cols={6} />
      </div>
    </div>
  )
}
```

- [ ] **Step 9: Verify typecheck + lint + build**

Run: `npm run typecheck` → no errors.
Run: `npm run lint` → no errors.
Run: `npm run build` → succeeds; the route table now shows a small `loading.tsx` segment per route.

- [ ] **Step 10: Manual check (dev server)**

Run: `npm run dev`. With network throttling (DevTools → Network → Slow 4G), navigate between `/dashboard`, `/projects`, `/financials`, `/catalog`, `/transfers`, `/audit`, `/settings`, and a project detail page. Confirm: header stays, a layout-matching skeleton appears immediately, then the real content replaces it without a visible layout jump.

- [ ] **Step 11: Commit**

```bash
git add "app/(authed)/projects/loading.tsx" "app/(authed)/projects/[id]/loading.tsx" "app/(authed)/dashboard/loading.tsx" "app/(authed)/financials/loading.tsx" "app/(authed)/catalog/loading.tsx" "app/(authed)/transfers/loading.tsx" "app/(authed)/audit/loading.tsx" "app/(authed)/settings/loading.tsx"
git commit -m "feat(loading): add layout-matching route skeletons via loading.tsx"
```

---

## Task 4: Lazy-load dashboard charts (recharts)

Move each recharts section to a `*.client.tsx` and replace its original file with a `"use client"` lazy wrapper that keeps the same export name, so the dashboard page's imports do not change. `recharts` leaves the shared bundle and loads only on `/dashboard`, behind a chart skeleton.

**Files:**
- Rename: `dashboard/financial-trends.tsx` → `dashboard/financial-trends.client.tsx` (and the two siblings)
- Create: new `dashboard/financial-trends.tsx` (+ siblings) as wrappers

- [ ] **Step 1: Rename the three impl files**

```bash
git mv "app/(authed)/dashboard/financial-trends.tsx" "app/(authed)/dashboard/financial-trends.client.tsx"
git mv "app/(authed)/dashboard/sales-inventory.tsx" "app/(authed)/dashboard/sales-inventory.client.tsx"
git mv "app/(authed)/dashboard/materials-procurement.tsx" "app/(authed)/dashboard/materials-procurement.client.tsx"
```

The renamed files keep their existing `"use client"` and their named exports (`FinancialTrends`, `SalesInventory`, `MaterialsProcurement`). No edits to their bodies.

- [ ] **Step 2: Create `app/(authed)/dashboard/financial-trends.tsx` wrapper**

```tsx
"use client"

import type { ComponentProps } from "react"
import dynamic from "next/dynamic"
import { ChartCardSkeleton } from "@/components/skeletons"

const Impl = dynamic(
  () => import("./financial-trends.client").then((m) => m.FinancialTrends),
  { ssr: false, loading: () => <ChartCardSkeleton /> },
)

export function FinancialTrends(props: ComponentProps<typeof Impl>) {
  return <Impl {...props} />
}
```

- [ ] **Step 3: Create `app/(authed)/dashboard/sales-inventory.tsx` wrapper**

```tsx
"use client"

import type { ComponentProps } from "react"
import dynamic from "next/dynamic"
import { ChartCardSkeleton } from "@/components/skeletons"

const Impl = dynamic(
  () => import("./sales-inventory.client").then((m) => m.SalesInventory),
  { ssr: false, loading: () => <ChartCardSkeleton /> },
)

export function SalesInventory(props: ComponentProps<typeof Impl>) {
  return <Impl {...props} />
}
```

- [ ] **Step 4: Create `app/(authed)/dashboard/materials-procurement.tsx` wrapper**

```tsx
"use client"

import type { ComponentProps } from "react"
import dynamic from "next/dynamic"
import { ChartCardSkeleton } from "@/components/skeletons"

const Impl = dynamic(
  () => import("./materials-procurement.client").then((m) => m.MaterialsProcurement),
  { ssr: false, loading: () => <ChartCardSkeleton /> },
)

export function MaterialsProcurement(props: ComponentProps<typeof Impl>) {
  return <Impl {...props} />
}
```

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors. If TS reports the wrapper props as `{}` / loses the prop type (rare), open the matching `*.client.tsx`, add `export type <Name>Props = { ... }` copied verbatim from the component's existing parameter type, and change the wrapper to `import type { <Name>Props }` + `props: <Name>Props`. Re-run typecheck.

- [ ] **Step 6: Verify lint + build, confirm the split**

Run: `npm run lint` → no errors.
Run: `npm run build` → succeeds. Compare the route table against the Task 1 "BEFORE": `recharts` should no longer be in **shared by all**; `/dashboard` First Load JS drops, and `recharts` appears as a separate chunk loaded by `/dashboard` only. Record the new numbers as "AFTER (charts)".

- [ ] **Step 7: Manual check**

`npm run dev` → open `/dashboard` with the Network tab open. Confirm a `recharts`-containing chunk loads on demand and a chart skeleton shows briefly before the charts render. Confirm charts still render and tooltips/formatters work.

- [ ] **Step 8: Commit**

```bash
git add "app/(authed)/dashboard/financial-trends.tsx" "app/(authed)/dashboard/financial-trends.client.tsx" "app/(authed)/dashboard/sales-inventory.tsx" "app/(authed)/dashboard/sales-inventory.client.tsx" "app/(authed)/dashboard/materials-procurement.tsx" "app/(authed)/dashboard/materials-procurement.client.tsx"
git commit -m "perf(dashboard): lazy-load recharts chart sections via next/dynamic"
```

---

## Task 5: Measurement gate — decide dialog/sheet splitting

Use the "AFTER (charts)" route table from Task 4 Step 6 to decide whether the dialog/sheet work in Task 6 is worth it. The decision is **per the spec's measure-gating refinement**.

- [ ] **Step 1: Identify the worst route**

From the "AFTER (charts)" table, pick the route with the highest **First Load JS** among `/catalog`, `/transfers`, `/financials`, `/projects/[id]` (these are dialog-heavy). Call it the candidate route.

- [ ] **Step 2: Trial-split the candidate route's dialogs only**

Apply the Task 6 recipe to **only** the dialog(s)/sheet(s) on the candidate route (e.g. `/catalog` → `new-material-dialog`, `edit-material-dialog`). Include the `useDisclosure` change (Task 6 Step 1) since the recipe depends on it.

- [ ] **Step 3: Re-measure**

Run: `npm run build`. Compare the candidate route's First Load JS before vs after the trial split.

- [ ] **Step 4: Decide and record**

- If the candidate route's First Load JS dropped by **≥ 10 KB**: keep the trial split, commit it, and proceed to Task 6 for the remaining routes.
- If it dropped by **< 10 KB**: revert the trial split (`git checkout -- <files>` / delete the new `*.body.tsx`), keep the `useDisclosure` change only if already used elsewhere (otherwise revert it too), and **stop here** — skip Task 6. Document the measured numbers in the PR description so the decision is auditable.

```bash
# If keeping the trial:
git add -A && git commit -m "perf(catalog): lazy-load dialog bodies (trial split, -<N>KB First Load JS)"
```

---

## Task 6: Lazy-load dialog & sheet bodies (only if Task 5 passed the gate)

Apply per-target using the matching pattern below. Confirm dialogs are listed in the **Targets** table; leave the three confirm dialogs (`void-confirm-dialog`, `reverse-confirm-dialog`, `unmark-confirm-dialog`) untouched.

- [ ] **Step 1: Add `mounted` to `useDisclosure`**

`lib/hooks/use-disclosure.ts` — replace the body so the disclosure tracks whether its content has ever been opened (so the lazy body mounts on first open and never SSRs):

```tsx
"use client"

import { useCallback, useState } from "react"

/**
 * Open/close state for a dialog or sheet. `mounted` becomes true on first open
 * and stays true, so a lazily-imported body mounts only after the first open.
 * `contentKey` remounts the body on each open so internal form state resets.
 */
export function useDisclosure(initial = false) {
  const [open, setOpen] = useState(initial)
  const [mounted, setMounted] = useState(initial)
  const handleChange = useCallback((next: boolean) => {
    if (next) setMounted(true)
    setOpen(next)
  }, [])
  return {
    open,
    setOpen: handleChange,
    onOpenChange: handleChange,
    mounted,
    contentKey: open ? "open" : "closed",
  }
}
```

Run: `npm run typecheck`. If a call site passes a function updater to `setOpen` (not a boolean), TS will flag it — change that call to pass a boolean. (None are expected; all current callers pass booleans via Radix `onOpenChange` or `onClick`.)

### Pattern A — controlled internal body (trigger already renders a separate `*Dialog` component)

Canonical example: `app/(authed)/projects/new-project-dialog.tsx`.

- [ ] **Step A1: Move the body to its own file**

Create `app/(authed)/projects/new-project-dialog.body.tsx`: add `"use client"` at the top, then **cut** the entire internal `function NewProjectDialog(...) { ... }` (and the imports only it uses — `useState`, `useRouter`, `useFormFields`, `useServerAction`, `Field`, `Checkbox`, `Dialog*`, `Input`, `Label`, `Textarea`, `Select*`, `createProject`, the `STATUS_OPTIONS`/`FormState`/`INITIAL` consts) from the original file into this one. Add `export` to the function: `export function NewProjectDialog(...)`.

- [ ] **Step A2: Rewrite the trigger to lazy-render the body**

In `app/(authed)/projects/new-project-dialog.tsx`, the trigger keeps only the button + disclosure and lazy-imports the body:

```tsx
"use client"

import dynamic from "next/dynamic"
import { useDisclosure } from "@/lib/hooks"
import { Button } from "@/components/ui/button"

const NewProjectDialog = dynamic(() =>
  import("./new-project-dialog.body").then((m) => m.NewProjectDialog),
)

export function NewProjectButton({ variant }: { variant?: "cta" }) {
  const { open, onOpenChange, contentKey, mounted } = useDisclosure()
  return (
    <>
      <Button
        onClick={() => onOpenChange(true)}
        size={variant === "cta" ? "default" : "sm"}
      >
        New project
      </Button>
      {mounted ? (
        <NewProjectDialog key={contentKey} open={open} onOpenChange={onOpenChange} />
      ) : null}
    </>
  )
}
```

Adjust the trigger's own props/labels to match the specific dialog. The body keeps `open`/`onOpenChange` exactly as before; `key={contentKey}` preserves the existing remount-on-open reset.

- [ ] **Step A3: Apply to every Pattern-A target** (see table). Each is the identical transformation with its own names: extract the internal `*Dialog` function to `<file>.body.tsx`, lazy-import it in the trigger, gate render on `mounted`.

  Note for `record-purchase-dialog.tsx`: it has **two** triggers (`RecordPurchaseButton` → `RecordPurchaseDialog`, `TopLevelRecordPurchaseButton` → `TopLevelPurchaseDialog`). Move **both** internal dialog functions into one `record-purchase-dialog.body.tsx` (export both), and lazy-import both in the trigger file.

  Note for `mark-sold-dialog.tsx`: it destructures `{ open, setOpen }`; also pull `mounted` and (if it doesn't already) `onOpenChange` from `useDisclosure`, and gate on `mounted`.

### Pattern B — inline `DialogTrigger` (trigger + content in one component)

Canonical example: `app/(authed)/projects/[id]/add-capital-dialog.tsx`.

- [ ] **Step B1: Extract the content + form to a body file**

Create `app/(authed)/projects/[id]/add-capital-dialog.body.tsx`. Move the form state, the `useServerAction` call, helpers, and the entire `<DialogContent>…</DialogContent>` JSX into an exported component that takes `projectId` and an `onClose` callback. The Cancel button and the action's `onSuccess` call `onClose()` instead of the old `handleOpenChange(false)`; delete the manual `reset()` (the `key={contentKey}` remount in the trigger resets state):

```tsx
"use client"

import { useState } from "react"
import { useServerAction } from "@/lib/hooks"
import {
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
import { addCapital } from "../actions"

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function AddCapitalDialogBody({
  projectId,
  onClose,
}: {
  projectId: string
  onClose: () => void
}) {
  const [amount, setAmount] = useState("")
  const [occurredAt, setOccurredAt] = useState(todayIso)
  const [notes, setNotes] = useState("")
  const { run, isPending, errorMsg } = useServerAction(addCapital, {
    refresh: false,
    onSuccess: () => onClose(),
  })

  function handleSubmit() {
    run({
      projectId,
      amount: Number(amount),
      occurredAt: (() => {
        const [y, m, d] = occurredAt.split("-").map(Number)
        return new Date(y, m - 1, d)
      })(),
      notes,
    })
  }

  return (
    <DialogContent className="sm:max-w-sm">
      {/* Paste the original <DialogHeader> + <form> … </form> JSX here verbatim,
          replacing the Cancel button's onClick={() => handleOpenChange(false)}
          with onClick={onClose}. */}
    </DialogContent>
  )
}
```

- [ ] **Step B2: Rewrite the trigger to keep `Dialog`+`DialogTrigger` and lazy-render the body**

```tsx
"use client"

import dynamic from "next/dynamic"
import { useDisclosure } from "@/lib/hooks"
import { Button } from "@/components/ui/button"
import { Dialog, DialogTrigger } from "@/components/ui/dialog"

const AddCapitalDialogBody = dynamic(() =>
  import("./add-capital-dialog.body").then((m) => m.AddCapitalDialogBody),
)

export function AddCapitalDialog({ projectId }: { projectId: string }) {
  const { open, onOpenChange, contentKey, mounted } = useDisclosure()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Add funds
        </Button>
      </DialogTrigger>
      {mounted ? (
        <AddCapitalDialogBody
          key={contentKey}
          projectId={projectId}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </Dialog>
  )
}
```

`DialogContent` lives in the lazy body, so the Radix dialog panel + the form chunk both defer until first open while the trigger stays in the initial bundle.

- [ ] **Step B3: Apply to every Pattern-B target** (see table). For `reverse-transfer-dialog.tsx`, the equivalent components are `AlertDialog` + `AlertDialogTrigger` + `AlertDialogContent` (use those names, same structure). For `material-transfer-dialog`/`money-transfer-dialog`, pass through whatever props the trigger currently receives (`projects`, `materials`) into the body component.

### Pattern C — body already separate, parent controls `open`

Canonical example: `EditUnitDialog` rendered by `app/(authed)/projects/[id]/inventory/unit-row.tsx`.

- [ ] **Step C1: Lazy-import at the parent and gate on open**

`edit-unit-dialog.tsx` already exports a self-contained `EditUnitDialog` taking `open`/`onOpenChange`. In `unit-row.tsx`, replace the static import with a dynamic one and render it only while open (use the parent's existing open boolean — e.g. `editOpen`):

```tsx
const EditUnitDialog = dynamic(() =>
  import("./edit-unit-dialog").then((m) => m.EditUnitDialog),
)
// …
{editOpen ? (
  <EditUnitDialog
    open={editOpen}
    onOpenChange={setEditOpen}
    /* …existing props… */
  />
) : null}
```

`unit-row.tsx` is already a client component, so `dynamic` is allowed here. Gating with `{editOpen ? … : null}` drops the chunk from initial load. (Trade-off: the body unmounts immediately on close, so the Radix exit animation is skipped — acceptable; matches the lazy goal. If exit animation must be preserved, give the parent a `mounted` flag like `useDisclosure` and gate on that instead.)

- [ ] **Step C2: `DrilldownSheet`** is imported and rendered with an `open` prop in five parents (`projects/[id]/financials/ledger-row.tsx`, `projects/[id]/inventory/unit-row.tsx`, `projects/[id]/materials/movements-sheet.tsx`, `transfers/money-transfer-row.tsx`, `transfers/material-transfer-row.tsx`). In each, swap the static import for `const DrilldownSheet = dynamic(() => import("@/app/(authed)/components/drilldown-sheet").then((m) => m.DrilldownSheet))` and gate the render on its existing open condition (`{drilldownId !== null ? <DrilldownSheet … /> : null}` etc.). Only split routes that passed the Task 5 gate.

### Sheets with inline triggers (Pattern-B-like)

- [ ] **Step S1: `history-sheet.tsx`** exports `HistorySheet` (Sheet + `SheetTrigger asChild`) and `HistoryDialog` (Dialog + `DialogTrigger asChild`), both taking a `trigger` node. For each: extract the `<SheetContent>…` / `<DialogContent>…` body into `history-sheet.body.tsx` as `HistorySheetBody` / `HistoryDialogBody` (props: `entityType`, `entityId`), keep `Sheet`/`SheetTrigger` (and `Dialog`/`DialogTrigger`) + `useDisclosure` in the trigger file, and render `{mounted ? <HistorySheetBody … /> : null}` inside `<Sheet>`.

- [ ] **Step S2: `movements-sheet.tsx`** exports `MovementsSheetButton` (Button → `setOpen`, plus a `useEffect` that fetches `/api/movements` when open). Extract the `<SheetContent>…` body (including the fetch `useEffect`, pagination, and table) into `movements-sheet.body.tsx` as `MovementsSheetBody` (props: `projectId`, `materialId`, `materialName`, `unitLabel`, `role`, `onDrilldown`). Keep the Button + `Sheet` shell + `DrilldownSheet` in the trigger file; render `{open ? <MovementsSheetBody … /> : null}` inside `<Sheet>`. This also stops the fetch from running until opened.

### Targets table

| File | Pattern | Trigger export → body export |
|---|---|---|
| `catalog/new-material-dialog.tsx` | A | `NewMaterialButton` → `NewMaterialDialog` |
| `catalog/edit-material-dialog.tsx` | A | `EditMaterialButton` → `EditMaterialDialog` |
| `projects/new-project-dialog.tsx` | A | `NewProjectButton` → `NewProjectDialog` |
| `projects/[id]/materials/add-material-dialog.tsx` | A | `AddMaterialButton` → `AddMaterialDialog` |
| `projects/[id]/materials/log-consumption-dialog.tsx` | A | `LogConsumptionButton` → `LogConsumptionDialog` |
| `projects/[id]/materials/log-return-dialog.tsx` | A | `LogReturnButton` → `LogReturnDialog` |
| `projects/[id]/materials/record-purchase-dialog.tsx` | A | `RecordPurchaseButton`/`TopLevelRecordPurchaseButton` → `RecordPurchaseDialog`/`TopLevelPurchaseDialog` |
| `projects/[id]/financials/add-expense-dialog.tsx` | A | `AddExpenseButton` → `AddExpenseDialog` |
| `projects/[id]/financials/add-income-dialog.tsx` | A | `AddIncomeButton` → `AddIncomeDialog` |
| `projects/[id]/inventory/mark-sold-dialog.tsx` | A | `MarkSoldButton` → `MarkSoldDialog` |
| `projects/[id]/add-capital-dialog.tsx` | B | `AddCapitalDialog` → `AddCapitalDialogBody` |
| `projects/[id]/edit-project-dialog.tsx` | B | `EditProjectDialog` → `EditProjectDialogBody` |
| `projects/[id]/expand-capacity-dialog.tsx` | B | `ExpandCapacityDialog` → `ExpandCapacityDialogBody` |
| `transfers/money-transfer-dialog.tsx` | B | `MoneyTransferButton` → `MoneyTransferDialogBody` |
| `transfers/material-transfer-dialog.tsx` | B | `MaterialTransferButton` → `MaterialTransferDialogBody` |
| `transfers/reverse-transfer-dialog.tsx` | B (AlertDialog) | `ReverseTransferButton` → `ReverseTransferDialogBody` |
| `projects/[id]/inventory/edit-unit-dialog.tsx` | C | parent `unit-row.tsx` lazy-imports `EditUnitDialog` |
| `components/drilldown-sheet.tsx` | C | 5 parents lazy-import `DrilldownSheet` |
| `components/history-sheet.tsx` | B (sheet) | `HistorySheet`/`HistoryDialog` → `HistorySheetBody`/`HistoryDialogBody` |
| `projects/[id]/materials/movements-sheet.tsx` | B (sheet) | `MovementsSheetButton` → `MovementsSheetBody` |

- [ ] **Step 2: Verify after each route's dialogs are split**

Run: `npm run typecheck` → no errors. Run: `npm run lint` → no errors (watch for `react-hooks/set-state-in-effect`). Run: `npm run build` → succeeds; per-route First Load JS for the split routes drops further.

- [ ] **Step 3: Manual check**

`npm run dev`. For each split dialog/sheet: open it (chunk loads on demand — visible in Network tab), submit/validate it works, close and reopen (form state resets), and confirm focus returns to the trigger on close.

- [ ] **Step 4: Commit (per route or per pattern batch)**

```bash
git add -A
git commit -m "perf(dialogs): lazy-load <route> dialog/sheet bodies"
```

---

## Task 7: Final verification & branch finish

- [ ] **Step 1: Full verification**

Run: `npm run typecheck` → no errors.
Run: `npm run lint` → no errors.
Run: `npm run build` → succeeds. Paste the final route table next to the Task 1 "BEFORE" in the PR description.

- [ ] **Step 2: Full manual smoke pass**

`npm run dev`, throttled: every route shows its skeleton → content with no layout jump; dashboard charts lazy-load with a skeleton; any split dialogs/sheets open/submit/reset correctly.

- [ ] **Step 3: Finish the branch**

Use the **superpowers:finishing-a-development-branch** skill to choose merge / PR / cleanup for `feature/skeleton-lazy-loading`.

---

## Self-Review

**Spec coverage:**
- §1 primitives → Task 2. ✓
- §2 route `loading.tsx` (8 routes) → Task 3 (all 8). ✓
- §3 chart lazy-loading → Task 4. ✓
- §4 dialog/sheet splitting → Tasks 5–6 (measure-gated per the spec refinement; confirm dialogs excluded). ✓
- §5 dialog loading fallbacks → Task 6 (default none; body chunk loads on open). ✓
- Measure-gating refinement → Tasks 1, 4(Step 6), 5. ✓
- Verification §Verification → Tasks 3/4/6 steps + Task 7. ✓

**Placeholder scan:** The only intentionally-elided code is the verbatim form JSX in the Pattern-B body (Step B1) — the instruction is to paste the existing JSX unchanged except the Cancel handler, so no new code is invented. No "TBD"/"handle errors"/"similar to" placeholders.

**Type consistency:** `useDisclosure` returns `{ open, setOpen, onOpenChange, mounted, contentKey }` (Task 6 Step 1) and every consumer destructures from that set. Wrapper components keep the original export names (`FinancialTrends`, `SalesInventory`, `MaterialsProcurement`, dialog triggers) so importers are unchanged. Body export names in Task 6 match the Targets table.
