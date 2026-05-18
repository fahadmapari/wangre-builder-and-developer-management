# Phase 8 — CSV Exports + Free-Text Search (design)

**Date:** 2026-05-18
**Status:** Brainstormed and approved. Ready for an implementation plan.
**Supersedes:** `2026-05-17-phase-8-csv-exports-and-search-skeleton.md`.
**Depends on:** Phases 1–7 merged to local master (HEAD `f619758`).

## Goal

Give admins two related data-access capabilities on the financial surfaces:

1. **Free-text search** across ledger descriptions, buyer names, and notes — so finding a transaction doesn't require scrolling.
2. **CSV exports** of the same data, plus a totals export on the global `/financials` page — so reconciliation can happen outside the app.

Both ship as one phase because they share a surface (ledger), share a UI affordance (filter-bar additions), and answer the same admin question: "give me my data."

## Non-goals

- Transfers (money + material), materials movements, audit log — no export, no search. These remain candidates for a later phase.
- Excel / PDF / JSON export formats. CSV only.
- Scheduled or emailed exports. Pull-only via a button click.
- Global / cross-collection search (Cmd-K palette, global search box).
- A new cross-project transactions list on `/financials`. The page stays a totals view.
- Fuzzy / typo-tolerant search.
- Saved searches, search history.
- Streaming exports. Buffered only for v1 (revisit threshold documented below).

## Surfaces in scope

| Surface | Search | Export |
| --- | --- | --- |
| `/projects/[id]` (financials tab) | Transaction-level `$text` search in the filter bar, composes via AND with date / kind / category / voided | Transaction-level CSV honoring the active filter set (including search) |
| `/financials` (cross-project totals) | — | Per-project totals CSV honoring the date range |

Both surfaces are already admin-only via parent-page guards. Floor managers do not access financials at all, so Phase 8 introduces no new auth axis.

## Architecture

### Search

**Strategy:** Mongo `$text` index on the `transactions` collection.

**Index definition** (`scripts/init-db.mjs`):

```js
await db.collection("transactions").createIndex(
  { description: "text", buyerName: "text", notes: "text" },
  {
    name: "transactions_text",
    weights: { description: 10, buyerName: 5, notes: 1 },
    default_language: "english",
  },
)
```

No existing `$text` index on `transactions` — single index per collection rule is satisfied.

**Composition with existing filters:**
- `$text: { $search: query }` ANDs into the same Mongo `filter` object as `projectId`, `occurredAt` range, `kind`, `category`, and the voided predicate.
- No client-side post-filter. Everything is a single Mongo query.
- Sort remains `{ occurredAt: -1 }` — we do NOT sort by `$meta: "textScore"`. The weights act only as a tiebreaker if a future iteration switches to score-sorting.

**Query language exposure:** The input is presented as a plain search box in the UI. Mongo `$text` supports phrase matching via `"quoted"`, OR via spaces, and negation via `-word`. We do not document this; users who know the syntax get it for free.

**Edge cases:**
- Trimmed value with `length < 2` → treated as no search (`search` param removed from URL, Mongo filter unchanged).
- Empty string → no search.
- Maximum length 200 chars (Zod-validated).

### Exports

**Architecture:** Two Route Handlers (`app/api/export/*/route.ts`). Route Handlers are necessary because file downloads require `Content-Type: text/csv` and `Content-Disposition: attachment` headers, which server actions cannot produce. This is the second Route Handler exception in the codebase, alongside the existing `app/api/movements/route.ts` from Phase 4.

**Both routes:**
- First executable line: `await requireAdmin()`. UI hiding is convenience only.
- Validate inputs via `ObjectId.isValid` and the same Zod schemas the page uses.
- Buffered CSV (full result set in memory, returned as a single `Response`).
- Browser-driven download via a plain `<a>` styled as a Button — no client-side `fetch`, no Blob construction, no in-app loading spinner.

