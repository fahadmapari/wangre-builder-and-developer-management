# Phase 9 — Pagination + Drilldown Sheets

**Date:** 2026-05-27
**Status:** Brainstormed and approved. Ready for implementation planning.
**Depends on:** Phases 1–8. Phase 8 merged to local master (HEAD `30ca5c0`).

## Goal

Add pagination to every unbounded table in the app, and replace the per-row History button with a unified drilldown sheet that shows full row detail ("Details" tab) plus audit history ("History" tab) in one panel.

## Non-goals

- Replacing inline row actions (Reverse / Void / row-actions menu). These stay as-is.
- Real-time / infinite-scroll virtualization.
- A global "details sidebar" application shell.
- Drilldown on the audit log itself (History sheet already covers per-row audit detail there).
- Touching the audit page pagination (it's already paginated, application-level, and stays unchanged).
- Cursor-based pagination (offset+limit is sufficient at current and projected volume).

## Decisions made

| Question | Decision |
|---|---|
| Pagination + drilldown in one phase? | Yes — combined |
| Which tables? | All: ledger, money transfers, material transfers, movements sheet, units list |
| Pagination model | MongoDB-level skip/limit (not application-level slice) |
| Page size | 50 across all surfaces |
| URL-sync | Yes — `?page=N` on all server-rendered tables; in-sheet React state for movements |
| Drilldown trigger | Row click (non-actions cells); actions column calls `e.stopPropagation()` |
| Subsume History? | Yes — drilldown sheet replaces standalone History buttons everywhere |
| Drilldown data loading | Server action `fetchDrilldownDetail(entityType, entityId)` for Details; existing `getEntityHistory` for History tab (lazy on first tab switch) |

---

## Pagination architecture

### Repository layer

Every paginated repository function gains `page: number` and `pageSize: number` parameters (both required; callers supply defaults of `page=1`, `pageSize=50`). Each function returns `{ rows: T[], total: number }`.

Implementation pattern per function:
```ts
const skip = (page - 1) * pageSize
const [rows, total] = await Promise.all([
  coll.find(filter).sort(sort).skip(skip).limit(pageSize).toArray(),
  coll.countDocuments(filter),
])
return { rows, total }
```

The Atlas Search path in `listLedger` (when `search` is active) uses the aggregation pipeline. Pagination there uses `$skip` / `$limit` stages appended after `$sort`. The `$count` facet already present in `computeTotals` is NOT reused — `listLedger` gets its own `$count` stage in the aggregate when search is active, matching the find-path's `countDocuments` return shape.

Functions to update:
- `lib/transactions/repository.ts` — `listLedger` (find path + Atlas Search aggregate path), `listMoneyTransfers`
- `lib/materials/repository.ts` — `listMaterialTransfers`, new `listMovements(projectId, materialId, page, pageSize)` replacing the unbounded fetch
- `lib/projects/repository.ts` — units list query (currently inline in the page; extract to a `listUnits(projectId, page, pageSize)` repository function)

### URL wiring

All server-rendered tables: `?page=N` parsed from `searchParams` (integer ≥ 1, default 1). Any filter change resets `page` to 1 (the filter components call `router.replace` with the new filters and no `page` param, same pattern as existing filter components).

`totalPages = Math.max(1, Math.ceil(total / pageSize))`

### Pagination controls component

Inline server component (not a separate file — defined in each page file, same pattern as audit's `Pagination` / `PaginationLink`). Renders nothing when `totalPages <= 1`.

```
← Prev   Page 2 of 14   Next →
```

Placed below the table on each surface. The entry count line ("N entries in this window") updates to reflect the page slice: "Showing 50 of 312 entries" (or "312 entries" when all fit on one page).

### Movements sheet pagination (client-side)

The movements sheet has no URL. Page state lives in React: `const [page, setPage] = useState(1)`. On sheet open (or `page` change), `fetch(/api/movements?projectId=...&materialId=...&page=N&pageSize=50)` is called. The API route returns `{ rows, total }`. Prev/Next buttons rendered at the bottom of the sheet content. Reset to page 1 when sheet closes.

`app/api/movements/route.ts` gains `page` and `pageSize` query params (integers, defaults 1 and 50). The route calls `listMovements` with those params.

---

## Drilldown architecture

### Shared component

**`app/(authed)/components/drilldown-sheet.tsx`** — `"use client"` component.

Props:
```ts
{
  entityType: "transaction" | "movement" | "unit" | "money_transfer" | "material_transfer"
  entityId: string
  children: React.ReactNode  // the row content (passed as children, not a trigger prop)
}
```

The component renders a `<tr>` (or equivalent wrapper depending on context) with an `onClick` that opens a `<Sheet>`. On open it calls `fetchDrilldownDetail(entityType, entityId)` (server action). Sheet contains two tabs via shadcn `<Tabs>`: "Details" and "History". History tab content is fetched lazily on first activation via `getEntityHistory(entityType, entityId)`.

Loading state: each tab shows a "Loading…" skeleton while its data is in flight.

### DrilldownRow wrappers

Each table's row rendering is extracted into a thin `"use client"` wrapper component co-located with the table file:

- `app/(authed)/projects/[id]/financials/ledger-row.tsx`
- `app/(authed)/transfers/money-transfer-row.tsx`
- `app/(authed)/transfers/material-transfer-row.tsx`
- `app/(authed)/projects/[id]/page.tsx` inline (units rows, low complexity)

Each wrapper renders a `<tr onClick={openDrilldown}>` with `e.stopPropagation()` on the actions cell. The parent server component fetches all data as today, then passes the serialised row to the wrapper as props.

Because `LedgerTable` is currently an `async` server component (it calls `fetchUnitsForRows`), that fetch stays server-side. The unit labels are passed as a prop to the client `<LedgerRow>` components. No data-fetching responsibility moves to the client.

### Server action — `fetchDrilldownDetail`

**`lib/drilldown/actions.ts`** — `"use server"`. Single exported function:

```ts
export async function fetchDrilldownDetail(
  entityType: DrilldownEntityType,
  entityId: string
): Promise<DrilldownDetail>
```

Returns a discriminated union `DrilldownDetail` typed by `entityType`. Each variant carries all fields needed for the Details tab. Auth check: `await requireAuth()` at the top (detail is visible to both roles, but admin-only fields are omitted for floor_manager — the action checks role and strips `amount` fields accordingly).

### Details tab content per entity type

**Transaction — sale**
Date · Amount · Buyer name · Unit (type + number) · Description · Voided / reversal badge · Linked material movement (material name, qty, unit label) if present

**Transaction — purchase**
Date · Amount · Description · Linked material movement (material name, qty, project name) · Voided / reversal badge

**Transaction — transfer**
Date · Amount · Direction (in / out) · Peer project name · Transfer group ID (truncated hex) · Reversal badge if reversal

**Transaction — adhoc**
Date · Amount · Kind (income / expense) · Description · Notes · Voided / reversal badge

**Material movement**
Date · Material name · Qty (with unit label) · Category · Amount (admin only) · Purpose · Notes · Voided badge · Peer project if transfer category

**Unit**
Type · Number · Floor (if present) · Status (Available / Sold) · Sale price (admin only) · Buyer name · Sale date

**Money transfer**
From project · To project · Amount · Date · Reversal badge if reversed

**Material transfer**
From project · To project · Material name · Qty (with unit label) · Date · Reversal badge if reversed

### History tab

Calls `getEntityHistory(entityType, entityId)` — the existing server action already used by `<HistorySheet>`. Renders the same event list. Loaded lazily on first tab activation to avoid the extra DB round-trip when the user only wants Details.

Entity type mapping for history tab:
- Transaction → `"transaction"`
- Material movement → `"movement"`
- Unit → `"unit"`
- Money transfer / Material transfer → `"transaction"` (transfers are transactions in the DB; pass the transaction `_id`)

### History button removal

The following are removed and replaced by the drilldown History tab:
- "History" item in `<RowActionsMenu>` on ledger rows (`app/(authed)/projects/[id]/financials/row-actions-menu.tsx`)
- `<HistoryDialog>` rendered inside `movements-sheet.tsx` per movement row

The shared `<HistorySheet>` / `<HistoryDialog>` components in `app/(authed)/components/history-sheet.tsx` are **kept** — the audit page's per-row history refUrl links still use them.

---

## File change summary

**New files (~6):**
- `lib/drilldown/actions.ts` — `fetchDrilldownDetail` server action
- `lib/drilldown/schemas.ts` — `DrilldownDetail` discriminated union type
- `app/(authed)/components/drilldown-sheet.tsx` — shared sheet component
- `app/(authed)/projects/[id]/financials/ledger-row.tsx`
- `app/(authed)/transfers/money-transfer-row.tsx`
- `app/(authed)/transfers/material-transfer-row.tsx`

**Modified files (~12):**
- `lib/transactions/repository.ts` — `listLedger`, `listMoneyTransfers` gain pagination
- `lib/materials/repository.ts` — `listMaterialTransfers` gains pagination; new `listMovements`
- `lib/projects/repository.ts` — new `listUnits` with pagination
- `app/(authed)/projects/[id]/page.tsx` — units + ledger pagination URL wiring
- `app/(authed)/projects/[id]/financials/financials-view.tsx` — `total` / `totalPages` props, `<Pagination>`
- `app/(authed)/projects/[id]/financials/ledger-table.tsx` — rows via `<LedgerRow>`
- `app/(authed)/projects/[id]/financials/row-actions-menu.tsx` — remove History item
- `app/(authed)/transfers/page.tsx` — pagination URL wiring for both tabs
- `app/(authed)/transfers/money-transfers-table.tsx` — `<Pagination>` + `<MoneyTransferRow>`
- `app/(authed)/transfers/material-transfers-table.tsx` — `<Pagination>` + `<MaterialTransferRow>`
- `app/(authed)/projects/[id]/materials/movements-sheet.tsx` — client-side page state, Prev/Next, drilldown per row, remove `<HistoryDialog>`
- `app/api/movements/route.ts` — `page` / `pageSize` query params

**Total: ~18 files**

---

## Locked-in conventions (unchanged)

All Phase 1–8 conventions apply. Key ones relevant to this phase:
- `requireAuth()` / `requireAdmin()` as first executable line in every server action and protected page.
- No client-side fetch for protected data — except `app/api/movements/route.ts` (existing approved exception).
- Date helpers use local components, never `toISOString().slice(0,10)`.
- `serverApi.strict: false` remains on the Mongo client.

---

## Verification (manual T-tasks)

**Pagination:**
- T-pag-1: Ledger page 1 shows 50 rows; page 2 shows the next 50 with no duplicates or gaps.
- T-pag-2: "Page X of Y" and entry count are correct.
- T-pag-3: Changing a filter (date range, kind, search) resets to page 1.
- T-pag-4: `?page=N` in the URL survives a reload.
- T-pag-5: Pagination hidden when total ≤ 50.
- T-pag-6: Same checks for money transfers, material transfers, units list.
- T-pag-7: Movements sheet Prev/Next work; page resets to 1 when sheet is closed and reopened.

**Drilldown:**
- T-drill-1: Clicking a ledger row (not the actions column) opens the sheet.
- T-drill-2: Clicking the ⋮ actions menu does not open the sheet.
- T-drill-3: Details tab shows correct data for sale, purchase, transfer, adhoc transactions.
- T-drill-4: History tab loads on first activation and matches what the old History button showed.
- T-drill-5: Drilldown works on transfer rows, unit rows, movement rows.
- T-drill-6: FM role: amount fields absent from Details tab on purchase transactions and material movements.
- T-drill-7: Drilldown on a voided row shows voided badge in Details.
- T-drill-8: Drilldown on a reversal row shows reversal badge and links to original.
