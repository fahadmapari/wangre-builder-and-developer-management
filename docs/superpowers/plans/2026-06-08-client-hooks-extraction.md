# Client Hooks Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the copy-pasted `useTransition`/error/dialog/URL-filter boilerplate spread across ~26 client components with a small set of reusable React hooks plus one shared `Field` component, without changing any user-visible behavior.

**Architecture:** Add pure client hooks under `lib/hooks/` (`useServerAction`, `useDisclosure`, `useFormFields`, `useUrlFilters`, `useDebouncedSearchParam`) and a shared `Field` under `components/form-field.tsx`. Migrate consumers feature-by-feature, behavior-preserving. Each hook is opt-in; where a file already deviates (individual `useState` fields, `refresh:false`, extra reset keys) the migration preserves that exact behavior via hook options.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript (strict), `@/*` → repo root. No test runner exists in this repo; verification is `npm run typecheck`, `npm run lint`, `npm run build`, plus a manual smoke checklist.

---

## Conventions & Constraints (read first)

- **Alias:** `@/*` maps to repo root (see `tsconfig.json`). Hooks import as `@/lib/hooks`, the field as `@/components/form-field`.
- **`ActionResult<T>`** is defined in `lib/projects/schemas.ts`:
  ```ts
  export type ActionResult<T = void> =
    | { ok: true; data: T }
    | { ok: false; error: string; field?: string }
  ```
  All hooks must consume this exact shape. Do not redefine it.
- **`react-hooks/set-state-in-effect` is enforced.** Never call a state setter synchronously in a `useEffect` body. `useDebouncedSearchParam` therefore uses a `useRef` timer and only setStates inside event handlers; its effect does cleanup only.
- **Behavior preservation is the acceptance bar.** This is a refactor. No dialog copy, no validation, no revalidate path, no debounce delay, no reset-key set may change. If a migration would change behavior, stop and flag it.
- **No new test framework.** Do not add vitest/jest/RTL. (Optional future follow-up, explicitly out of scope here.)
- **Commits:** conventional, e.g. `refactor(hooks): add useServerAction` / `refactor(financials): migrate add-expense to useServerAction`.

## Testing Approach (since there is no unit runner)

Each task's verification gate is:
1. `npm run typecheck` → clean.
2. `npm run lint` → clean (no new warnings).
3. After each migration phase: `npm run build` → succeeds.
4. **Manual smoke** of the migrated surface (checklist in Task 13). The executor should run `npm run dev` and exercise at least one dialog and one filter per phase.

---

## File Structure

**Create:**
- `lib/hooks/use-server-action.ts` — submit + error + pending + optional refresh.
- `lib/hooks/use-disclosure.ts` — open/onOpenChange + remount key.
- `lib/hooks/use-form-fields.ts` — object form state + typed `set`.
- `lib/hooks/use-url-filters.ts` — searchParam read/write with page-reset.
- `lib/hooks/use-debounced-search-param.ts` — debounced text → searchParam.
- `lib/hooks/index.ts` — barrel (`"use client"` re-exports).
- `components/form-field.tsx` — shared `Field` (label + children + error).

**Modify (consumers, grouped by phase):** ~17 dialogs, 3 confirm/alert dialogs, up to 3 sheets, 5 filters. Enumerated in Tasks 5–12.

---

## Task 1: Scaffold the hooks directory with `useServerAction`

**Files:**
- Create: `lib/hooks/use-server-action.ts`

- [ ] **Step 1: Write the hook**

```ts
"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { ActionResult } from "@/lib/projects/schemas"

export type UseServerActionOptions<TData> = {
  /** Called with the action's `data` on success, before the optional refresh. */
  onSuccess?: (data: TData) => void
  /** Call router.refresh() on success. Default true. Set false where the
   *  component relies solely on the action's revalidatePath. */
  refresh?: boolean
}

/**
 * Wraps the "call a server action inside a transition, surface its
 * {ok,error,field} result, refresh on success" pattern used by every dialog.
 *
 * `run(args)` clears prior errors, runs the action, and on failure sets
 * errorMsg/errorField. Components decide how to render those.
 */
export function useServerAction<TArgs, TData>(
  action: (args: TArgs) => Promise<ActionResult<TData>>,
  options: UseServerActionOptions<TData> = {},
) {
  const { onSuccess, refresh = true } = options
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)

  function run(args: TArgs) {
    setErrorMsg(null)
    setErrorField(null)
    startTransition(async () => {
      const result = await action(args)
      if (!result.ok) {
        setErrorMsg(result.error)
        setErrorField(result.field ?? null)
        return
      }
      onSuccess?.(result.data)
      if (refresh) router.refresh()
    })
  }

  return { run, isPending, errorMsg, errorField, setErrorMsg, setErrorField }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean (no errors).

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/use-server-action.ts
git commit -m "refactor(hooks): add useServerAction"
```