**Buffered vs streaming:**
- v1 is buffered. The ledger is bounded by date range + projectId, so worst-case rows for one export are modest.
- Revisit threshold: ~10k rows or ~5 MB CSV. At that point switch to a `ReadableStream` with a Mongo cursor (which also requires a new cursor-returning repo function — out of scope for v1).

### Shared CSV encoder (`lib/exports/csv.ts`)

- `toCsvRow(values: (string | number | boolean | null)[]): string` — RFC 4180 quoting. Wrap in `"` when the value contains `,`, `"`, `\n`, or `\r`. Double internal `"`. `null` / `undefined` → empty cell. Booleans → `"true"` / `"false"`. Numbers → `String(n)`.
- `toCsvFile(headers: string[], rows: (...)[][]): string` — joins with `\r\n` (Excel-friendly), prepends a UTF-8 BOM (`﻿`) so non-ASCII content in `description` / `notes` renders correctly when opened in Excel.

## Backend changes

### `lib/transactions/schemas.ts`

Extend `LedgerFilters`:

```ts
export type LedgerFilters = {
  from: Date
  to: Date
  kind: LedgerKindFilter
  category: LedgerCategoryFilter
  includeVoided: boolean
  search?: string  // raw trimmed query string; only applied when length >= 2
}
```

### `lib/transactions/repository.ts`

Extend the existing `buildLedgerMatch(filters: LedgerFilters)` helper at line 185 — it is the shared filter builder consumed by both `listLedger` and `computeTotals`:

```ts
function buildLedgerMatch(filters: LedgerFilters): Record<string, unknown> {
  const match: Record<string, unknown> = {
    occurredAt: { $gte: filters.from, $lte: endOfDay(filters.to) },
  }
  if (filters.kind !== "all") match.kind = filters.kind
  if (filters.category !== "all") match.category = filters.category
  if (!filters.includeVoided) match.voided = { $ne: true }
  const q = filters.search?.trim()
  if (q && q.length >= 2) match.$text = { $search: q }
  return match
}
```

**Intentional side effect:** Because `computeTotals` also calls `buildLedgerMatch`, the Revenue / Expenses / Net tiles narrow as the user types. This preserves Phase 5's "what you see is what you sum" invariant — the tiles always agree with the visible ledger.

No other code path changes in the repo. Sort in `listLedger` remains `{ occurredAt: -1, _id: -1 }`.

### `scripts/init-db.mjs`

Append the `transactions_text` index creation and add it to the trailing `console.log` summary string. Re-run once against dev:

```bash
node --env-file-if-exists=.env scripts/init-db.mjs
```

### New: `lib/exports/csv.ts`

Two exported functions (`toCsvRow`, `toCsvFile`). Pure. No I/O.

### New: `app/api/export/ledger/route.ts`

```
GET /api/export/ledger?projectId=...&from=...&to=...&kind=...&category=...&voided=...&search=...
```

