# Phase 8 — CSV Exports + Ledger Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Mongo `$text` search input to the per-project ledger and ship CSV exports for the per-project ledger and the cross-project `/financials` totals.

**Architecture:** Search is a single `$text` index on `transactions` (description/buyerName/notes, weighted 10/5/1) that ANDs into the shared `buildLedgerMatch` filter — so the ledger AND the totals tiles narrow together. Exports are two new Route Handlers serving buffered CSV with RFC 4180 quoting + UTF-8 BOM; downloads are triggered by plain `<a href>` (no client fetch). Both routes enforce `requireAdmin()`.

**Tech Stack:** Next.js 16 App Router (RSC + Route Handlers), TypeScript, Tailwind v4 + shadcn/ui (`Button asChild`), Auth.js v5 beta, native `mongodb` driver, Zod.

**Spec:** [`docs/superpowers/specs/2026-05-18-phase-8-csv-exports-and-search-design.md`](../specs/2026-05-18-phase-8-csv-exports-and-search-design.md)

**Project conventions to respect:**
- Server-side enforcement first: every Route Handler begins with `await requireAdmin()`.
- No client-side fetch for protected data — exports use `<a href="/api/export/...">` so the session cookie travels natively.
- No automated test framework in the repo. Verification is via `npm run typecheck`, `npm run lint`, and the manual T-task checklist in Task 13.
- Frequent commits. Each task ends with a `git add` + `git commit` step.
- `.env` (not `.env.local`); `proxy.ts` (not `middleware.ts`); PowerShell is the primary shell but the Bash tool is preferred for `node` / `git` / `npm`.

---

## File Structure

**New files:**
- `lib/exports/csv.ts` — pure CSV encoder (`toCsvRow`, `toCsvFile`).
- `lib/transactions/filters.ts` — shared `parseLedgerFilters(sp)` used by the page and the export Route Handler.
- `app/api/export/ledger/route.ts` — admin-only ledger CSV download.
- `app/api/export/financials-totals/route.ts` — admin-only cross-project totals CSV download.

**Modified files:**
- `lib/transactions/schemas.ts` — `search?: string` on `LedgerFilters`.
- `lib/transactions/repository.ts` — `$text` composition in `buildLedgerMatch`.
- `scripts/init-db.mjs` — `transactions_text` index + console.log summary.
- `app/(authed)/projects/[id]/page.tsx` — switch to shared `parseLedgerFilters`, pass `search` through.
- `app/(authed)/projects/[id]/financials/ledger-filters.tsx` — search `<Input>` + debounced auto-apply + clear button.
- `app/(authed)/projects/[id]/financials/financials-view.tsx` — "Export CSV" anchor, active-search helper line, empty-search empty state.
- `app/(authed)/financials/page.tsx` — "Export totals CSV" anchor.

---

## Tasks

### Task 1: Shared CSV encoder

**Files:**
- Create: `lib/exports/csv.ts`

- [ ] **Step 1: Create `lib/exports/csv.ts` with the encoder**

```ts
/**
 * RFC 4180 CSV encoding helpers for buffered exports.
 *
 * Excel-friendly defaults:
 *  - CRLF line endings
 *  - UTF-8 BOM prepended in toCsvFile so non-ASCII text in description/notes
 *    renders correctly when the file is opened in Excel.
 *
 * `null` and `undefined` become empty cells. Booleans become "true"/"false".
 * Numbers go through String() so integers render without thousand separators.
 */

export type CsvValue = string | number | boolean | null | undefined

const NEEDS_QUOTING = /[",\r\n]/

function encodeCell(value: CsvValue): string {
  if (value === null || value === undefined) return ""
  const s = typeof value === "string" ? value : String(value)
  if (!NEEDS_QUOTING.test(s)) return s
  return `"${s.replace(/"/g, '""')}"`
}

export function toCsvRow(values: CsvValue[]): string {
  return values.map(encodeCell).join(",")
}

