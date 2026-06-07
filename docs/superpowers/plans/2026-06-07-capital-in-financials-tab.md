# Capital in Financials Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface capital injections in the Financials tab as chronologically merged, date-filtered ledger rows and replace the Net tile with an Available Funds tile (Capital + Revenue − Expenses).

**Architecture:** MongoDB `$unionWith` merges `capitalInjections` into the `transactions` aggregation pipeline when no kind/category/search filter is active. A discriminated union type `FinancialLedgerRow` (`_type: "transaction" | "capital"`) threads through the stack. `FinancialTotals` gains `capital` and `availableFunds` fields; `net` is kept so the global /financials view needs no changes.

**Tech Stack:** Next.js 15 App Router, TypeScript, MongoDB native driver (`$unionWith`), Tailwind CSS, shadcn/ui `Badge`

---

## File Map

| File | Change |
|------|--------|
| `lib/transactions/schemas.ts` | Add `TransactionLedgerRow`, `CapitalLedgerRow`, `FinancialLedgerRow` types |
| `lib/transactions/repository.ts` | Extend `FinancialTotals`; rewrite `computeTotals`; rewrite `listLedger`; patch `listCrossProjectTotals` |
| `app/(authed)/projects/[id]/page.tsx` | Add `transactionRows` narrowing; fix `loadLinkedMaterials` + transfer lookup callers |
| `app/(authed)/projects/[id]/financials/financials-view.tsx` | Update `rows` prop type; replace Net tile with Available Funds |
| `app/(authed)/projects/[id]/financials/ledger-table.tsx` | Update `rows` prop type; add `CapitalInjectionLedgerRow`; branch on `_type` |
| `app/api/export/ledger/route.ts` | Add `capitalRowToCsv`; branch on `_type` in row serialisation |
| `app/(authed)/projects/[id]/collapsible-section.tsx` | Default open (`useState(true)`) |

---

## Task 1: Add `FinancialLedgerRow` discriminated union types

**Files:**
- Modify: `lib/transactions/schemas.ts` (append to end of file)

- [ ] **Step 1: Append the three new types to `lib/transactions/schemas.ts`**

Add after the last line of the file (after the `Transaction` type closing brace):