---

## Task 2: Add `useDisclosure`, `useFormFields`

**Files:**
- Create: `lib/hooks/use-disclosure.ts`
- Create: `lib/hooks/use-form-fields.ts`

- [ ] **Step 1: Write `use-disclosure.ts`**

```ts
"use client"

import { useState } from "react"

/**
 * Open/close state for a dialog or sheet. `contentKey` remounts the body on
 * each open so internal form state resets — matches the existing
 * `key={open ? "open" : "closed"}` idiom. Works for both controlled dialogs
 * and DialogTrigger-based ones (spread the key onto whichever owns it).
 */
export function useDisclosure(initial = false) {
  const [open, setOpen] = useState(initial)
  return {
    open,
    setOpen,
    onOpenChange: setOpen,
    contentKey: open ? "open" : "closed",
  }
}
```

- [ ] **Step 2: Write `use-form-fields.ts`**

```ts
"use client"

import { useState } from "react"

/**
 * Object-shaped form state with a typed field setter. Drop-in for the
 * `const [form, setForm] = useState<FormState>(...)` + generic `set<K>` helper
 * pasted across the dialogs. Returns a tuple: [values, set, setValues].
 */
export function useFormFields<T extends Record<string, unknown>>(initial: T) {
  const [values, setValues] = useState<T>(initial)
  function set<K extends keyof T>(key: K, value: T[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }
  return [values, set, setValues] as const
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add lib/hooks/use-disclosure.ts lib/hooks/use-form-fields.ts
git commit -m "refactor(hooks): add useDisclosure and useFormFields"
```

---

## Task 3: Add `useUrlFilters` and `useDebouncedSearchParam`

**Files:**
- Create: `lib/hooks/use-url-filters.ts`
- Create: `lib/hooks/use-debounced-search-param.ts`

- [ ] **Step 1: Write `use-url-filters.ts`**

```ts
"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"

/**
 * Read/write URL search params for filter bars. `setParam`/`setParams` delete
 * the configured pagination keys (so changing a filter resets to page 1) and
 * navigate via router.replace with scroll:false inside a transition — the exact
 * behavior every *-filters.tsx currently hand-rolls.
 *
 * @param resetKeys pagination keys to clear on any change. Pass the SAME set the
 *   file currently deletes (e.g. ["page"] for ledger, ["page","moneyPage",
 *   "materialPage","unitsPage"] for the global financials bar).
 */
export function useUrlFilters(resetKeys: string[] = ["page"]) {
  const router = useRouter()
  const sp = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function get(key: string, fallback = ""): string {
    return sp.get(key) ?? fallback
  }

  function commit(next: URLSearchParams) {
    for (const k of resetKeys) next.delete(k)
    startTransition(() => {
      router.replace(`?${next.toString()}`, { scroll: false })
    })
  }

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString())
    next.set(key, value)
    commit(next)
  }

  /** Set multiple params; a null/"" value deletes the key. */
  function setParams(entries: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(entries)) {
      if (v === null || v === "") next.delete(k)
      else next.set(k, v)
    }
    commit(next)
  }

  return { sp, get, setParam, setParams, isPending }
}
```

- [ ] **Step 2: Write `use-debounced-search-param.ts`**