export function toCsvFile(
  headers: string[],
  rows: CsvValue[][],
): string {
  const lines = [toCsvRow(headers), ...rows.map(toCsvRow)]
  // U+FEFF (UTF-8 BOM) — must be the very first character of the response body
  // so Excel detects UTF-8 instead of the system codepage.
  return "﻿" + lines.join("\r\n")
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```
git add lib/exports/csv.ts
git commit -m "feat(phase-8): add RFC 4180 CSV encoder with UTF-8 BOM"
```

---

### Task 2: Extend `LedgerFilters` with `search`

**Files:**
- Modify: `lib/transactions/schemas.ts` — the `LedgerFilters` type (search the file for `export type LedgerFilters`).

- [ ] **Step 1: Add the `search` field**

Find:

```ts
export type LedgerFilters = {
  from: Date
  to: Date
  kind: LedgerKindFilter
  category: LedgerCategoryFilter
  includeVoided: boolean
}
```

Replace with:

```ts
export type LedgerFilters = {
  from: Date
  to: Date
  kind: LedgerKindFilter
  category: LedgerCategoryFilter
  includeVoided: boolean
  /**
   * Raw trimmed query string. Only applied when length >= 2; shorter values
   * (including empty string and undefined) are ignored by buildLedgerMatch.
   * Max length is enforced at the page layer (200 chars).
   */
  search?: string
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0. The new optional field cannot break existing call sites because every consumer simply omits it for now.

- [ ] **Step 3: Commit**

```
git add lib/transactions/schemas.ts
git commit -m "feat(phase-8): add optional search field to LedgerFilters"
```

---

### Task 3: Wire `$text` into `buildLedgerMatch`

**Files:**
- Modify: `lib/transactions/repository.ts` — the `buildLedgerMatch` helper (currently at lines 185–193).

This is the load-bearing change: `buildLedgerMatch` is shared by `listLedger` AND `computeTotals`, so adding `$text` here makes both the ledger rows and the totals tiles narrow when the user types. That preserves Phase 5's "what you see is what you sum" invariant.

- [ ] **Step 1: Replace the function**

Find:

```ts
function buildLedgerMatch(filters: LedgerFilters): Record<string, unknown> {
  const match: Record<string, unknown> = {
    occurredAt: { $gte: filters.from, $lte: endOfDay(filters.to) },
  }
  if (filters.kind !== "all") match.kind = filters.kind
  if (filters.category !== "all") match.category = filters.category
  if (!filters.includeVoided) match.voided = { $ne: true }
  return match
}
```

Replace with:

```ts
function buildLedgerMatch(filters: LedgerFilters): Record<string, unknown> {
  const match: Record<string, unknown> = {
    occurredAt: { $gte: filters.from, $lte: endOfDay(filters.to) },
  }
  if (filters.kind !== "all") match.kind = filters.kind
  if (filters.category !== "all") match.category = filters.category
  if (!filters.includeVoided) match.voided = { $ne: true }
  // Phase 8 — narrow the ledger AND totals when a search is active.
  // <2 chars is treated as no search so single-keystroke typing doesn't fire.
  const q = filters.search?.trim()
  if (q && q.length >= 2) match.$text = { $search: q }
  return match
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```
git add lib/transactions/repository.ts
git commit -m "feat(phase-8): compose text search into buildLedgerMatch"
```

---

### Task 4: Add the `transactions_text` index and run init-db

**Files:**
- Modify: `scripts/init-db.mjs`

- [ ] **Step 1: Add the index after the existing Phase 6 block**

Find the Phase 6 block (around the existing `transferGroupId` index creation) and append a new section AFTER all existing `createIndex` calls but BEFORE the `console.log` summary at the end of the file:

```js
// Phase 8 — ledger text search
await db.collection("transactions").createIndex(
  { description: "text", buyerName: "text", notes: "text" },
  {
    name: "transactions_text",
    weights: { description: 10, buyerName: 5, notes: 1 },
    default_language: "english",
  },
)
```

- [ ] **Step 2: Update the trailing `console.log` summary string**

Find the closing string in the `console.log` call. Concretely, change the last string piece from:

```js
"materialMovements.reversalOf sparse, materialMovements.transferGroupId sparse"
```

to:

```js
"materialMovements.reversalOf sparse, materialMovements.transferGroupId sparse; " +
  "transactions_text (description weight=10, buyerName=5, notes=1)"
```

- [ ] **Step 3: Run init-db against the dev DB**

Run: `node --env-file-if-exists=.env scripts/init-db.mjs`
Expected: script exits cleanly. The console.log includes `transactions_text`.

- [ ] **Step 4: Verify the index exists**

Open a Mongo shell or Compass against `wangredev` and confirm:

```js
db.transactions.getIndexes()
// look for a "transactions_text" entry with key { _fts: "text", _ftsx: 1 }
// and weights { description: 10, buyerName: 5, notes: 1 }
```

If you cannot open a shell, defer this check to T-index-1 in Task 13. The TypeScript / lint pipeline will not exercise this.

- [ ] **Step 5: Commit**

```
git add scripts/init-db.mjs
git commit -m "feat(phase-8): add transactions_text index for ledger search"
```

---

### Task 5: Shared `parseLedgerFilters(sp)` helper

The page and the (Task 9) Route Handler both need to translate `searchParams` into a `LedgerFilters` object using identical rules. Factor that out into a single module so the two stay in lockstep.

**Files:**
- Create: `lib/transactions/filters.ts`

- [ ] **Step 1: Inspect the current page's parsing logic for reference**

Read `app/(authed)/projects/[id]/page.tsx` to find how the existing filters are parsed today (look for where `from`, `to`, `kind`, `category`, `voided` are read out of `searchParams`). The new helper must produce filters that match the page's current behavior exactly — same defaults, same coercion — so the page can be cut over in Task 6 without changing observable behavior.

- [ ] **Step 2: Create the helper**

Write `lib/transactions/filters.ts`:

```ts
/**
 * Shared translator from URLSearchParams (or a plain { key: string | string[] | undefined })
 * into a parsed LedgerFilters object. Used by both the per-project financials
 * page and the /api/export/ledger Route Handler so they stay in lockstep.
 *
 * Date inputs are parsed as local-midnight (Y/M/D constructed manually) to match
 * the audit page's parseLocalDate fix from Phase 7 — `new Date("YYYY-MM-DD")` is
 * UTC midnight which shifts on the Mumbai server.
 */

import type { LedgerFilters } from "./schemas"
import {
  LedgerCategoryFilterSchema,
  LedgerKindFilterSchema,
  LedgerVoidedFilterSchema,
} from "./schemas"

export type ReadableSearchParams =
  | URLSearchParams
  | Record<string, string | string[] | undefined>

function getOne(sp: ReadableSearchParams, key: string): string | undefined {
  if (sp instanceof URLSearchParams) return sp.get(key) ?? undefined
  const v = sp[key]
  return Array.isArray(v) ? v[0] : v
}

function parseLocalDate(raw: string | undefined, fallback: Date): Date {
  if (!raw) return fallback
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!m) return fallback
  const [, y, mo, d] = m
  const out = new Date(Number(y), Number(mo) - 1, Number(d), 0, 0, 0, 0)
  return Number.isNaN(out.getTime()) ? fallback : out
}

export function defaultLedgerFrom(): Date {
  const d = new Date()
  d.setMonth(0, 1)
  d.setHours(0, 0, 0, 0)
  return d
}

export function defaultLedgerTo(): Date {
  const d = new Date()
  d.setMonth(11, 31)
  d.setHours(0, 0, 0, 0)
  return d
}

const MAX_SEARCH_LEN = 200

export function parseLedgerFilters(sp: ReadableSearchParams): LedgerFilters {
  const from = parseLocalDate(getOne(sp, "from"), defaultLedgerFrom())
  const to = parseLocalDate(getOne(sp, "to"), defaultLedgerTo())

  const kindParse = LedgerKindFilterSchema.safeParse(getOne(sp, "kind") ?? "all")
  const kind = kindParse.success ? kindParse.data : "all"

  const categoryParse = LedgerCategoryFilterSchema.safeParse(
    getOne(sp, "category") ?? "all",
  )
  const category = categoryParse.success ? categoryParse.data : "all"

  const voidedParse = LedgerVoidedFilterSchema.safeParse(
    getOne(sp, "voided") ?? "active",
  )
  const includeVoided = voidedParse.success && voidedParse.data === "all"

  const rawSearch = getOne(sp, "search")?.trim() ?? ""
  const search =
    rawSearch.length === 0 || rawSearch.length > MAX_SEARCH_LEN
      ? undefined
      : rawSearch

  return { from, to, kind, category, includeVoided, search }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```
git add lib/transactions/filters.ts
git commit -m "feat(phase-8): add shared parseLedgerFilters helper"
```

---

### Task 6: Cut the page over to the shared helper and pass `search` through

**Files:**
- Modify: `app/(authed)/projects/[id]/page.tsx`

- [ ] **Step 1: Read the current parsing block**

Read the file. Find the block that reads `from`, `to`, `kind`, `category`, `voided` from `searchParams` and constructs a `LedgerFilters` object. It also currently has its own default-date helpers.

- [ ] **Step 2: Replace the inline parsing with the shared helper**

Update the imports at the top of the file to add:

```ts
import {
  parseLedgerFilters,
  defaultLedgerFrom,
  defaultLedgerTo,
} from "@/lib/transactions/filters"
```

Replace the inline parsing with:

```ts
// `searchParams` in App Router 16+ is a Promise; await it first.
const sp = await searchParams

const filters = parseLedgerFilters(sp)
const defaultFromIso = isoDate(defaultLedgerFrom())
const defaultToIso = isoDate(defaultLedgerTo())
```

Keep (or define) the existing `isoDate(date)` helper in the file:

```ts
function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
```

- [ ] **Step 3: Make sure the existing `listLedger` / `computeTotals` calls receive `filters` unchanged**

`filters` already carries `search` (possibly undefined). Both repo functions ignore it via Task 3's `buildLedgerMatch` guard when search is empty.

- [ ] **Step 4: Delete the now-unused local default-date helpers**

If the file previously defined its own `startOfYear` / `endOfYear` / `parseDate`, delete them. The shared module is the single source of truth now.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```
git add app/\(authed\)/projects/\[id\]/page.tsx
git commit -m "refactor(phase-8): route per-project page through shared parseLedgerFilters"
```

---

### Task 7: Search `<Input>` with debounced auto-apply and clear button

**Files:**
- Modify: `app/(authed)/projects/[id]/financials/ledger-filters.tsx`

- [ ] **Step 1: Read the current ledger-filters.tsx**

Read the file. It is a "use client" component that reads each filter from `useSearchParams()` and writes back via `router.replace` on every change (immediate-apply). The new search input follows the same URL-sync pattern but adds a debounce so we don't fire Mongo queries on every keystroke.

- [ ] **Step 2: Add the search input and debounce hook**

At the top of the component file, ensure these imports exist (add what's missing):

```ts
import { useEffect, useRef, useState } from "react"
```

Inside `LedgerFilters()`, alongside the existing const declarations, add:

```tsx
const initialSearch = sp.get("search") ?? ""
const [searchValue, setSearchValue] = useState(initialSearch)
const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

// Re-sync local state if the URL changes externally (e.g. browser back button).
useEffect(() => {
  setSearchValue(sp.get("search") ?? "")
}, [sp])

function applySearch(next: string) {
  const trimmed = next.trim()
  const params = new URLSearchParams(sp.toString())
  if (trimmed.length >= 2) params.set("search", trimmed)
  else params.delete("search")
  startTransition(() => {
    router.replace(`?${params.toString()}`, { scroll: false })
  })
}

function onSearchChange(next: string) {
  setSearchValue(next)
  if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
  debounceTimerRef.current = setTimeout(() => applySearch(next), 350)
}

function flushSearch() {
  if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
  applySearch(searchValue)
}

function clearSearch() {
  if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
  setSearchValue("")
  applySearch("")
}

// Clean up the timer on unmount so a debounced fire after navigation is a no-op.
useEffect(() => {
  return () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
  }
}, [])
```

Add the JSX just before the chip groups:

```tsx
<div className="flex flex-col gap-1.5">
  <Label htmlFor="search">Search</Label>
  <div className="relative flex w-full sm:w-72">
    <Input
      id="search"
      type="search"
      placeholder="description, buyer, notes..."
      value={searchValue}
      maxLength={200}
      onChange={(e) => onSearchChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          flushSearch()
        }
      }}
    />
    {searchValue.length > 0 ? (
      <button
        type="button"
        aria-label="Clear search"
        onClick={clearSearch}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        x
      </button>
    ) : null}
  </div>
