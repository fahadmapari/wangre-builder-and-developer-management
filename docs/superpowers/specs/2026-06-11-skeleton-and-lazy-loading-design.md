# Skeleton & Lazy Loading — Design

**Date:** 2026-06-11
**Status:** Approved (design); pending implementation plan

## Problem

The app has no loading affordances and no code-splitting:

- **Zero `loading.tsx` files.** Every route in `app/(authed)/` is an `async` server
  component that `await`s all its data (often one `Promise.all`) before returning
  JSX. Client navigation therefore fully blocks on the slowest query — the dashboard
  awaits 9 aggregations, the project detail page ~10 — leaving the previous page
  frozen with no feedback until everything resolves.
- **No `next/dynamic` / `React.lazy` anywhere.** `recharts` (large) is eagerly
  bundled via three dashboard chart sections plus `components/ui/chart.tsx`. ~19
  dialog/sheet bodies are statically imported even though they only mount on user
  action.
- **No `Skeleton` primitive** exists in `components/ui/`.

## Goals

1. Instant navigation feedback on every data-backed route via layout-matching
   skeletons.
2. Shrink initial/shared client JS by code-splitting `recharts` and the
   form-heavy dialog/sheet bodies so they load on demand.
3. No regression to SSR of primary content, no page-level data-fetch refactor.

## Non-goals (explicitly out of scope)

- **No code-splitting of primary server-rendered tables** (ledger / inventory /
  materials). They are `async` server components and the main content of their
  route; `next/dynamic` would force `ssr:false` (worse first paint) or add a
  pointless extra chunk on a route that needs them immediately. They are covered
  by route skeletons instead. Their *client* JS still shrinks because the
  row-action menus and dialogs they trigger become lazy (see §4).
- **No streaming-Suspense refactor.** Decision was route-level `loading.tsx`;
  pages keep their existing `await`/`Promise.all` structure untouched.
- **No splitting of the 3 trivial confirm dialogs** (`void-confirm`,
  `unmark-confirm`, `reverse-confirm`) — a few lines each; splitting adds
  indirection for ~no bytes.

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Skeleton strategy | Route-level `loading.tsx` |
| Skeleton fidelity | Layout-matching per route |
| Lazy scope | Charts + form-heavy dialogs/sheets |
| Tables | Skeleton only; not code-split |

## Architecture

### 1. Shared primitives

- **`components/ui/skeleton.tsx`** — shadcn `Skeleton` base: a `div` with
  `animate-pulse rounded-md bg-muted` and a `className` passthrough via `cn`.
  Every skeleton composes from this.
- **`components/skeletons/`** — composable, route-agnostic building blocks so each
  `loading.tsx` stays tiny:
  - `TileSkeleton` — one KPI/summary tile.
  - `CardGridSkeleton` — responsive grid of card placeholders (count prop).
  - `TableSkeleton` — sticky header bar + N shimmer rows (rows/cols props).
  - `ChartCardSkeleton` — card with title bar + chart-area block.
  - `FilterBarSkeleton` — toolbar of input/select-shaped blocks.
  - `FormFieldSkeleton` — label + control placeholder.

  Each is a pure presentational component built only from `Skeleton` + Tailwind,
  reusing the same container widths/spacing as the real pages to minimize layout
  shift.

### 2. Route-level `loading.tsx`

One layout-matching `loading.tsx` beside each data-backed route's `page.tsx`. The
`(authed)/layout.tsx` header shell stays mounted across navigation; only the
`<main>` slot swaps to the skeleton until the server component resolves.

| File | Skeleton composition |
|---|---|
| `app/(authed)/projects/loading.tsx` | title row + `CardGridSkeleton` (3-col) |
| `app/(authed)/projects/[id]/loading.tsx` | header block + 5-tile row + tab bar + `TableSkeleton` |
| `app/(authed)/dashboard/loading.tsx` | header + `FilterBarSkeleton` + 4× `TileSkeleton` + 3× `ChartCardSkeleton` |
| `app/(authed)/financials/loading.tsx` | `FilterBarSkeleton` + `TableSkeleton` |
| `app/(authed)/catalog/loading.tsx` | toolbar + `TableSkeleton` |
| `app/(authed)/transfers/loading.tsx` | tab bar + `TableSkeleton` |
| `app/(authed)/audit/loading.tsx` | `FilterBarSkeleton` + `TableSkeleton` |
| `app/(authed)/settings/loading.tsx` | section headers + `FormFieldSkeleton`s |

Skipped: `app/login/` (no data wait) and the `(authed)` index (redirect). Each
skeleton reuses the page's real outer container classes
(`mx-auto … max-w-6xl px-6 py-10`, etc.) so the real content drops in without a jump.

### 3. Lazy-load charts (largest bundle win)

`recharts` enters the bundle only through the three dashboard sections
(`financial-trends.tsx`, `sales-inventory.tsx`, `materials-procurement.tsx`).

For each: rename the existing recharts implementation to `*.client.tsx` and
replace the original filename with a thin **`"use client"` lazy wrapper** that
exports the same component name:

```tsx
"use client"
import dynamic from "next/dynamic"
import { ChartCardSkeleton } from "@/components/skeletons"
const Inner = dynamic(() => import("./financial-trends.client").then(m => m.FinancialTrends), {
  ssr: false,
  loading: () => <ChartCardSkeleton />,
})
export function FinancialTrends(props: React.ComponentProps<typeof Inner>) {
  return <Inner {...props} />
}
```