```ts
"use client"

import { useEffect, useRef, useState } from "react"

export type UseDebouncedSearchParamOptions = {
  /** Initial input value (typically the current search param). */
  initial: string
  /** Push the (already-thresholded) value to the URL. Empty string clears. */
  apply: (value: string) => void
  /** Debounce delay in ms. Default 350. */
  delay?: number
  /** Minimum trimmed length before a value is applied; shorter clears. Default 2. */
  minLength?: number
}

/**
 * Debounced controlled search box bound to a URL param. Mirrors the ref-timer
 * pattern in ledger-filters: setState happens only in event handlers; the
 * effect does cleanup only (satisfies react-hooks/set-state-in-effect).
 */
export function useDebouncedSearchParam(opts: UseDebouncedSearchParamOptions) {
  const { initial, apply, delay = 350, minLength = 2 } = opts
  const [value, setValue] = useState(initial)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  function applyThresholded(next: string) {
    const trimmed = next.trim()
    apply(trimmed.length >= minLength ? trimmed : "")
  }

  function onChange(next: string) {
    setValue(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => applyThresholded(next), delay)
  }

  function flush() {
    if (timer.current) clearTimeout(timer.current)
    applyThresholded(value)
  }

  function clear() {
    if (timer.current) clearTimeout(timer.current)
    setValue("")
    apply("")
  }

  return { value, onChange, flush, clear }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add lib/hooks/use-url-filters.ts lib/hooks/use-debounced-search-param.ts
git commit -m "refactor(hooks): add useUrlFilters and useDebouncedSearchParam"
```

---

## Task 4: Add the hooks barrel and shared `Field`

**Files:**
- Create: `lib/hooks/index.ts`
- Create: `components/form-field.tsx`

- [ ] **Step 1: Write the barrel `lib/hooks/index.ts`**

```ts
"use client"

export { useServerAction } from "./use-server-action"
export type { UseServerActionOptions } from "./use-server-action"
export { useDisclosure } from "./use-disclosure"
export { useFormFields } from "./use-form-fields"
export { useUrlFilters } from "./use-url-filters"
export {
  useDebouncedSearchParam,
  type UseDebouncedSearchParamOptions,
} from "./use-debounced-search-param"
```