- `await requireAdmin()` first.
- Parses `searchParams` via the same logic the page uses. Factor out a shared `parseLedgerFilters(sp)` helper into a small module (e.g. `lib/transactions/filters.ts`) so the page and the Route Handler stay in lockstep.
- Calls `listLedger(new ObjectId(projectId), filters)` with NO pagination — full result set for the filter window.
- Single `findOne({ _id: projectId })` to denormalize the project name (used in the filename slug and in the CSV's `projectName` column).
- Builds CSV via `toCsvFile`.
- Returns:
  ```ts
  new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
  ```

**Filename:** `ledger-{projectSlug}-{from}-{to}.csv`
- `projectSlug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)`
- Dates as `YYYY-MM-DD`.

**Column order:**

| # | Column | Notes |
| --- | --- | --- |
| 1 | `_id` | Transaction hex |
| 2 | `projectId` | Project hex |
| 3 | `projectName` | Denormalized at export time |
| 4 | `occurredAt` | `YYYY-MM-DD` |
| 5 | `kind` | `income` \| `expense` |
| 6 | `category` | `sale` \| `purchase` \| `adhoc` \| `transfer_in` \| `transfer_out` |
| 7 | `amount` | Raw integer rupees, no `₹`, no thousand separators |
| 8 | `description` | Verbatim |
| 9 | `buyerName` | Empty when absent |
| 10 | `notes` | Verbatim, empty when absent |
| 11 | `voided` | `true` \| `false` |
| 12 | `reversalOf` | Empty when not a reversal; otherwise original tx hex |
| 13 | `transferGroupId` | Empty when not a transfer leg; otherwise hex |
| 14 | `createdAt` | ISO datetime |
| 15 | `createdBy` | User hex, NOT denormalized |

### New: `app/api/export/financials-totals/route.ts`

```
GET /api/export/financials-totals?from=...&to=...
```

- `await requireAdmin()` first.
- Calls existing `listCrossProjectTotals({ from, to })`.
- Buffered CSV (always small — one row per project).
- Filename: `financials-totals-{from}-{to}.csv`.

**Column order:**

| # | Column |
| --- | --- |
| 1 | `projectId` |
| 2 | `projectName` |
| 3 | `revenue` |
| 4 | `expenses` |
| 5 | `net` |
| 6 | `transfersIn` |
| 7 | `transfersOut` |

Plus a trailing **OVERALL** row: `projectId` empty, `projectName` = `"OVERALL"`, remaining columns from `overall`.

## Frontend changes

### `app/(authed)/projects/[id]/financials/ledger-filters.tsx`

Add a search `<Input type="search">` to the filter bar, alongside From / To:

- Local state initialized from `sp.get("search") ?? ""`.
- **Debounced auto-apply** at 350ms. A `setTimeout` is cleared on each keystroke; when it fires, `router.replace` writes `search=<value>` to the URL (or deletes the param if trimmed length is `<2`).
- `router.replace`, not `router.push` — matches the existing `setParam` helper so search-typing does not pollute browser back-history.
- Enter key cancels the pending debounce and applies immediately.
- An `x` clear affordance (visible when input has a value) clears state + removes the URL param.

### `app/(authed)/projects/[id]/financials/financials-view.tsx`

- Renders the "Export CSV" anchor in a header row above the ledger table:
  ```tsx
  <Button asChild variant="outline">
    <a href={`/api/export/ledger?${exportSearchParams}`} download>
      Export CSV
    </a>
  </Button>
  ```
  Where `exportSearchParams` is built from `useSearchParams()` plus the route-param `projectId`.
- When `search` is active, renders a small line above the table: `Showing matches for "<query>" — click ✕ to clear`. The clear control here calls the same logic as the filter input's `x`.
- Empty-results state: when `search` is non-empty and `rows.length === 0`, shows "No transactions match your search." instead of the generic empty state.

### `app/(authed)/projects/[id]/page.tsx`

- Parse `search` from `searchParams` alongside the existing filters; pass through to `listLedger`.
- The `loadLinkedMaterials` prefetch already operates on the filtered result set (it derives transaction ids from `listLedger`'s return), so no separate plumbing is needed.

### `app/(authed)/financials/page.tsx`

- Renders the "Export totals CSV" anchor in the page header next to the title:
  ```tsx
  <Button asChild variant="outline">
    <a href={`/api/export/financials-totals?${exportSearchParams}`} download>
      Export totals CSV
    </a>
  </Button>
  ```

## Convention compliance

- **Server-side enforcement:** Both Route Handlers begin with `await requireAdmin()`.
- **Append-only ledger:** Phase 8 reads only. No writes, no transactions.
- **No client-side fetch:** Exports use plain `<a href="...">` so the browser session cookie is sent natively. Search uses URL navigation (`router.replace`), not `fetch`.
- **`use cache` not used:** Both exports and search reflect filter state in real time.
- **Server actions:** None added. Exports are Route Handlers (the file-download exception); search is URL-driven and read by the server component.
- **Revalidation:** None needed — Phase 8 doesn't mutate state.
- **Dialog state-reset key:** Not applicable; no dialogs added.

## Risks and follow-ups

- **`$text` is word-prefix, not substring.** Searching `"sharm"` matches `"Sharma"` (prefix), but `"har"` does NOT match `"Sharma"` (interior). If users find this painful, the v2 fallback is `$regex` over the same fields (slower but substring). Set expectations in the "Showing matches for ..." helper line if needed.
- **Index size on the `notes` field.** `notes` can be 2000 chars. At 10k transactions the `$text` index could reach ~5–10 MB on disk. Acceptable on Atlas at our tier.
- **Re-running `init-db.mjs` on prod.** Index creation on a non-empty collection is online but takes time. Plan the deploy for low traffic, or build the index in advance via the Atlas UI.
- **Buffered export memory cap.** A single export over ~50k rows could OOM a Node worker. Document the 10k-row threshold for revisiting streaming.
- **Excel hex coercion.** Some Excel versions coerce 24-char hex strings to scientific notation when they look numeric. The BOM + RFC 4180 quoting should prevent this, but T-export-4 should explicitly verify on a fresh Excel session.
- **Linked-material prefetch unaffected.** Phase 7's `loadLinkedMaterials` operates on whatever ids `listLedger` returns, so it composes naturally with search. Verify in T-search-2.

## Verification (T-tasks)

Manual. Run before merge.

1. **T-index-1** — Re-run `init-db.mjs` against dev. `db.transactions.getIndexes()` shows `transactions_text` with the documented weights.
2. **T-index-2** — Drop `transactions_text`; search returns the expected Mongo error mode. Recreate index via re-running `init-db.mjs`.
3. **T-search-1** — Per-project ledger: typing a substring of an existing `description` filters rows; URL gains `search=...`.
4. **T-search-2** — Search composes with date range, kind, category, and voided filters via AND. Linked-material prefetch (Phase 7) still works for purchase rows in the filtered set.
5. **T-search-3** — Single-char input does NOT trigger a search; 2+ chars does.
6. **T-search-4** — Clear via the `x` button and via empty-string keystrokes removes `search` from the URL.
7. **T-search-5** — Date-sort is preserved when search is active (NOT score-sorted).
8. **T-search-6** — Query of 200+ chars is rejected by Zod.
9. **T-export-1** — "Export CSV" downloads a file named `ledger-{slug}-{from}-{to}.csv`. Open in Excel: `description` containing non-ASCII renders correctly (BOM verified).
10. **T-export-2** — Export honors search + filters. Apply a filter, click export, count rows == count on screen.
11. **T-export-3** — Voided / reversal rows respect the active voided filter and surface the `voided` / `reversalOf` columns when present.
12. **T-export-4** — Raw `_id` and `projectId` columns are hex strings in Excel (not coerced to scientific notation).
13. **T-export-5** — `/financials` totals export: one row per project + final OVERALL row. Numbers match the on-screen tiles.
14. **T-export-6** — FM hitting `/api/export/ledger` or `/api/export/financials-totals` directly is rejected by `requireAdmin()`.
15. **T-export-7** — Special characters in `description` / `notes` (commas, double-quotes, newlines) round-trip correctly through `toCsvRow`.

## Files touched (~10)

**New:**
- `lib/exports/csv.ts`
- `lib/transactions/filters.ts` — shared `parseLedgerFilters(sp)` helper used by the page and the export Route Handler
- `app/api/export/ledger/route.ts`
- `app/api/export/financials-totals/route.ts`

**Modified:**
- `lib/transactions/schemas.ts` — `search` field on `LedgerFilters`
- `lib/transactions/repository.ts` — `$text` composition in `buildLedgerMatch` (flows into both `listLedger` and `computeTotals`)
- `scripts/init-db.mjs` — `transactions_text` index + console.log update
- `app/(authed)/projects/[id]/page.tsx` — parse `search`, pass into `listLedger`
- `app/(authed)/projects/[id]/financials/ledger-filters.tsx` — search input + debounced auto-apply + clear button
- `app/(authed)/projects/[id]/financials/financials-view.tsx` — "Export CSV" anchor + active-search helper line + empty-search state
- `app/(authed)/financials/page.tsx` — "Export totals CSV" anchor
