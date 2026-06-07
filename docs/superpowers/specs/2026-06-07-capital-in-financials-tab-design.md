# Capital in Financials Tab — Design Spec

**Date:** 2026-06-07
**Status:** Approved

## Overview

Capital injections are currently visible only in the Capital collapsible section above the project tabs. This spec extends the Financials tab to also show capital injection rows in its paginated ledger and replaces the Net tile with an Available Funds tile (Capital + Revenue − Expenses). The Capital collapsible section is unchanged; it is made open by default.

---

## Data Types

### `FinancialLedgerRow` — new discriminated union (`lib/transactions/schemas.ts`)

```ts
export type TransactionLedgerRow = Transaction & { _type: "transaction" }

export type CapitalLedgerRow = {
  _type: "capital"
  _id: ObjectId
  amount: number
  occurredAt: Date
  notes?: string
  createdBy: ObjectId
  createdAt: Date
}

export type FinancialLedgerRow = TransactionLedgerRow | CapitalLedgerRow
```

### `FinancialTotals` — updated (`lib/transactions/repository.ts`)

Remove `net`. Add:

```ts
capital: number        // sum of capital injections in the date window
availableFunds: number // capital + revenue − expenses
```

`net` is removed from all consumers. `availableFunds` replaces it everywhere.

---

## Repository Layer

### `listLedger` — `lib/transactions/repository.ts`

Return type changes from `Paginated<Transaction>` to `Paginated<FinancialLedgerRow>`.

**Pipeline when no kind/category/search filter is active:**

```
transactions.aggregate([
  { $match: { projectId, occurredAt window, voided guard } },
  { $addFields: { _type: "transaction" } },
  { $unionWith: {
      coll: "capitalInjections",
      pipeline: [
        { $match: { projectId, occurredAt window } },
        { $addFields: { _type: "capital" } }
      ]
  }},
  { $sort: { occurredAt: -1, _id: -1 } },
  { $facet: { rows: [skip, limit], total: [count] } }
])
```

**When search is active** (`buildSearchStage` returns non-null), the `$search` stage is prepended and the `$unionWith` is omitted. Atlas Search only covers the `transactions` collection; capital rows are excluded from search results.

**When `kind ≠ "all"` or `category ≠ "all"`**, the `$unionWith` is also omitted. Capital injections have no `kind` or `category` field and must not appear in filtered views.

The existing search path (`$facet` with `$search`) follows the same rule: no `$unionWith`.

### `computeTotals` — `lib/transactions/repository.ts`

Add a parallel aggregation on `capitalInjections` for the same date window:

```ts
const capitalResult = (filters.kind === "all" && filters.category === "all" && !filters.search)
  ? db.collection("capitalInjections").aggregate([
      { $match: { projectId, occurredAt: { $gte: filters.from, $lte: endOfDay(filters.to) } } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]).toArray()
  : Promise.resolve([])
```

Run this in parallel with the existing `transactions` pipeline via `Promise.all`. Compute:

```ts
const capital = capitalResult[0]?.total ?? 0
return {
  revenue,
  expenses,
  capital,
  availableFunds: capital + revenue - expenses,
  transfersIn,
  transfersOut,
}
```

---

## UI

### `financials-view.tsx`

- `rows` prop type: `FinancialLedgerRow[]` (was `Transaction[]`)
- Replace Net tile with **Available Funds** tile showing `totals.availableFunds`
- Available Funds tile subtitle: `incl. ₹X capital` when `totals.capital > 0`
- Tone logic: `availableFunds < 0` → `"loss"` (red), otherwise neutral (no `"gain"` green — Available Funds is a balance, not a positive signal)

### `ledger-table.tsx`

- `rows` prop type: `FinancialLedgerRow[]`
- `fetchUnitsForRows` filters to rows where `_type === "transaction"` and `category === "sale"` before extracting unit IDs
- Table body: branch on `row._type`:
  - `"transaction"` → existing `LedgerRow` component (unchanged)
  - `"capital"` → new `CapitalInjectionLedgerRow` component

### `CapitalInjectionLedgerRow` (new, co-located in `ledger-table.tsx`)

A `<tr>` with the same column structure as transaction rows. Non-interactive (no click handler, no drilldown):

| Date | Kind | Category | Amount | Description | Buyer | Linked | Actions |
|------|------|----------|--------|-------------|-------|--------|---------|
| `occurredAt` | `<Badge>Capital</Badge>` (indigo outline) | — | `₹X,XX,XXX` | "Capital Injection" + notes if present | — | — | — |

No `RowActionsMenu`. Notes appear as muted text beneath "Capital Injection" in the description cell if present.

### `collapsible-section.tsx`

`useState(false)` → `useState(true)` so the Capital section is expanded by default.

---

## CSV Export — `app/api/export/ledger/route.ts`

`listLedger` now returns `FinancialLedgerRow[]`. Serialisation branches on `_type`:

- `"transaction"` → existing `rowToCsv` (unchanged)
- `"capital"` → new `capitalRowToCsv`: sets `kind="capital"`, `category=""`, `description="Capital Injection"`, `notes` from the record, all other transaction-specific columns (buyerName, reversalOf, transferGroupId, unitId) as empty strings

No change to CSV headers.

---

## Files to Create / Modify

| File | Change |
|------|--------|
| `lib/transactions/schemas.ts` | Add `TransactionLedgerRow`, `CapitalLedgerRow`, `FinancialLedgerRow` types |
| `lib/transactions/repository.ts` | Update `FinancialTotals` (add `capital`, `availableFunds`, remove `net`); update `listLedger` return type and pipeline; update `computeTotals` |
| `app/(authed)/projects/[id]/financials/financials-view.tsx` | Update `rows` prop type; replace Net tile with Available Funds |
| `app/(authed)/projects/[id]/financials/ledger-table.tsx` | Update `rows` prop type; add `CapitalInjectionLedgerRow`; branch on `_type` in render |
| `app/(authed)/projects/[id]/page.tsx` | Update type references from `Transaction[]` to `FinancialLedgerRow[]`; update `totals` destructuring (remove `net`, use `availableFunds`); narrow `ledgerRows` to `TransactionLedgerRow[]` before passing to `loadLinkedMaterials` and the `transferGroupId` lookup (both require fields absent on capital rows) |
| `app/(authed)/projects/[id]/collapsible-section.tsx` | Default open (`useState(true)`) |
| `app/api/export/ledger/route.ts` | Add `capitalRowToCsv`; branch on `_type` in row serialisation |

---

## Out of Scope

- Editing or deleting capital injection rows from the financials tab (read-only).
- Adding capital injections to the global `/financials` cross-project view.
- A drilldown sheet for capital injection rows.
- Changing the Capital collapsible section content or its data source.