- [ ] **Step 2: Write `components/form-field.tsx`** (lifted verbatim from the dialogs' local `Field`)

```tsx
import { Label } from "@/components/ui/label"

export function Field({
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

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add lib/hooks/index.ts components/form-field.tsx
git commit -m "refactor(hooks): add hooks barrel and shared Field component"
```

---

## Migration Recipe (applies to Tasks 5–9)

For every form-dialog file, apply this transformation. **Read the file first**, then:

1. **Imports:** remove `useState`/`useTransition` from `react` if now unused; remove `useRouter` from `next/navigation` if now unused. Add `import { useServerAction, useFormFields, useDisclosure } from "@/lib/hooks"` (only the ones used). Add `import { Field } from "@/components/form-field"`. Delete the file-local `function Field(...)`.
2. **Disclosure:** in the `*Button` wrapper, replace `const [open, setOpen] = useState(false)` + `key={open ? "open" : "closed"}` with `const { open, onOpenChange, contentKey } = useDisclosure()`, `onClick={() => onOpenChange(true)}`, and `key={contentKey}`. For `DialogTrigger`-style files (e.g. money-transfer), put `key={contentKey}` on the same element that currently has the `key`.
3. **Form state:** replace `const [form, setForm] = useState<FormState>(initial)` + local `set<K>` with `const [form, set] = useFormFields<FormState>(initial)`. (Files that use one `useState` per field — money/material transfer — MAY keep individual state; converting is optional and must not change behavior. Prefer leaving them if conversion is noisy.)
4. **Action call:** replace the `useTransition` + `errorMsg`/`errorField` + `handleSubmit` block with:
   ```tsx
   const { run, isPending, errorMsg, errorField } = useServerAction(actionFn, {
     onSuccess: () => onOpenChange(false),
     // refresh: false,  // ONLY if the original had no router.refresh() (e.g. money-transfer)
   })
   ```
   and change the submit handler to call `run({ ...payload })` with the identical payload object.
5. **Refresh flag:** if the original called `router.refresh()` on success → omit `refresh` (defaults true). If it did NOT (money-transfer relies on revalidatePath only) → pass `refresh: false`.
6. **Render:** unchanged except `Field` now comes from the import. Keep every label, placeholder, `disabled={isPending}`, error rendering branch identical.
7. **Verify:** `npm run typecheck` && `npm run lint` clean before commit.

> Do not "improve" copy, validation, or layout during migration. Behavior-identical only.

---

## Task 5: Migrate financials dialogs (the proof)

**Files (Modify):**
- `app/(authed)/projects/[id]/financials/add-expense-dialog.tsx`
- `app/(authed)/projects/[id]/financials/add-income-dialog.tsx`

- [ ] **Step 1: Migrate `add-expense-dialog.tsx` per the recipe.** Resulting `AddExpenseDialog` body should read approximately:

```tsx
function AddExpenseDialog({ open, onOpenChange, projectId }: {
  open: boolean
  onOpenChange: (next: boolean) => void
  projectId: string
}) {
  const [form, set] = useFormFields<FormState>({
    amount: "",
    description: "",
    occurredAt: isoDateToday(),
    notes: "",
  })
  const { run, isPending, errorMsg, errorField } = useServerAction(
    createAdhocExpense,
    { onSuccess: () => onOpenChange(false) },
  )

  function handleSubmit() {
    run({
      projectId,
      amount: form.amount,
      description: form.description,
      occurredAt: form.occurredAt,
      notes: form.notes,
    })
  }
  // ...JSX unchanged; <Field> now imported; error branches use errorMsg/errorField...
}
```
And `AddExpenseButton` uses `useDisclosure()` for `open`/`onOpenChange`/`contentKey`.

- [ ] **Step 2: Migrate `add-income-dialog.tsx`** identically (its `FormState` additionally has `buyerName`; payload includes `buyerName: form.buyerName`).

- [ ] **Step 3: Verify**

Run: `npm run typecheck` then `npm run lint`
Expected: both clean.

- [ ] **Step 4: Manual smoke**

Run `npm run dev`, open a project's Financials, add an expense and an income (incl. a deliberate validation error to confirm `errorField` still highlights the right field). Confirm the ledger refreshes.

- [ ] **Step 5: Commit**

```bash
git add app/(authed)/projects/[id]/financials/add-expense-dialog.tsx app/(authed)/projects/[id]/financials/add-income-dialog.tsx
git commit -m "refactor(financials): migrate add-expense/add-income to client hooks"
```

> **REVIEW CHECKPOINT.** Stop here for human review of the hook ergonomics before rolling out the remaining ~20 files. Adjust hook APIs now if anything is awkward.

---

## Task 6: Migrate catalog + project-level dialogs

**Files (Modify)** — apply the recipe to each:
- `app/(authed)/catalog/new-material-dialog.tsx`
- `app/(authed)/catalog/edit-material-dialog.tsx`
- `app/(authed)/projects/new-project-dialog.tsx`
- `app/(authed)/projects/[id]/edit-project-dialog.tsx`
- `app/(authed)/projects/[id]/expand-capacity-dialog.tsx`
- `app/(authed)/projects/[id]/add-capital-dialog.tsx`

- [ ] **Step 1:** Migrate each file per the recipe. Read each first; preserve its exact payload, validation copy, and whether it called `router.refresh()`.
- [ ] **Step 2:** `npm run typecheck` && `npm run lint` → clean.
- [ ] **Step 3:** Commit: `git commit -m "refactor(catalog,projects): migrate dialogs to client hooks"`

---

## Task 7: Migrate materials dialogs

**Files (Modify):**
- `app/(authed)/projects/[id]/materials/add-material-dialog.tsx`
- `app/(authed)/projects/[id]/materials/record-purchase-dialog.tsx`
- `app/(authed)/projects/[id]/materials/log-consumption-dialog.tsx`
- `app/(authed)/projects/[id]/materials/log-return-dialog.tsx`

- [ ] **Step 1:** Migrate each per the recipe. `record-purchase-dialog.tsx` has 2 transitions per the earlier scan — check whether one is non-action (e.g. a secondary async). Only wrap the server-action submit(s) with `useServerAction`; leave any non-action transition as-is.
- [ ] **Step 2:** `npm run typecheck` && `npm run lint` → clean.
- [ ] **Step 3:** Commit: `git commit -m "refactor(materials): migrate dialogs to client hooks"`

---

## Task 8: Migrate inventory dialogs

**Files (Modify):**
- `app/(authed)/projects/[id]/inventory/edit-unit-dialog.tsx`
- `app/(authed)/projects/[id]/inventory/mark-sold-dialog.tsx`

- [ ] **Step 1:** Migrate per the recipe.
- [ ] **Step 2:** `npm run typecheck` && `npm run lint` → clean.
- [ ] **Step 3:** Commit: `git commit -m "refactor(inventory): migrate dialogs to client hooks"`

---

## Task 9: Migrate transfers dialogs (edge cases)

**Files (Modify):**
- `app/(authed)/transfers/money-transfer-dialog.tsx`
- `app/(authed)/transfers/material-transfer-dialog.tsx`
- `app/(authed)/transfers/reverse-transfer-dialog.tsx`

- [ ] **Step 1:** Migrate per the recipe, with these specifics:
  - `money-transfer-dialog.tsx`: success path is `onDone()` with **no** `router.refresh()` → pass `refresh: false`. Keep the `DialogTrigger` structure; put `key={contentKey}` on the `<Dialog>` element. The form uses individual `useState` fields — keep them (do not force `useFormFields`); only the submit/error block changes to `useServerAction`. The error render concatenates `errorField` into the message — preserve that exact rendering.
  - `material-transfer-dialog.tsx`: same shape as money-transfer; preserve its refresh behavior (match whatever the current code does).
  - `reverse-transfer-dialog.tsx`: confirm whether it refreshes; preserve.
- [ ] **Step 2:** `npm run typecheck` && `npm run lint` → clean.
- [ ] **Step 3:** Manual smoke: run a money transfer and confirm both projects' balances update (revalidatePath path still works without an explicit refresh).
- [ ] **Step 4:** Commit: `git commit -m "refactor(transfers): migrate dialogs to client hooks"`

---

## Task 10: Migrate confirm / alert dialogs

**Files (Modify):**
- `app/(authed)/projects/[id]/financials/void-confirm-dialog.tsx`
- `app/(authed)/projects/[id]/financials/reverse-confirm-dialog.tsx`
- `app/(authed)/projects/[id]/inventory/unmark-confirm-dialog.tsx`

These use `AlertDialog` and a `confirm()` handler with **`errorMsg` only** (no field). Use `useServerAction` for the transition + error; ignore `errorField`.

- [ ] **Step 1:** Migrate each. Specifics:
  - `void-confirm-dialog.tsx`: replace the transition/errorMsg/confirm block with `const { run, isPending, errorMsg } = useServerAction(voidTransaction, { onSuccess: () => onOpenChange(false) })`; `confirm()` becomes `run({ transactionId })`. JSX unchanged.
  - `reverse-confirm-dialog.tsx`: keep the individual `useState` for `occurredAt`/`notes`/`andUnstock` and the `showStockCheckbox` logic exactly. Only the transition/errorMsg/confirm block becomes `useServerAction(reverseTransaction, { onSuccess: () => onOpenChange(false) })`; `confirm()` becomes `run({ transactionId, occurredAt, notes, andUnstock: showStockCheckbox ? andUnstock : false })`.
  - `unmark-confirm-dialog.tsx`: same pattern as void.
- [ ] **Step 2:** `npm run typecheck` && `npm run lint` → clean.
- [ ] **Step 3:** Commit: `git commit -m "refactor(dialogs): migrate confirm dialogs to useServerAction"`

---

## Task 11: Migrate sheets to `useDisclosure` (where applicable)

**Files (Modify) — read each first; migrate ONLY if it has the `open` + remount-key pattern:**
- `app/(authed)/components/history-sheet.tsx`
- `app/(authed)/components/drilldown-sheet.tsx`
- `app/(authed)/projects/[id]/materials/movements-sheet.tsx`

- [ ] **Step 1:** For each sheet that owns its open state via `useState(false)` + `key={open ? ...}`, swap to `useDisclosure()`. If a sheet is fully controlled by a parent (no internal open state), skip it and note so.
- [ ] **Step 2:** `npm run typecheck` && `npm run lint` → clean.
- [ ] **Step 3:** Commit: `git commit -m "refactor(sheets): adopt useDisclosure"`

---

## Task 12: Migrate filters to `useUrlFilters` / `useDebouncedSearchParam`

**Files (Modify):**
- `app/(authed)/financials/global-filters.tsx`
- `app/(authed)/projects/[id]/financials/ledger-filters.tsx`
- `app/(authed)/projects/[id]/inventory/inventory-filters.tsx`
- `app/(authed)/audit/audit-filters.tsx`
- `app/(authed)/projects/project-filters.tsx`

- [ ] **Step 1:** Migrate each. **Critical:** preserve each file's exact `resetKeys`:
  - `global-filters.tsx` → `useUrlFilters(["page", "moneyPage", "materialPage", "unitsPage"])`. Replace its `setParam` with the hook's; `from`/`to` reads become `get("from", defaultFrom)` etc.
  - `ledger-filters.tsx` → `useUrlFilters(["page"])` for the chip/date params, AND `useDebouncedSearchParam({ initial: get("search"), apply: (v) => setParams({ search: v || null }), delay: 350, minLength: 2 })` for the search box. Wire the input to `value`/`onChange`/`flush` (Enter)/`clear` (✕ button). Confirm the cleanup-only effect remains (lint rule).
  - `inventory-filters.tsx`, `audit-filters.tsx`, `project-filters.tsx` → read each, pass the SAME keys its current `setParam` deletes. If one has a debounced search, use `useDebouncedSearchParam`; otherwise just `useUrlFilters`.
- [ ] **Step 2:** `npm run typecheck` && `npm run lint` → clean.
- [ ] **Step 3:** Manual smoke: on the ledger, type a 1-char search (no navigation), 2+ chars (debounced replace, page resets), Enter (immediate), ✕ (clears). On global financials, change a date and confirm all four page keys reset.
- [ ] **Step 4:** Commit: `git commit -m "refactor(filters): adopt useUrlFilters and useDebouncedSearchParam"`

---

## Task 13: Final verification and cleanup

**Files:** none (verification + optional sweep).

- [ ] **Step 1: Confirm no orphaned boilerplate remains.** Grep should return only the new hook files / intentional keepers:
  ```bash
  rg "key=\{open \? \"open\" : \"closed\"\}" app   # expect: 0 (all via useDisclosure)
  rg "function Field\(\{" app                       # expect: 0 (all import shared Field)
  rg "new URLSearchParams\(sp\.toString\(\)\)" app  # expect: 0 (all via useUrlFilters)
  ```
  Any remaining hit must be a deliberately-skipped file noted in its task; otherwise migrate it.
- [ ] **Step 2:** `npm run typecheck` → clean.
- [ ] **Step 3:** `npm run lint` → clean.
- [ ] **Step 4:** `npm run build` → succeeds.
- [ ] **Step 5: Full manual smoke checklist** (`npm run dev`):
  - [ ] Add expense + add income (validation error highlights field).
  - [ ] New material / new project / add capital dialogs submit and refresh.
  - [ ] A material purchase + consumption + return.
  - [ ] Mark-sold + unmark + void + reverse (reverse with the "undo stock" checkbox).
  - [ ] Money transfer updates both projects without an explicit refresh.
  - [ ] Ledger search debounce + Enter + clear; global date filter resets pagination.
  - [ ] A sheet (history/drilldown/movements) opens and its body resets on reopen.
- [ ] **Step 6: Commit any final touch-ups.**
  ```bash
  git commit -m "refactor(hooks): finalize client hooks extraction"
  ```

---

## Explicitly Out of Scope (do not do here)

- Adding a test runner (vitest/jest/RTL). Optional follow-up; flag if desired.
- `app/(authed)/settings/components.tsx` (4 transitions) and `app/login/sign-in-card.tsx` (1 transition): these are toggle/auth flows that do not return `ActionResult` in the dialog shape. Evaluate separately; do not force-fit `useServerAction`.
- Converting individual-`useState` forms (money/material transfer) to `useFormFields` — optional, only if it stays behavior-identical and reduces noise.
- Any copy, validation, layout, or revalidate-path change.

---

## Self-Review (completed by plan author)

- **Spec coverage:** All three requested hook families (server-action, URL filters, form fields) + the shared `Field` are created (Tasks 1–4) and every consumer group is migrated (Tasks 5–12). ✔
- **Placeholders:** Hook/Field/exemplar code is complete; bulk migrations reference a concrete recipe with per-file specifics rather than TBDs. ✔
- **Type consistency:** `run`, `isPending`, `errorMsg`, `errorField`, `contentKey`, `onOpenChange`, `get`, `setParam`, `setParams`, `value`/`onChange`/`flush`/`clear` names are used identically across the plan and match the hook signatures in Tasks 1–3. `ActionResult<T>` consumed, not redefined. ✔
- **Known risk:** `record-purchase-dialog.tsx` has 2 transitions and money/material transfer skip `router.refresh()`; Tasks 7 and 9 call these out so behavior is preserved. ✔