```ts
// ──────────────────────────────────────────────────────────────────────────
// Financials tab — unified ledger row (transactions + capital injections)
// ──────────────────────────────────────────────────────────────────────────

export type TransactionLedgerRow = Transaction & { _type: "transaction" }

export type CapitalLedgerRow = {
  _type: "capital"
  _id: ObjectId
  projectId: ObjectId
  amount: number
  occurredAt: Date
  notes?: string
  createdBy: ObjectId
  createdAt: Date
}

export type FinancialLedgerRow = TransactionLedgerRow | CapitalLedgerRow
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```
npx tsc --noEmit
```

Expected: no errors. (These are additive type aliases — nothing breaks.)

- [ ] **Step 3: Commit**

```
git add lib/transactions/schemas.ts
git commit -m "feat(financials): add FinancialLedgerRow discriminated union types"
```

---

## Task 2: Extend `FinancialTotals`, update `computeTotals`, patch `listCrossProjectTotals`

**Files:**
- Modify: `lib/transactions/repository.ts`

- [ ] **Step 1: Add `capital` and `availableFunds` to `FinancialTotals`**

Find the `FinancialTotals` type (around line 278) and replace it:

```ts
export type FinancialTotals = {
  revenue: number       // unchanged
  expenses: number      // unchanged
  net: number           // revenue - expenses (kept; global /financials view uses this)
  capital: number       // sum of capital injections in the filter window
  availableFunds: number // capital + revenue - expenses
  transfersIn: number   // unchanged
  transfersOut: number  // unchanged
}
```

- [ ] **Step 2: Rewrite `computeTotals` to run a parallel capital aggregation**

Replace the entire `computeTotals` function body with:

```ts
export async function computeTotals(
  projectId: ObjectId,
  filters: LedgerFilters
): Promise<FinancialTotals> {
  const db = getDb()
  const match = { ...buildLedgerMatch(filters), projectId }
  const searchStage = buildSearchStage(filters.search)
  const includeCapital =
    filters.kind === "all" && filters.category === "all" && !filters.search

  const txnPipeline: Record<string, unknown>[] = [
    ...(searchStage ? [searchStage] : []),
    { $match: match },
    {
      $facet: {
        byKind: [
          {
            $group: {
              _id: "$kind",
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
        ],
        byTransferCategory: [
          {
            $match: {
              category: { $in: ["transfer_in", "transfer_out"] },
            },
          },
          {
            $group: {
              _id: "$category",
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
        ],
      },
    },
  ]

  const [bundle, capitalResult] = await Promise.all([
    db
      .collection<Transaction>("transactions")
      .aggregate<{
        byKind: { _id: TransactionKind; total: number }[]
        byTransferCategory: { _id: "transfer_in" | "transfer_out"; total: number }[]
      }>(txnPipeline)
      .toArray(),
    includeCapital
      ? db
          .collection("capitalInjections")
          .aggregate<{ total: number }>([
            {
              $match: {
                projectId,
                occurredAt: { $gte: filters.from, $lte: endOfDay(filters.to) },
              },
            },
            { $group: { _id: null, total: { $sum: "$amount" } } },
          ])
          .toArray()
      : Promise.resolve([] as { total: number }[]),
  ])

  let revenue = 0
  let expenses = 0
  for (const r of bundle?.byKind ?? []) {
    if (r._id === "income") revenue = r.total
    else if (r._id === "expense") expenses = r.total
  }
  let transfersIn = 0
  let transfersOut = 0
  for (const r of bundle?.byTransferCategory ?? []) {
    if (r._id === "transfer_in") transfersIn = r.total
    else if (r._id === "transfer_out") transfersOut = r.total
  }
  const capital = capitalResult[0]?.total ?? 0
  return {
    revenue,
    expenses,
    net: revenue - expenses,
    capital,
    availableFunds: capital + revenue - expenses,
    transfersIn,
    transfersOut,
  }
}
```

- [ ] **Step 3: Patch `listCrossProjectTotals` to satisfy the updated `FinancialTotals` shape**

The global /financials view does not include capital (out of scope). Find the `perProject.push(...)` call inside `listCrossProjectTotals` and add the two new fields:

```ts
perProject.push({
  projectId: pid,
  projectName: nameById.get(pid) ?? "(unknown project)",
  revenue: totals.revenue,
  expenses: totals.expenses,
  net: totals.revenue - totals.expenses,
  capital: 0,
  availableFunds: totals.revenue - totals.expenses,
  transfersIn: totals.transfersIn,
  transfersOut: totals.transfersOut,
})
```

Then find the `return { overall: { ... }, perProject }` at the end of `listCrossProjectTotals` and add the two new fields to `overall`:

```ts
return {
  overall: {
    revenue: overallRevenue,
    expenses: overallExpenses,
    net: overallRevenue - overallExpenses,
    capital: 0,
    availableFunds: overallRevenue - overallExpenses,
    transfersIn: overallTransfersIn,
    transfersOut: overallTransfersOut,
  },
  perProject,
}
```

- [ ] **Step 4: Verify TypeScript compiles cleanly**

```
npx tsc --noEmit
```

Expected: no errors. (`FinancialTotals` gained fields; `net` was kept so all existing consumers still compile.)

- [ ] **Step 5: Commit**

```
git add lib/transactions/repository.ts
git commit -m "feat(financials): extend FinancialTotals with capital + availableFunds, update computeTotals"
```

---

## Task 3: Rewrite `listLedger` + fix `page.tsx` + fix export route

> **Note:** These three file changes are bundled into one task because rewriting `listLedger`'s return type from `Paginated<Transaction>` to `Paginated<FinancialLedgerRow>` immediately breaks two consumers (`page.tsx` and the export route). Fix all three before running the TypeScript check.

**Files:**
- Modify: `lib/transactions/repository.ts`
- Modify: `app/(authed)/projects/[id]/page.tsx`
- Modify: `app/api/export/ledger/route.ts`

- [ ] **Step 1: Add `FinancialLedgerRow` import to `lib/transactions/repository.ts`**

Find the import at the top of `lib/transactions/repository.ts`:

```ts
import type { Transaction, TransactionKind, LedgerFilters } from "./schemas"
```

Replace with:

```ts
import type {
  Transaction,
  TransactionKind,
  LedgerFilters,
  FinancialLedgerRow,
} from "./schemas"
```

- [ ] **Step 2: Replace the entire `listLedger` function with the unified aggregation pipeline**

Delete the existing `listLedger` function (from `export async function listLedger` to its closing `}`) and replace it with:

```ts
export async function listLedger(
  projectId: ObjectId,
  filters: LedgerFilters,
  page: number,
  pageSize: number,
): Promise<Paginated<FinancialLedgerRow>> {
  const db = getDb()
  const coll = db.collection<Transaction>("transactions")
  const match = { ...buildLedgerMatch(filters), projectId }
  const searchStage = buildSearchStage(filters.search)
  const skip = (page - 1) * pageSize
  const includeCapital =
    filters.kind === "all" && filters.category === "all" && !filters.search

  type FacetResult = {
    rows: FinancialLedgerRow[]
    total: { n: number }[]
  }

  const pipeline: Record<string, unknown>[] = [
    ...(searchStage ? [searchStage] : []),
    { $match: match },
    { $addFields: { _type: "transaction" } },
    ...(includeCapital
      ? [
          {
            $unionWith: {
              coll: "capitalInjections",
              pipeline: [
                {
                  $match: {
                    projectId,
                    occurredAt: {
                      $gte: filters.from,
                      $lte: endOfDay(filters.to),
                    },
                  },
                },
                { $addFields: { _type: "capital" } },
              ],
            },
          },
        ]
      : []),
    { $sort: { occurredAt: -1, _id: -1 } },
    {
      $facet: {
        rows: [{ $skip: skip }, { $limit: pageSize }],
        total: [{ $count: "n" }],
      },
    },
  ]

  const result = await coll.aggregate<FacetResult>(pipeline).toArray()
  const facet = result[0]
  return {
    rows: facet?.rows ?? [],
    total: facet?.total[0]?.n ?? 0,
  }
}
```

- [ ] **Step 3: Fix `page.tsx` — add `transactionRows` narrowing**

In `app/(authed)/projects/[id]/page.tsx`, find the import line:

```ts
import type { Transaction } from "@/lib/transactions/schemas"
```

Replace with:

```ts
import type { Transaction, TransactionLedgerRow } from "@/lib/transactions/schemas"
```

Then find these two lines (around line 209):

```ts
const ledgerRows = ledgerResult.rows
const ledgerTotal = ledgerResult.total
```

Add the narrowed array immediately after:

```ts
const ledgerRows = ledgerResult.rows
const ledgerTotal = ledgerResult.total
const transactionRows = ledgerRows.filter(
  (r): r is TransactionLedgerRow => r._type === "transaction"
)
```

Then find the `transferGroupIds` declaration (uses `ledgerRows`):

```ts
const transferGroupIds = ledgerRows
  .filter((r) => r.transferGroupId)
  .map((r) => r.transferGroupId!)
```

Replace with:

```ts
const transferGroupIds = transactionRows
  .filter((r) => r.transferGroupId)
  .map((r) => r.transferGroupId!)
```

Then find the `for (const row of ledgerRows)` loop (inside the `if (transferGroupIds.length > 0)` block, near the end of the block):

```ts
    for (const row of ledgerRows) {
      if (!row.transferGroupId) continue
      const peerId = peerProjectByGroup.get(row.transferGroupId.toHexString())
      if (!peerId) continue
      const peerName =
        peerProjectNameById.get(peerId.toHexString()) ?? "(unknown project)"
      otherProjectByRowId.set(row._id.toHexString(), peerName)
    }
```

Replace `ledgerRows` with `transactionRows`:

```ts
    for (const row of transactionRows) {
      if (!row.transferGroupId) continue
      const peerId = peerProjectByGroup.get(row.transferGroupId.toHexString())
      if (!peerId) continue
      const peerName =
        peerProjectNameById.get(peerId.toHexString()) ?? "(unknown project)"
      otherProjectByRowId.set(row._id.toHexString(), peerName)
    }
```

Then find the `loadLinkedMaterials` call:

```ts
const linkedMaterials = isAdmin
  ? await loadLinkedMaterials(ledgerRows, project.name)
  : new Map<
      string,
      { name: string; unit: string; qty: number; projectName: string }
    >()
```

Replace `ledgerRows` with `transactionRows`:

```ts
const linkedMaterials = isAdmin
  ? await loadLinkedMaterials(transactionRows, project.name)
  : new Map<
      string,
      { name: string; unit: string; qty: number; projectName: string }
    >()
```

- [ ] **Step 4: Fix `app/api/export/ledger/route.ts` — add capital row serialisation**

Add `CapitalLedgerRow` to the import at the top of the file:

```ts
import type { Transaction, CapitalLedgerRow } from "@/lib/transactions/schemas"
```

Add the `capitalRowToCsv` function after the existing `rowToCsv` function:

```ts
function capitalRowToCsv(r: CapitalLedgerRow, projectName: string) {
  return [
    r._id.toHexString(),
    r.projectId.toHexString(),
    projectName,
    isoDate(r.occurredAt),
    "capital",
    "",
    r.amount,
    "Capital Injection",
    "",
    r.notes ?? "",
    false,
    "",
    "",
    r.createdAt.toISOString(),
    r.createdBy.toHexString(),
  ]
}
```

Find the `rows.map` call in the `GET` handler:

```ts
rows.map((r) => rowToCsv(r, project.name)),
```

Replace with:

```ts
rows.map((r) =>
  r._type === "capital"
    ? capitalRowToCsv(r, project.name)
    : rowToCsv(r, project.name)
),
```

- [ ] **Step 5: Verify TypeScript compiles cleanly**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```
git add lib/transactions/repository.ts app/(authed)/projects/[id]/page.tsx app/api/export/ledger/route.ts
git commit -m "feat(financials): rewrite listLedger with \$unionWith for capital rows"
```

---

## Task 4: Update `financials-view.tsx` — replace Net tile with Available Funds

**Files:**
- Modify: `app/(authed)/projects/[id]/financials/financials-view.tsx`

- [ ] **Step 1: Update the `Transaction` import to `FinancialLedgerRow`**

Find:

```ts
import type { Transaction } from "@/lib/transactions/schemas"
```

Replace with:

```ts
import type { FinancialLedgerRow } from "@/lib/transactions/schemas"
```

- [ ] **Step 2: Update the `rows` prop type in the function signature**

Find:

```ts
  rows: Transaction[]
```

Replace with:

```ts
  rows: FinancialLedgerRow[]
```

- [ ] **Step 3: Replace the Net tile with Available Funds**

Find:

```tsx
        <Tile
          label="Net"
          value={`${totals.net < 0 ? "−" : ""}₹${INR.format(Math.abs(totals.net))}`}
          tone={totals.net < 0 ? "loss" : "gain"}
        />
```

Replace with:

```tsx
        <Tile
          label="Available Funds"
          value={`${totals.availableFunds < 0 ? "−" : ""}₹${INR.format(Math.abs(totals.availableFunds))}`}
          tone={totals.availableFunds < 0 ? "loss" : undefined}
          subtitle={
            totals.capital > 0
              ? `incl. ₹${INR.format(totals.capital)} capital`
              : null
          }
        />
```

- [ ] **Step 4: Update the empty-state message**

Find:

```tsx
      : "No transactions in this window."}
```

Replace with:

```tsx
      : "No entries in this window."}
```

- [ ] **Step 5: Verify TypeScript compiles cleanly**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```
git add "app/(authed)/projects/[id]/financials/financials-view.tsx"
git commit -m "feat(financials): replace Net tile with Available Funds, thread FinancialLedgerRow"
```

---

## Task 5: Update `ledger-table.tsx` — add `CapitalInjectionLedgerRow`, branch on `_type`

**Files:**
- Modify: `app/(authed)/projects/[id]/financials/ledger-table.tsx`

- [ ] **Step 1: Replace the file's imports**

Find:

```ts
import { ObjectId } from "mongodb"
import { Card } from "@/components/ui/card"
import type { Transaction } from "@/lib/transactions/schemas"
import type { Unit } from "@/lib/projects/schemas"
import { getDb } from "@/lib/db/client"
import { LedgerRow } from "./ledger-row"
```

Replace with:

```ts
import { ObjectId } from "mongodb"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type {
  FinancialLedgerRow,
  TransactionLedgerRow,
  CapitalLedgerRow,
} from "@/lib/transactions/schemas"
import type { Unit } from "@/lib/projects/schemas"
import { getDb } from "@/lib/db/client"
import { LedgerRow } from "./ledger-row"

const INR = new Intl.NumberFormat("en-IN")
```

- [ ] **Step 2: Update `fetchUnitsForRows` to narrow to transaction rows**

Find the entire `fetchUnitsForRows` function and replace it:

```ts
async function fetchUnitsForRows(
  rows: FinancialLedgerRow[],
): Promise<Map<string, string>> {
  const transactionRows = rows.filter(
    (r): r is TransactionLedgerRow => r._type === "transaction"
  )
  const unitIds = Array.from(
    new Set(
      transactionRows
        .filter((r) => r.category === "sale" && r.unitId)
        .map((r) => (r.unitId as ObjectId).toHexString()),
    ),
  )
  if (unitIds.length === 0) return new Map()
  const db = getDb()
  const docs = await db
    .collection<Unit>("units")
    .find({ _id: { $in: unitIds.map((id) => new ObjectId(id)) } })
    .project<{ _id: ObjectId; type: Unit["type"]; number: string }>({
      type: 1,
      number: 1,
    })
    .toArray()
  return new Map(
    docs.map((d) => [
      d._id.toHexString(),
      `${d.type === "apartment" ? "Apt" : "Parking"} ${d.number}`,
    ]),
  )
}
```

- [ ] **Step 3: Add `CapitalInjectionLedgerRow` component**

Add this function immediately after `fetchUnitsForRows` (before `LedgerTable`):

```tsx
function CapitalInjectionLedgerRow({ row }: { row: CapitalLedgerRow }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3 font-mono">
        {row.occurredAt.toLocaleDateString()}
      </td>
      <td className="px-4 py-3">
        <Badge
          variant="outline"
          className="border-indigo-400 text-indigo-600 dark:text-indigo-400"
        >
          Capital
        </Badge>
      </td>
      <td className="px-4 py-3" />
      <td className="px-4 py-3 text-right font-mono">
        ₹{INR.format(row.amount)}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        Capital Injection
        {row.notes ? (
          <span className="ml-1 text-xs">— {row.notes}</span>
        ) : null}
      </td>
      <td className="px-4 py-3" />
      <td className="px-4 py-3" />
      <td className="px-4 py-3" />
    </tr>
  )
}
```

- [ ] **Step 4: Update `LedgerTable` props type and table body**

Find the `LedgerTable` function signature's props type:

```ts
  rows: Transaction[]