</div>
```

If `startTransition` is not already destructured from `useTransition()` in this file, change the existing `const [, startTransition] = useTransition()` so we can also disable the input while a navigation is in flight (optional polish).

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0. Pay special attention to the React 19 `react-hooks/set-state-in-effect` rule — the `useEffect` that re-syncs `setSearchValue(sp.get("search") ?? "")` is a setState-in-effect call. If the linter flags it, defer the setState the way Phase 7's HistoryBody loading state does:

```tsx
useEffect(() => {
  const next = sp.get("search") ?? ""
  void Promise.resolve().then(() => setSearchValue(next))
}, [sp])
```

- [ ] **Step 4: Smoke test in the browser**

Run: `npm run dev`
Visit `/projects/<id>` financials tab. Type one character → no URL change. Type a second → after ~350ms `?search=ab` appears. The ledger rows narrow; the totals tiles narrow with them.

- [ ] **Step 5: Commit**

```
git add app/\(authed\)/projects/\[id\]/financials/ledger-filters.tsx
git commit -m "feat(phase-8): debounced search input + clear button in ledger filters"
```

---

### Task 8: Search UX polish on the ledger view

**Files:**
- Modify: `app/(authed)/projects/[id]/financials/financials-view.tsx`
- Modify: `app/(authed)/projects/[id]/page.tsx` (one-line prop pass)

- [ ] **Step 1: Receive `search` as a prop and surface its state**

Add `search?: string` to the `FinancialsView` props type. In the parent (page.tsx), pass `search={filters.search}` to `<FinancialsView ... />`.

- [ ] **Step 2: Render the active-search line above the ledger table**

Inside `FinancialsView`'s JSX, immediately above where the ledger table is mounted, add:

```tsx
{search ? (
  <p className="text-sm text-muted-foreground">
    Showing matches for <span className="font-medium text-foreground">&quot;{search}&quot;</span>
    {" — "}use the search input above to refine or clear.
  </p>
) : null}
```

The actual clear control lives in the filter component (Task 7). Phrase the helper this way to avoid duplicating click-handling logic across components.

- [ ] **Step 3: Improve the empty-results message when search is active**

If the file currently renders something like "No transactions in this window" when `rows.length === 0`, replace that block with:

```tsx
{rows.length === 0 ? (
  <p className="rounded border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
    {search
      ? "No transactions match your search."
      : "No transactions in this window."}
  </p>
) : (
  <LedgerTable /* existing props */ />
)}
```

Preserve any existing props passed to `LedgerTable`. Only the surrounding empty-state branch changes.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```
git add app/\(authed\)/projects/\[id\]/page.tsx app/\(authed\)/projects/\[id\]/financials/financials-view.tsx
git commit -m "feat(phase-8): surface active-search line and search-aware empty state"
```

---

### Task 9: Ledger CSV Route Handler

**Files:**
- Create: `app/api/export/ledger/route.ts`

- [ ] **Step 1: Create the handler**

```ts
import { NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { requireAdmin } from "@/lib/auth/session"
import { getDb } from "@/lib/db/client"
import { listLedger } from "@/lib/transactions/repository"
import { parseLedgerFilters } from "@/lib/transactions/filters"
import { toCsvFile } from "@/lib/exports/csv"
import type { Transaction } from "@/lib/transactions/schemas"

export const dynamic = "force-dynamic"

const LEDGER_CSV_HEADERS = [
  "_id",
  "projectId",
  "projectName",
  "occurredAt",
  "kind",
  "category",
  "amount",
  "description",
  "buyerName",
  "notes",
  "voided",
  "reversalOf",
  "transferGroupId",
  "createdAt",
  "createdBy",
] as const

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function projectSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "project"
  )
}