- The dashboard page's import lines are unchanged (same names from same paths).
- Data props are server-computed primitives (numbers/strings) — safe across the
  server→client boundary.
- `ssr:false` requires a client boundary, which the wrapper provides; recharts is
  client-only anyway. Result: `recharts` splits into a `/dashboard`-only chunk,
  with a chart skeleton during load.

### 4. Lazy-load dialogs & sheets (load on open)

Each dialog today = a light trigger (e.g. `NewProjectButton`) + a heavy form body
in the same module, gated by `useDisclosure()` (`open` + `contentKey`
`"open"|"closed"` to remount/reset the body each open).

Per dialog/sheet:

1. Extract the body component into a sibling file, e.g.
   `new-project-dialog.body.tsx` (exports `NewProjectDialog`).
2. In the trigger file (export name unchanged so callers don't change):

   ```tsx
   const Body = dynamic(() => import("./new-project-dialog.body").then(m => m.NewProjectDialog))
   // …
   {(open || closing) && (
     <Body key={contentKey} open={open} onOpenChange={onOpenChange} {...props} />
   )}
   ```

   The chunk loads on first open; `contentKey` remount/reset behavior is preserved.

**Close-animation handling:** unmounting on `!open` would cut Radix's exit
animation. Keep the body mounted through the close transition — track a `closing`
flag (or render-while-closing) so the dialog/sheet animates out before unmount.
This logic is identical across dialogs and can live in a small shared helper
(e.g. extend `useDisclosure` to expose a `mounted` flag, or a `<LazyDisclosure>`
wrapper). Implementation plan to choose the exact shared form.

**Targets — lazy (≈16 dialogs):**
`catalog/new-material-dialog`, `catalog/edit-material-dialog`,
`projects/new-project-dialog`, `projects/[id]/edit-project-dialog`,
`projects/[id]/expand-capacity-dialog`, `projects/[id]/add-capital-dialog`,
`projects/[id]/financials/add-expense-dialog`,
`projects/[id]/financials/add-income-dialog`,
`projects/[id]/inventory/edit-unit-dialog`,
`projects/[id]/inventory/mark-sold-dialog`,
`projects/[id]/materials/add-material-dialog`,
`projects/[id]/materials/record-purchase-dialog`,
`projects/[id]/materials/log-consumption-dialog`,
`projects/[id]/materials/log-return-dialog`,
`transfers/material-transfer-dialog`, `transfers/money-transfer-dialog`,
plus `transfers/reverse-transfer-dialog` if it carries form inputs (else treat
as confirm and leave static).

**Targets — lazy (3 sheets):**
`components/drilldown-sheet`, `components/history-sheet`,
`projects/[id]/materials/movements-sheet`. (Sheets using `SheetTrigger asChild`
are refactored to controlled `open` + gated lazy body, matching the dialog
pattern.)

**Left static (confirm dialogs):** `financials/reverse-confirm-dialog`,
`financials/void-confirm-dialog`, `inventory/unmark-confirm-dialog`.

### 5. Loading fallbacks for dialogs/sheets

A dialog body chunk loads in <100ms on a warm connection, so the default is no
visible fallback (the trigger's pending state suffices). Where a body is large,
pass a minimal `loading` skeleton matching the dialog/sheet frame. Decision per
component left to the implementation plan; default = none.

## Affected / new files (summary)

- **New:** `components/ui/skeleton.tsx`; `components/skeletons/` (index + ~6
  blocks); 8 `loading.tsx` files; 3 chart `*.client.tsx` splits + 3 rewritten
  wrappers; ~19 `*.body.tsx` dialog/sheet splits + rewritten triggers; possibly a
  shared lazy-disclosure helper in `lib/hooks/`.
- **Modified:** trigger files for each split dialog/sheet (import → `dynamic`,
  gate on open); `lib/hooks/use-disclosure.ts` if a `mounted`/`closing` flag is
  added. Page files are largely untouched (imports keep their names/paths).

## Constraints / conventions to honor

- React 19 `react-hooks/set-state-in-effect` is enforced — lazy wrappers and the
  close-animation logic must not `setState` synchronously in a `useEffect` body.
- Next.js 16 App Router: `ssr:false` `next/dynamic` only inside `"use client"`
  modules (satisfied by the wrappers).
- Match existing container/spacing classes in skeletons to avoid layout shift.

## Verification

1. `npm run typecheck` — clean.
2. `npm run lint` — clean (incl. set-state-in-effect rule).
3. `npm run build` — succeeds; inspect per-route JS: `recharts` no longer in the
   shared/initial bundle, present only in the `/dashboard` chunk; dialog bodies in
   separate chunks.
4. Manual pass (throttled network): navigate each route → skeleton appears
   immediately → real content swaps in with no visible layout jump; open a
   dialog/sheet and a chart and confirm the chunk loads on demand in the Network
   tab; confirm dialog/sheet exit animations still play.

## Risks

- **Volume.** ~8 `loading.tsx` + ~7 skeleton files + ~19 dialog/sheet splits + 3
  chart wrappers. Large but mechanical and repetitive; lends itself to a few
  batches.
- **Close-animation regression** if the `mounted`/`closing` flag is wrong —
  covered by the shared helper + manual check.
- **Per-dialog drift.** Some dialogs may deviate from the standard
  trigger+`useDisclosure` shape (e.g. `SheetTrigger asChild`); each split verified
  against its current behavior.