```

Replace with:

```ts
  rows: FinancialLedgerRow[]
```

Find the `rows.map((r) => {` block inside `<tbody>` and replace the entire map with:

```tsx
          {rows.map((r) => {
            if (r._type === "capital") {
              return (
                <CapitalInjectionLedgerRow
                  key={r._id.toHexString()}
                  row={r}
                />
              )
            }
            const id = r._id.toHexString()
            const unitLabel =
              r.unitId && r.category === "sale"
                ? (unitLabels.get((r.unitId as ObjectId).toHexString()) ?? "")
                : ""
            return (
              <LedgerRow
                key={id}
                row={{
                  _id: id,
                  occurredAt: r.occurredAt.toISOString(),
                  kind: r.kind,
                  category: r.category,
                  amount: r.amount,
                  description: r.description,
                  buyerName: r.buyerName ?? null,
                  notes: r.notes ?? null,
                  voided: r.voided === true,
                  isReversal: r.reversalOf != null,
                  transferGroupId:
                    r.transferGroupId
                      ? r.transferGroupId.toHexString()
                      : null,
                  unitLabel,
                  peerProjectName: otherProjectByRowId.get(id) ?? null,
                }}
                linkedMaterial={linkedMaterials?.get(id)}
              />
            )
          })}
```

- [ ] **Step 5: Verify TypeScript compiles cleanly**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```
git add "app/(authed)/projects/[id]/financials/ledger-table.tsx"
git commit -m "feat(financials): render capital injection rows in ledger table"
```

---

## Task 6: Default-open Capital section + manual smoke test

**Files:**
- Modify: `app/(authed)/projects/[id]/collapsible-section.tsx`

- [ ] **Step 1: Change the default state to open**

Find:

```ts
  const [open, setOpen] = useState(false)
```

Replace with:

```ts
  const [open, setOpen] = useState(true)
```

- [ ] **Step 2: Commit**

```
git add "app/(authed)/projects/[id]/collapsible-section.tsx"
git commit -m "feat(financials): open Capital section by default"
```

- [ ] **Step 3: Start the dev server and verify**

```
npm run dev
```

Open a project detail page that has capital injections. Verify:

1. **Capital section** (above tabs) opens automatically — no click needed to see the tiles and injection table.
2. **Financials tab** — the three tiles show **Revenue**, **Expenses**, **Available Funds** (not "Net"). When capital injections exist in the date window, the Available Funds tile shows a subtitle `incl. ₹X capital`.
3. **Ledger table** — capital injection rows appear interleaved with transaction rows in reverse-chronological order. Each capital row shows an indigo "Capital" badge in the Kind column, the amount, and "Capital Injection" (with notes if present) in the Description column. No action menu, no drilldown on click.
4. **Filter behaviour** — select `Kind = Income` or `Kind = Expense`: capital rows disappear. Clear the filter: capital rows return.
5. **Export CSV** — click "Export CSV" and open the file. Capital rows have `kind=capital`, `category=` (empty), `description=Capital Injection`.
6. **Search** — type a search term: capital rows are absent (search applies to transactions only).