function rowToCsv(t: Transaction, projectName: string) {
  return [
    t._id.toHexString(),
    t.projectId.toHexString(),
    projectName,
    isoDate(t.occurredAt),
    t.kind,
    t.category,
    t.amount,
    t.description,
    t.buyerName ?? "",
    t.notes ?? "",
    t.voided === true,
    t.reversalOf ? t.reversalOf.toHexString() : "",
    t.transferGroupId ? t.transferGroupId.toHexString() : "",
    t.createdAt.toISOString(),
    t.createdBy.toHexString(),
  ]
}

export async function GET(req: Request) {
  await requireAdmin()

  const url = new URL(req.url)
  const projectIdParam = url.searchParams.get("projectId") ?? ""
  if (!ObjectId.isValid(projectIdParam)) {
    return NextResponse.json({ error: "invalid projectId" }, { status: 400 })
  }
  const projectId = new ObjectId(projectIdParam)

  const filters = parseLedgerFilters(url.searchParams)

  const db = getDb()
  const project = await db
    .collection<{ _id: ObjectId; name: string }>("projects")
    .findOne({ _id: projectId }, { projection: { name: 1 } })

  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 })
  }

  const rows = await listLedger(projectId, filters)

  const csv = toCsvFile(
    [...LEDGER_CSV_HEADERS],
    rows.map((r) => rowToCsv(r, project.name)),
  )

  const filename = `ledger-${projectSlug(project.name)}-${isoDate(filters.from)}-${isoDate(filters.to)}.csv`

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // never cache an admin-only export
      "Cache-Control": "no-store",
    },
  })
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`
With an admin session active, visit (substitute a real project hex):

```
http://localhost:3000/api/export/ledger?projectId=<24-hex>&from=2026-01-01&to=2026-12-31
```

Expected: the browser starts downloading `ledger-<slug>-2026-01-01-2026-12-31.csv`. Open it: header row + one row per visible transaction.

- [ ] **Step 4: Commit**

```
git add app/api/export/ledger/route.ts
git commit -m "feat(phase-8): add admin-only /api/export/ledger Route Handler"
```

---

### Task 10: "Export CSV" button on the ledger view

**Files:**
- Modify: `app/(authed)/projects/[id]/financials/financials-view.tsx`
- Modify: `app/(authed)/projects/[id]/page.tsx`

- [ ] **Step 1: Compute the export href in the page**

In `app/(authed)/projects/[id]/page.tsx`, alongside other prop computation:

```ts
const exportParams = new URLSearchParams()
exportParams.set("projectId", id) // route param
exportParams.set("from", isoDate(filters.from))
exportParams.set("to", isoDate(filters.to))
if (filters.kind !== "all") exportParams.set("kind", filters.kind)
if (filters.category !== "all") exportParams.set("category", filters.category)
exportParams.set("voided", filters.includeVoided ? "all" : "active")
if (filters.search) exportParams.set("search", filters.search)
const ledgerExportHref = `/api/export/ledger?${exportParams.toString()}`
```

Pass to the view:

```tsx
<FinancialsView
  /* existing props */
  ledgerExportHref={ledgerExportHref}
/>
```

- [ ] **Step 2: Add the anchor in `financials-view.tsx`**

Add `ledgerExportHref: string` to the `FinancialsView` props type. Inside the header strip that contains AddIncomeButton / AddExpenseButton / MoneyTransferButton, append:

```tsx
<Button asChild variant="outline" size="sm">
  <a href={ledgerExportHref} download>
    Export CSV
  </a>
</Button>
```

If the existing button row uses different sizes/variants, match them.

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`. Visit `/projects/<id>` financials tab. Click "Export CSV". File downloads with the active filters. Apply a kind filter, click again — the second file's contents match the visible rows.

- [ ] **Step 5: Commit**

```
git add app/\(authed\)/projects/\[id\]/page.tsx app/\(authed\)/projects/\[id\]/financials/financials-view.tsx
git commit -m "feat(phase-8): Export CSV button on per-project ledger"
```

---

### Task 11: Totals CSV Route Handler

**Files:**
- Create: `app/api/export/financials-totals/route.ts`

- [ ] **Step 1: Create the handler**

```ts
import { requireAdmin } from "@/lib/auth/session"
import { listCrossProjectTotals } from "@/lib/transactions/repository"
import { toCsvFile } from "@/lib/exports/csv"

export const dynamic = "force-dynamic"

const TOTALS_CSV_HEADERS = [
  "projectId",
  "projectName",
  "revenue",
  "expenses",
  "net",
  "transfersIn",
  "transfersOut",
] as const

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function parseLocalDate(raw: string | null, fallback: Date): Date {
  if (!raw) return fallback
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!m) return fallback
  const [, y, mo, d] = m
  return new Date(Number(y), Number(mo) - 1, Number(d), 0, 0, 0, 0)
}

function defaultFrom(): Date {
  const d = new Date()
  d.setMonth(0, 1)
  d.setHours(0, 0, 0, 0)
  return d
}

function defaultTo(): Date {
  const d = new Date()
  d.setMonth(11, 31)
  d.setHours(0, 0, 0, 0)
  return d
}

export async function GET(req: Request) {
  await requireAdmin()

  const url = new URL(req.url)
  const from = parseLocalDate(url.searchParams.get("from"), defaultFrom())
  const to = parseLocalDate(url.searchParams.get("to"), defaultTo())

  const { overall, perProject } = await listCrossProjectTotals({ from, to })

  const rows = perProject.map((p) => [
    p.projectId,
    p.projectName,
    p.revenue,
    p.expenses,
    p.net,
    p.transfersIn,
    p.transfersOut,
  ])

  rows.push([
    "",
    "OVERALL",
    overall.revenue,
    overall.expenses,
    overall.net,
    overall.transfersIn,
    overall.transfersOut,
  ])

  const csv = toCsvFile([...TOTALS_CSV_HEADERS], rows)
  const filename = `financials-totals-${isoDate(from)}-${isoDate(to)}.csv`

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`. Visit `/api/export/financials-totals?from=2026-01-01&to=2026-12-31` while logged in as admin. File downloads. Open it: header row + one row per project + a final OVERALL row.

- [ ] **Step 4: Commit**

```
git add app/api/export/financials-totals/route.ts
git commit -m "feat(phase-8): add admin-only /api/export/financials-totals Route Handler"
```

---

### Task 12: "Export totals CSV" button on `/financials`

**Files:**
- Modify: `app/(authed)/financials/page.tsx`

- [ ] **Step 1: Add the anchor in the page header**

Find the `<header>` block at the top of the page. Replace it with:

```tsx
<header className="flex items-start justify-between gap-3">
  <div>
    <h1 className="text-2xl font-semibold tracking-tight">Financials</h1>
    <p className="text-sm text-muted-foreground">
      Cross-project revenue, expenses, and net across the filter window.
    </p>
  </div>
  <Button asChild variant="outline" size="sm">
    <a
      href={`/api/export/financials-totals?from=${isoDate(from)}&to=${isoDate(to)}`}
      download
    >
      Export totals CSV
    </a>
  </Button>
</header>
```

Add the `Button` import at the top:

```ts
import { Button } from "@/components/ui/button"
```

`isoDate`, `from`, `to` are already defined in scope of `GlobalFinancialsPage`. No other new imports.

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`. Visit `/financials`. The "Export totals CSV" button appears in the header. Click it → CSV downloads. Adjust the date filter, click again → second file reflects the new range.

- [ ] **Step 4: Commit**

```
git add app/\(authed\)/financials/page.tsx
git commit -m "feat(phase-8): Export totals CSV button on /financials"
```

---

### Task 13: Manual T-task verification

No code changes. Walk through every T-task from the spec. Mark each done or note the failure in this checklist. Do not merge to master if any T-task fails.

**Setup:**
- Dev server running (`npm run dev`).
- Logged in as admin (`btechy4@gmail.com`).
- Open Mongo Compass / shell connection to `wangredev`.
- Have a project with at least 10 transactions, including: ad-hoc income with a buyer name, a sale, a purchase, a voided ad-hoc, a reversed ad-hoc, and a transfer leg.

**Search:**

- [ ] **T-index-1** — In Compass: `db.transactions.getIndexes()` shows `transactions_text` with weights `{ description: 10, buyerName: 5, notes: 1 }`.
- [ ] **T-index-2** — In Compass: `db.transactions.dropIndex("transactions_text")`. Visit the ledger, type a search → Mongo throws `text index required` and the page shows an unhandled error (expected). Recreate by re-running `node --env-file-if-exists=.env scripts/init-db.mjs`.
- [ ] **T-search-1** — Per-project ledger: type a substring of a known `description`. URL gains `?search=...`. Table narrows to matching rows.
- [ ] **T-search-2** — Combine search with date range, kind=expense, category=purchase, and voided=all. The ANDed filter behaves correctly. Linked-material chips from Phase 7 still appear on the matching purchase rows.
- [ ] **T-search-3** — Type one character: no URL change after 350ms. Type a second: URL updates.
- [ ] **T-search-4** — Click the clear button in the search input: input clears, URL drops `search`. Backspace the input to empty: same.
- [ ] **T-search-5** — With search active and several matches in different months, rows are sorted newest-first by `occurredAt` (NOT by text score).
- [ ] **T-search-6** — Paste a 201-character string: the input itself caps via `maxLength={200}`. Manually appending `?search=<201 chars>` to the URL is treated as no search by `parseLedgerFilters` (the param is dropped).

**Exports:**

- [ ] **T-export-1** — Click "Export CSV". File saves as `ledger-<projectSlug>-<from>-<to>.csv`. Open in Excel: a transaction whose `description` contains a non-ASCII character renders correctly (BOM verified).
- [ ] **T-export-2** — Apply filters (date + kind + search). Click export. Row count in the CSV body equals the row count shown in the table.
- [ ] **T-export-3** — Set "Include voided". Export. Open the CSV. The `voided` column is `true` for previously-voided rows; the `reversalOf` column is populated for reversal rows.
- [ ] **T-export-4** — Open the ledger CSV in Excel. The `_id` and `projectId` columns appear as text (not scientific notation). If Excel coerces them, document a workaround (Data > From Text/CSV import with column type = Text).
- [ ] **T-export-5** — Visit `/financials`. Click "Export totals CSV". File contains one row per project + final `OVERALL` row. The numeric columns match the on-screen tiles for the same date range.
- [ ] **T-export-6** — Log in as a floor manager. Hit `/api/export/ledger?projectId=...` and `/api/export/financials-totals?...` directly via the URL bar. Both should redirect (per `requireAdmin()`'s behavior) or 401 — confirm whichever the helper does.
- [ ] **T-export-7** — Manually craft a transaction whose `description` contains a comma, a double-quote, and a literal newline (via the existing add-income dialog if it accepts those; otherwise insert via a Mongo shell). Export. Re-open in Excel: the value is intact, the row count is unaffected.

**Wrap-up:**

- [ ] **Step 1: Run lint + typecheck once more across the whole branch**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 2: Update MEMORY.md if any non-obvious gotcha surfaced**

If any T-task revealed a project-specific quirk worth remembering (e.g. an Excel hex-coercion workaround we now rely on), add a feedback memory at `C:\Users\simra\.claude\projects\e--projects-developer-management\memory\` and index it in `MEMORY.md`.

- [ ] **Step 3: Final commit / branch tag**

If verification surfaced no fixes, no additional commit is needed. If fixes were committed during verification, they should each be their own commit referencing the T-task number they addressed.

---

## Self-review notes (for the plan author)

- Spec coverage: every spec section maps to at least one task. Search index → Task 4; `buildLedgerMatch` integration → Task 3; LedgerFilters extension → Task 2; shared parseLedgerFilters → Task 5; page cutover → Task 6; search input → Task 7; helper text + empty state → Task 8; ledger Route Handler → Task 9; ledger export button → Task 10; totals Route Handler → Task 11; totals export button → Task 12; T-task checklist → Task 13.
- Convention coverage: `requireAdmin()` first line in both Route Handlers (Tasks 9, 11). No client-side fetch — both exports use `<a href>`. No mutations, so no `revalidatePath` calls (intentional). No new server actions, so no `ActionResult<T>` shape needed.
- No placeholders: every step shows runnable commands or full code.
- Type consistency: `parseLedgerFilters` defined in Task 5 produces a `LedgerFilters` whose `search?: string` matches the schema added in Task 2 and is consumed by the repo in Task 3.
