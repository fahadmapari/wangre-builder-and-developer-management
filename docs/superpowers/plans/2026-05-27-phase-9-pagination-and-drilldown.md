# Phase 9 — Pagination + Drilldown Sheets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MongoDB-level pagination (page size 50) to every unbounded table — ledger, money/material transfers, units list, movements sheet — and add a unified drilldown sheet (Details + History tabs) on row click that subsumes per-row History buttons across the app.

**Architecture:** Repository functions evolve to return `{ rows, total }` with `page`/`pageSize` parameters; server-rendered pages parse `?page=N` (or `?moneyPage` / `?materialPage` for the dual-tab transfers page) and render an inline `<Pagination>` component mirroring the audit page's pattern. The movements sheet keeps its existing client-side fetch model and gains React-state pagination via the `/api/movements` route. Drilldown is a shared `<DrilldownSheet>` client component that calls a `fetchDrilldownDetail` server action for Details and lazy-loads the History tab via the existing `getEntityHistoryAction`. Row-click trigger lives in per-table `<*Row>` client wrappers; the actions cell calls `e.stopPropagation()` to keep inline actions working.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · MongoDB native driver (skip/limit + `$facet` for Atlas Search aggregation) · shadcn/ui (`Sheet`, `Tabs`) · Tailwind v4.

**Project conventions to follow:**
- **No automated tests.** Project convention (Phases 2–8). Verification is `npm run typecheck` + `npm run lint` per task and manual T-tasks at the end. Do NOT add a Vitest/Jest setup.
- Auth: `await requireAuth()` / `requireAdmin()` is the first executable line of every server action and protected page.
- Date helpers use LOCAL components (`getFullYear`/`getMonth()+1`/`getDate`/`padStart`), never `toISOString().slice(0,10)`.
- `serverApi.strict: false` stays on the Mongo client (required for Atlas Search).
- Cross-domain import cycle between `lib/transactions/repository.ts` ↔ `lib/materials/repository.ts` is real; keep all cross-module references inside function bodies, never at module top level.
- Use `Promise.all` for independent reads; never await sequentially when independent.
- Server actions return `ActionResult<T>` discriminated union: `{ ok: true; data: T } | { ok: false; error: string; field?: string }`.

---

## File structure

**New files (6):**

| File | Responsibility |
|---|---|
| `lib/drilldown/schemas.ts` | `DrilldownEntityType` union + `DrilldownDetail` discriminated union types |
| `lib/drilldown/actions.ts` | `fetchDrilldownDetail` server action; per-variant DB lookups + FM auth gating |
| `app/(authed)/components/drilldown-sheet.tsx` | Shared `<DrilldownSheet>` client component (panel + tabs) |
| `app/(authed)/projects/[id]/financials/ledger-row.tsx` | Client `<LedgerRow>` wrapper — row click → drilldown |
| `app/(authed)/transfers/money-transfer-row.tsx` | Client `<MoneyTransferRow>` wrapper |
| `app/(authed)/transfers/material-transfer-row.tsx` | Client `<MaterialTransferRow>` wrapper |

**Modified files (~13):**

| File | Changes |
|---|---|
| `lib/transactions/repository.ts` | `listLedger` + `listMoneyTransfers` return `{rows,total}`, accept `page`/`pageSize` |
| `lib/materials/repository.ts` | `listMaterialTransfers` + new `listMovements` paginated; existing `listMovementsForMaterial` stays for backward-compat callers |
| `lib/projects/repository.ts` | `listUnitsForProject` signature extended to accept `page`/`pageSize` and return `{rows,total}` |
| `app/(authed)/projects/[id]/page.tsx` | Parse `?page=N`, fetch paginated units + ledger, pass `total`/`page`/`pageSize` to children |
| `app/(authed)/projects/[id]/financials/financials-view.tsx` | New `total`/`page`/`pageSize` props; render `<Pagination>` |
| `app/(authed)/projects/[id]/financials/ledger-table.tsx` | Replace inline `<tr>` with `<LedgerRow>` client wrapper |
| `app/(authed)/projects/[id]/financials/ledger-filters.tsx` | Strip `page` from URL on every filter/search change |
| `app/(authed)/projects/[id]/financials/row-actions-menu.tsx` | Remove the standalone History button |
| `app/(authed)/projects/[id]/inventory/inventory-table.tsx` | Accept `page`/`pageSize`, render `<Pagination>`, click-to-drilldown rows |
| `app/(authed)/projects/[id]/inventory/inventory-filters.tsx` | Strip `page` from URL on filter change |
| `app/(authed)/transfers/page.tsx` | Parse `?moneyPage` + `?materialPage`, paginate both tabs |
| `app/(authed)/transfers/money-transfers-table.tsx` | `<Pagination>`, `<MoneyTransferRow>` wrapper, drop History button |
| `app/(authed)/transfers/material-transfers-table.tsx` | `<Pagination>`, `<MaterialTransferRow>` wrapper, drop History button |
| `app/(authed)/financials/global-filters.tsx` | Strip `page`/`moneyPage`/`materialPage` from URL on filter change (used by both /financials and /transfers) |
| `app/(authed)/projects/[id]/materials/movements-sheet.tsx` | Client-side `useState` page; Prev/Next; drilldown row click; drop inline `<HistoryDialog>` |
| `app/api/movements/route.ts` | Accept `page`/`pageSize` query params; return `{rows,total}` |

**Total: ~19 files.**

---

## Task ordering rationale

1. **Group A (Tasks 1–6)** — Repository pagination. Pure DB layer, no UI yet. Each task touches one function and ships independently.
2. **Group B (Tasks 7–12)** — Pagination UI wiring. Each surface (per-project page, transfers, movements) ships its `<Pagination>` independently.
3. **Group C (Tasks 13–15)** — Drilldown infrastructure (schemas → server action → shared component). Tasks 13–14 are admin-only safe to ship even before any UI calls them.
4. **Group D (Tasks 16–20)** — Drilldown UI wiring per surface; History-button cleanup per surface.
5. **Group E (Task 21)** — Final verification (typecheck/lint/T-tasks).

---

## Group A — Repository pagination

### Task 1: Paginate `listLedger`

**Files:**
- Modify: `lib/transactions/repository.ts` (the `listLedger` function around lines 220–246)

- [ ] **Step 1: Add a paginated return type alias near the top of the file (after the existing imports/types)**

Find the existing `FinancialTotals` type definition (around line 248) and add this just above it:

```ts
export type Paginated<T> = {
  rows: T[]
  total: number
}
```

- [ ] **Step 2: Rewrite `listLedger` to accept page/pageSize and return `Paginated<Transaction>`**

Replace the entire `listLedger` function (currently lines 223–246) with:

```ts
/**
 * Returns the filtered ledger for a single project, paginated. Newest first.
 * Page is 1-based. Out-of-range pages return { rows: [], total }.
 */
export async function listLedger(
  projectId: ObjectId,
  filters: LedgerFilters,
  page: number,
  pageSize: number,
): Promise<Paginated<Transaction>> {
  const db = getDb()
  const coll = db.collection<Transaction>("transactions")
  const match = { ...buildLedgerMatch(filters), projectId }
  const searchStage = buildSearchStage(filters.search)
  const skip = (page - 1) * pageSize

  if (searchStage) {
    type FacetResult = {
      rows: Transaction[]
      total: { n: number }[]
    }
    const result = await coll
      .aggregate<FacetResult>([
        searchStage,
        { $match: match },
        { $sort: { occurredAt: -1, _id: -1 } },
        {
          $facet: {
            rows: [{ $skip: skip }, { $limit: pageSize }],
            total: [{ $count: "n" }],
          },
        },
      ])
      .toArray()
    const facet = result[0]
    return {
      rows: facet?.rows ?? [],
      total: facet?.total[0]?.n ?? 0,
    }
  }

  const [rows, total] = await Promise.all([
    coll
      .find(match)
      .sort({ occurredAt: -1, _id: -1 })
      .skip(skip)
      .limit(pageSize)
      .toArray(),
    coll.countDocuments(match),
  ])
  return { rows, total }
}
```

- [ ] **Step 3: Verify typecheck still passes; existing callers will now error (expected)**

Run: `npm run typecheck`
Expected: ERRORS in `app/(authed)/projects/[id]/page.tsx` and `app/api/export/ledger/route.ts` complaining about the changed signature. Note them — they're fixed in later tasks. Do NOT touch them in this task.

- [ ] **Step 4: Fix the ledger export Route Handler (the only caller besides the page, which Task 9 fixes)**

The export Route Handler must NOT paginate — it streams the full filtered set. So it calls `listLedger` with page=1 and a very large pageSize. Modify `app/api/export/ledger/route.ts`:

Find the line that calls `listLedger(projectId, filters)` (around line 60–80, search for `listLedger(`). Change it to:

```ts
const { rows } = await listLedger(projectObjectId, filters, 1, 1_000_000)
```

(One million rows is the practical export ceiling. Phase 8 ships full export; we keep that semantic.)

Then in the row-mapping `for` loop further down, replace any reference to the result variable being a plain `Transaction[]` with the new `rows` variable (the function now returns `{ rows, total }`, so destructure as above). The rest of the CSV-writing logic is unchanged.

- [ ] **Step 5: Typecheck again — only `app/(authed)/projects/[id]/page.tsx` should still error**

Run: `npm run typecheck`
Expected: ONE remaining error in `app/(authed)/projects/[id]/page.tsx` about the `listLedger` call. That's intentional; Task 9 fixes it.

- [ ] **Step 6: Commit**

```bash
git add lib/transactions/repository.ts app/api/export/ledger/route.ts
git commit -m "feat(phase-9): paginate listLedger; export route uses full-window read"
```

---

### Task 2: Paginate `listMoneyTransfers`

**Files:**
- Modify: `lib/transactions/repository.ts` (the `listMoneyTransfers` function around lines 927–1031)

- [ ] **Step 1: Rewrite `listMoneyTransfers` to paginate at the candidate aggregation**

Replace the entire `listMoneyTransfers` function with the version below. The change: instead of grouping `{$in: [transfer_in, transfer_out]}` legs by `transferGroupId`, we match only the canonical source leg (`category: "transfer_out"`, `reversalOf: $exists: false`), sort, and `$facet` for paged ids + total. Enrichment then fetches all legs for the page's group ids and builds rows preserving page order.

```ts
export async function listMoneyTransfers(
  range: { from: Date; to: Date },
  page: number,
  pageSize: number,
): Promise<Paginated<MoneyTransferRow>> {
  const db = getDb()
  const fromDate = new Date(range.from)
  const toDate = endOfDay(range.to)
  const skip = (page - 1) * pageSize

  type CandFacet = {
    rows: Array<{ transferGroupId: ObjectId; occurredAt: Date; _id: ObjectId }>
    total: { n: number }[]
  }
  const candFacets = await db
    .collection<Transaction>("transactions")
    .aggregate<CandFacet>([
      {
        $match: {
          transferGroupId: { $exists: true },
          category: "transfer_out",
          occurredAt: { $gte: fromDate, $lte: toDate },
          reversalOf: { $exists: false },
        },
      },
      { $sort: { occurredAt: -1, _id: -1 } },
      {
        $facet: {
          rows: [
            { $skip: skip },
            { $limit: pageSize },
            { $project: { _id: 1, transferGroupId: 1, occurredAt: 1 } },
          ],
          total: [{ $count: "n" }],
        },
      },
    ])
    .toArray()
  const facet = candFacets[0]
  const sourceLegs = facet?.rows ?? []
  const total = facet?.total[0]?.n ?? 0
  if (sourceLegs.length === 0) return { rows: [], total }

  const groupIds = sourceLegs.map((s) => s.transferGroupId)
  const allRows = await db
    .collection<Transaction>("transactions")
    .find({ transferGroupId: { $in: groupIds } })
    .toArray()

  const byGroup = new Map<string, Transaction[]>()
  for (const row of allRows) {
    const key = row.transferGroupId!.toHexString()
    const bucket = byGroup.get(key) ?? []
    bucket.push(row)
    byGroup.set(key, bucket)
  }

  const projectIds = new Set<string>()
  const userIds = new Set<string>()
  for (const row of allRows) {
    projectIds.add(row.projectId.toHexString())
    userIds.add(row.createdBy.toHexString())
  }
  const projectsList = await db
    .collection<Project>("projects")
    .find({ _id: { $in: [...projectIds].map((id) => new ObjectId(id)) } })
    .project<{ _id: ObjectId; name: string }>({ name: 1 })
    .toArray()
  const projectNameById = new Map(
    projectsList.map((p) => [p._id.toHexString(), p.name]),
  )
  const usersList = await db
    .collection<{ _id: ObjectId; name?: string; email?: string }>("users")
    .find({ _id: { $in: [...userIds].map((id) => new ObjectId(id)) } })
    .project<{ _id: ObjectId; name?: string; email?: string }>({ name: 1, email: 1 })
    .toArray()
  const userNameById = new Map(
    usersList.map((u) => [u._id.toHexString(), u.name ?? u.email ?? null]),
  )

  const rows: MoneyTransferRow[] = []
  for (const source of sourceLegs) {
    const groupKey = source.transferGroupId.toHexString()
    const legs = byGroup.get(groupKey)
    if (!legs) continue
    const originals = legs.filter((r) => !r.reversalOf)
    const reversals = legs.filter((r) => r.reversalOf)
    const sourceLeg = originals.find((r) => r.category === "transfer_out")
    const destLeg = originals.find((r) => r.category === "transfer_in")
    if (!sourceLeg || !destLeg) continue

    const reversedAt =
      reversals.length > 0
        ? reversals.reduce(
            (min, r) => (min === null || r.createdAt < min ? r.createdAt : min),
            null as Date | null,
          )
        : null

    rows.push({
      transferGroupId: groupKey,
      sourceTxId: sourceLeg._id.toHexString(),
      occurredAt: sourceLeg.occurredAt,
      sourceProjectId: sourceLeg.projectId.toHexString(),
      sourceProjectName:
        projectNameById.get(sourceLeg.projectId.toHexString()) ??
        "(unknown project)",
      destProjectId: destLeg.projectId.toHexString(),
      destProjectName:
        projectNameById.get(destLeg.projectId.toHexString()) ??
        "(unknown project)",
      amount: sourceLeg.amount,
      description: sourceLeg.description,
      status: reversals.length > 0 ? "reversed" : "active",
      reversedAt,
      createdBy: sourceLeg.createdBy.toHexString(),
      createdByName:
        userNameById.get(sourceLeg.createdBy.toHexString()) ?? null,
    })
  }
  // Page order already established by the candidate $sort; do not re-sort here.
  return { rows, total }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: error in `app/(authed)/transfers/page.tsx` about the changed signature (Task 10 fixes it). No other consumers exist for this function.

- [ ] **Step 3: Commit**

```bash
git add lib/transactions/repository.ts
git commit -m "feat(phase-9): paginate listMoneyTransfers at candidate aggregation"
```

---

### Task 3: Paginate `listMaterialTransfers`

**Files:**
- Modify: `lib/materials/repository.ts` (the `listMaterialTransfers` function around lines 774–end-of-fn)

- [ ] **Step 1: Find the end of the existing `listMaterialTransfers` function**

Run a Grep for `^export async function listMaterialTransfers` in `lib/materials/repository.ts` and read from there to the closing `}` to know the exact line range you're replacing.

- [ ] **Step 2: Rewrite `listMaterialTransfers` to paginate at the candidate aggregation**

Replace the entire `listMaterialTransfers` function with the version below. Same pattern as Task 2 but on `materialMovements` and with the material lookup.

```ts
export async function listMaterialTransfers(
  range: { from: Date; to: Date },
  page: number,
  pageSize: number,
): Promise<Paginated<MaterialTransferRow>> {
  const db = getDb()
  const fromDate = new Date(range.from)
  const toDate = new Date(range.to)
  toDate.setHours(23, 59, 59, 999)
  const skip = (page - 1) * pageSize

  type CandFacet = {
    rows: Array<{
      _id: ObjectId
      transferGroupId: ObjectId
      occurredAt: Date
    }>
    total: { n: number }[]
  }
  const candFacets = await db
    .collection<MaterialMovement>("materialMovements")
    .aggregate<CandFacet>([
      {
        $match: {
          transferGroupId: { $exists: true },
          category: "transfer_out",
          occurredAt: { $gte: fromDate, $lte: toDate },
          reversalOf: { $exists: false },
        },
      },
      { $sort: { occurredAt: -1, _id: -1 } },
      {
        $facet: {
          rows: [
            { $skip: skip },
            { $limit: pageSize },
            { $project: { _id: 1, transferGroupId: 1, occurredAt: 1 } },
          ],
          total: [{ $count: "n" }],
        },
      },
    ])
    .toArray()
  const facet = candFacets[0]
  const sourceLegs = facet?.rows ?? []
  const total = facet?.total[0]?.n ?? 0
  if (sourceLegs.length === 0) return { rows: [], total }

  const groupIds = sourceLegs.map((s) => s.transferGroupId)
  const allRows = await db
    .collection<MaterialMovement>("materialMovements")
    .find({ transferGroupId: { $in: groupIds } })
    .toArray()

  const byGroup = new Map<string, MaterialMovement[]>()
  for (const row of allRows) {
    const key = row.transferGroupId!.toHexString()
    const bucket = byGroup.get(key) ?? []
    bucket.push(row)
    byGroup.set(key, bucket)
  }

  const projectIds = new Set<string>()
  const materialIds = new Set<string>()
  const userIds = new Set<string>()
  for (const row of allRows) {
    projectIds.add(row.projectId.toHexString())
    materialIds.add(row.materialId.toHexString())
    userIds.add(row.createdBy.toHexString())
  }
  const projectsList = await db
    .collection<Project>("projects")
    .find({ _id: { $in: [...projectIds].map((id) => new ObjectId(id)) } })
    .project<{ _id: ObjectId; name: string }>({ name: 1 })
    .toArray()
  const projectNameById = new Map(
    projectsList.map((p) => [p._id.toHexString(), p.name]),
  )
  const materialsList = await db
    .collection<Material>("materials")
    .find({ _id: { $in: [...materialIds].map((id) => new ObjectId(id)) } })
    .toArray()
  const materialById = new Map(
    materialsList.map((m) => [m._id.toHexString(), m]),
  )
  const usersList = await db
    .collection<{ _id: ObjectId; name?: string; email?: string }>("users")
    .find({ _id: { $in: [...userIds].map((id) => new ObjectId(id)) } })
    .project<{ _id: ObjectId; name?: string; email?: string }>({ name: 1, email: 1 })
    .toArray()
  const userNameById = new Map(
    usersList.map((u) => [u._id.toHexString(), u.name ?? u.email ?? null]),
  )

  const rows: MaterialTransferRow[] = []
  for (const source of sourceLegs) {
    const groupKey = source.transferGroupId.toHexString()
    const legs = byGroup.get(groupKey)
    if (!legs) continue
    const originals = legs.filter((r) => !r.reversalOf)
    const reversals = legs.filter((r) => r.reversalOf)
    const sourceLeg = originals.find((r) => r.category === "transfer_out")
    const destLeg = originals.find((r) => r.category === "transfer_in")
    if (!sourceLeg || !destLeg) continue

    const material = materialById.get(sourceLeg.materialId.toHexString())
    if (!material) continue

    const reversedAt =
      reversals.length > 0
        ? reversals.reduce(
            (min, r) => (min === null || r.createdAt < min ? r.createdAt : min),
            null as Date | null,
          )
        : null

    rows.push({
      transferGroupId: groupKey,
      sourceMovId: sourceLeg._id.toHexString(),
      occurredAt: sourceLeg.occurredAt,
      sourceProjectId: sourceLeg.projectId.toHexString(),
      sourceProjectName:
        projectNameById.get(sourceLeg.projectId.toHexString()) ??
        "(unknown project)",
      destProjectId: destLeg.projectId.toHexString(),
      destProjectName:
        projectNameById.get(destLeg.projectId.toHexString()) ??
        "(unknown project)",
      materialId: sourceLeg.materialId.toHexString(),
      materialName: material.name,
      materialUnit: material.unit,
      materialUnitOther: material.unitOther,
      qty: sourceLeg.qty,
      status: reversals.length > 0 ? "reversed" : "active",
      reversedAt,
      createdBy: sourceLeg.createdBy.toHexString(),
      createdByName:
        userNameById.get(sourceLeg.createdBy.toHexString()) ?? null,
    })
  }
  return { rows, total }
}
```

- [ ] **Step 3: Re-export `Paginated<T>` from `lib/materials/repository.ts` if it's defined only in `lib/transactions/repository.ts`**

The cleanest option: define `Paginated<T>` once and import it in both repos. Add this near the top of `lib/materials/repository.ts` (with the other imports — note this triggers the known cross-domain import cycle pattern, which is safe because `Paginated` is a type-only import):

```ts
import type { Paginated } from "@/lib/transactions/repository"
```

(Type-only imports do not create runtime edges, so they're safe even though the value-level cycle warning applies to function imports.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: error in `app/(authed)/transfers/page.tsx` about the changed signature only. No other callers.

- [ ] **Step 5: Commit**

```bash
git add lib/materials/repository.ts
git commit -m "feat(phase-9): paginate listMaterialTransfers at candidate aggregation"
```

---

### Task 4: Add paginated `listUnitsForProject`

**Files:**
- Modify: `lib/projects/repository.ts` (the `listUnitsForProject` function around lines 44–57)

- [ ] **Step 1: Extend `listUnitsForProject` to take page/pageSize and return `Paginated<Unit>`**

Replace the function:

```ts
export async function listUnitsForProject(
  projectId: ObjectId,
  filters: UnitFilters,
  page: number,
  pageSize: number,
): Promise<Paginated<Unit>> {
  const db = getDb()
  const query: Record<string, unknown> = { projectId }
  if (filters.types.length > 0) query.type = { $in: filters.types }
  if (filters.statuses.length > 0) query.status = { $in: filters.statuses }
  const skip = (page - 1) * pageSize
  const coll = db.collection<Unit>("units")
  const [rows, total] = await Promise.all([
    coll.find(query).sort({ floor: 1, number: 1 }).skip(skip).limit(pageSize).toArray(),
    coll.countDocuments(query),
  ])
  return { rows, total }
}
```

- [ ] **Step 2: Add the `Paginated` type import to `lib/projects/repository.ts`**

```ts
import type { Paginated } from "@/lib/transactions/repository"
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: error in `app/(authed)/projects/[id]/inventory/inventory-table.tsx` about the changed signature only.

- [ ] **Step 4: Commit**

```bash
git add lib/projects/repository.ts
git commit -m "feat(phase-9): paginate listUnitsForProject"
```

---

### Task 5: Add paginated `listMovements`

**Files:**
- Modify: `lib/materials/repository.ts` (add a new function next to `listMovementsForMaterial` around line 202)

- [ ] **Step 1: Add `listMovements` next to the existing `listMovementsForMaterial`**

KEEP `listMovementsForMaterial` (it has no other callers but removing it adds risk for no value). Add this new function directly below it:

```ts
/**
 * Paginated version of listMovementsForMaterial. Used by the movements sheet's
 * client-side pagination via /api/movements.
 */
export async function listMovements(
  projectId: ObjectId,
  materialId: ObjectId,
  page: number,
  pageSize: number,
): Promise<Paginated<MaterialMovement>> {
  const db = getDb()
  const coll = db.collection<MaterialMovement>("materialMovements")
  const query = { projectId, materialId }
  const skip = (page - 1) * pageSize
  const [rows, total] = await Promise.all([
    coll.find(query).sort({ occurredAt: -1, createdAt: -1 }).skip(skip).limit(pageSize).toArray(),
    coll.countDocuments(query),
  ])
  return { rows, total }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean (no callers yet).

- [ ] **Step 3: Commit**

```bash
git add lib/materials/repository.ts
git commit -m "feat(phase-9): add paginated listMovements"
```

---

## Group B — Pagination UI wiring

### Task 6: Wire ledger pagination into the per-project page

**Files:**
- Modify: `app/(authed)/projects/[id]/page.tsx`
- Modify: `app/(authed)/projects/[id]/financials/financials-view.tsx`

- [ ] **Step 1: Parse `?page=N` in the per-project page**

In `app/(authed)/projects/[id]/page.tsx`, add this helper above `parseFilters` (find where the existing `isoDate` helper is, just below it):

```ts
function parsePage(raw: string | undefined): number {
  if (!raw) return 1
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return 1
  return n
}

const LEDGER_PAGE_SIZE = 50
```

- [ ] **Step 2: Extend `AllSearchParams` to include `page`**

Find the `type AllSearchParams = ...` declaration (around line 98) and add `page?: string`:

```ts
type AllSearchParams = InventoryFilterParams & {
  from?: string
  to?: string
  kind?: string
  category?: string
  voided?: string
  search?: string
  page?: string
  unitsPage?: string
}
```

(`unitsPage` is added now so Task 7 doesn't have to revisit this file.)

- [ ] **Step 3: Compute `page` and pass paginated args into `listLedger` / `computeTotals`**

Find the existing call site (around lines 122–148). Replace the `filters` / `Promise.all` block with this version:

```ts
const filters = parseLedgerFilters(sp)
const page = parsePage(sp.page)
const defaultFromIso = isoDate(defaultLedgerFrom())
const defaultToIso = isoDate(defaultLedgerTo())

const exportParams = new URLSearchParams()
exportParams.set("projectId", id)
exportParams.set("from", isoDate(filters.from))
exportParams.set("to", isoDate(filters.to))
if (filters.kind !== "all") exportParams.set("kind", filters.kind)
if (filters.category !== "all") exportParams.set("category", filters.category)
exportParams.set("voided", filters.includeVoided ? "all" : "active")
if (filters.search) exportParams.set("search", filters.search)
const ledgerExportHref = `/api/export/ledger?${exportParams.toString()}`

const [project, soldCount, revenue, materialRows, catalog, ledgerResult, totals, allProjects] =
  await Promise.all([
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
  ])
if (!project) notFound()

const ledgerRows = ledgerResult.rows
const ledgerTotal = ledgerResult.total
```

- [ ] **Step 4: Update the `<FinancialsView>` invocation**

Find the `<FinancialsView>` element (around lines 270–282) and add three new props:

```tsx
financials={
  isAdmin ? (
    <FinancialsView
      projectId={id}
      rows={ledgerRows}
      totals={totals}
      defaultFrom={defaultFromIso}
      defaultTo={defaultToIso}
      projects={projectsForPicker}
      otherProjectByRowId={otherProjectByRowId}
      linkedMaterials={linkedMaterials}
      search={filters.search}
      ledgerExportHref={ledgerExportHref}
      page={page}
      pageSize={LEDGER_PAGE_SIZE}
      total={ledgerTotal}
      currentSearchParams={sp}
    />
  ) : undefined
}
```

`currentSearchParams={sp}` is needed by the inline `<Pagination>` component to build hrefs that preserve filters.

- [ ] **Step 5: Update `<FinancialsView>` props and add an inline `<Pagination>` component**

Replace `app/(authed)/projects/[id]/financials/financials-view.tsx` entirely with this version. (It's the simplest way given the multiple changes — copy preserves the existing tile/header/list layout.)

```tsx
import type { Transaction } from "@/lib/transactions/schemas"
import type { FinancialTotals } from "@/lib/transactions/repository"
import { Button } from "@/components/ui/button"
import { LedgerFilters } from "./ledger-filters"
import { LedgerTable } from "./ledger-table"
import { AddIncomeButton } from "./add-income-dialog"
import { AddExpenseButton } from "./add-expense-dialog"
import { MoneyTransferButton, type ProjectPickerEntry } from "@/app/(authed)/transfers/money-transfer-dialog"

const INR = new Intl.NumberFormat("en-IN")

export function FinancialsView({
  projectId,
  rows,
  totals,
  defaultFrom,
  defaultTo,
  projects,
  otherProjectByRowId,
  linkedMaterials,
  search,
  ledgerExportHref,
  page,
  pageSize,
  total,
  currentSearchParams,
}: {
  projectId: string
  rows: Transaction[]
  totals: FinancialTotals
  defaultFrom: string
  defaultTo: string
  projects: ProjectPickerEntry[]
  otherProjectByRowId: Map<string, string>
  linkedMaterials?: Map<
    string,
    { name: string; unit: string; qty: number; projectName: string }
  >
  search?: string
  ledgerExportHref: string
  page: number
  pageSize: number
  total: number
  currentSearchParams: Record<string, string | string[] | undefined>
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const entriesLine =
    total === 0
      ? "No entries in this window."
      : total <= pageSize
        ? `${total} entr${total === 1 ? "y" : "ies"} in this window.`
        : `Showing ${rows.length} of ${total} entries.`

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile
          label="Revenue"
          value={`₹${INR.format(totals.revenue)}`}
          subtitle={
            totals.transfersIn > 0
              ? `incl. ₹${INR.format(totals.transfersIn)} transfers in`
              : null
          }
        />
        <Tile
          label="Expenses"
          value={`₹${INR.format(totals.expenses)}`}
          subtitle={
            totals.transfersOut > 0
              ? `incl. ₹${INR.format(totals.transfersOut)} transfers out`
              : null
          }
        />
        <Tile
          label="Net"
          value={`${totals.net < 0 ? "−" : ""}₹${INR.format(Math.abs(totals.net))}`}
          tone={totals.net < 0 ? "loss" : "gain"}
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{entriesLine}</p>
        <div className="flex gap-2">
          <AddIncomeButton projectId={projectId} />
          <AddExpenseButton projectId={projectId} />
          <MoneyTransferButton projects={projects} lockedSource={projectId} />
          <Button asChild variant="outline" size="sm">
            <a href={ledgerExportHref} download>
              Export CSV
            </a>
          </Button>
        </div>
      </div>
      <LedgerFilters defaultFrom={defaultFrom} defaultTo={defaultTo} />
      {search ? (
        <p className="text-sm text-muted-foreground">
          Showing matches for{" "}
          <span className="font-medium text-foreground">&quot;{search}&quot;</span>
          {" — "}use the search input above to refine or clear.
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="rounded border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          {search
            ? "No transactions match your search."
            : "No transactions in this window."}
        </p>
      ) : (
        <LedgerTable
          rows={rows}
          otherProjectByRowId={otherProjectByRowId}
          linkedMaterials={linkedMaterials}
        />
      )}
      <Pagination
        current={page}
        totalPages={totalPages}
        searchParams={currentSearchParams}
      />
    </div>
  )
}

function Pagination({
  current,
  totalPages,
  searchParams,
}: {
  current: number
  totalPages: number
  searchParams: Record<string, string | string[] | undefined>
}) {
  if (totalPages <= 1) return null
  const base = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (k === "page") continue
    if (typeof v === "string") base.set(k, v)
  }
  const hrefFor = (p: number) => {
    const q = new URLSearchParams(base)
    q.set("page", String(p))
    return `?${q.toString()}`
  }
  return (
    <nav className="flex items-center gap-3 text-sm">
      <PaginationLink href={hrefFor(current - 1)} disabled={current <= 1} label="← Prev" />
      <span className="text-muted-foreground">
        Page {current} of {totalPages}
      </span>
      <PaginationLink
        href={hrefFor(current + 1)}
        disabled={current >= totalPages}
        label="Next →"
      />
    </nav>
  )
}

function PaginationLink({ href, disabled, label }: { href: string; disabled: boolean; label: string }) {
  if (disabled) {
    return <span className="text-muted-foreground">{label}</span>
  }
  return (
    <a className="text-primary hover:underline" href={href}>
      {label}
    </a>
  )
}

function Tile({
  label,
  value,
  subtitle,
  tone,
}: {
  label: string
  value: string
  subtitle?: string | null
  tone?: "gain" | "loss"
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={
          "font-mono text-xl " +
          (tone === "loss" ? "text-destructive" : "")
        }
      >
        {value}
      </span>
      {subtitle ? (
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: clean for the ledger surface. Errors remain in transfers page + inventory table (later tasks).

- [ ] **Step 7: Commit**

```bash
git add app/(authed)/projects/[id]/page.tsx app/(authed)/projects/[id]/financials/financials-view.tsx
git commit -m "feat(phase-9): wire ledger pagination into per-project page"
```

---

### Task 7: Wire units pagination into the per-project page

**Files:**
- Modify: `app/(authed)/projects/[id]/inventory/inventory-table.tsx`
- Modify: `app/(authed)/projects/[id]/page.tsx` (small additional change)

- [ ] **Step 1: Add `UNITS_PAGE_SIZE` constant and pass `unitsPage` into `<InventoryTable>`**

In `app/(authed)/projects/[id]/page.tsx`, add the constant near `LEDGER_PAGE_SIZE`:

```ts
const UNITS_PAGE_SIZE = 50
```

Find the `<InventoryTable>` invocation (inside `<ProjectTabs>`, around lines 250–256) and replace:

```tsx
inventory={
  <div className="flex flex-col gap-2">
    <InventoryFilters />
    <InventoryTable
      projectId={id}
      role={user.role}
      searchParams={sp}
      page={parsePage(sp.unitsPage)}
      pageSize={UNITS_PAGE_SIZE}
      currentSearchParams={sp}
    />
  </div>
}
```

- [ ] **Step 2: Rewrite `inventory-table.tsx` to be paginated**

Replace the whole file:

```tsx
import { ObjectId } from "mongodb"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  listUnitsForProject,
  type UnitFilters,
} from "@/lib/projects/repository"
import type { UnitStatus, UnitType } from "@/lib/projects/schemas"
import type { Role } from "@/types"
import { MarkSoldButton } from "./mark-sold-dialog"
import { UnmarkButton } from "./unmark-confirm-dialog"

const INR = new Intl.NumberFormat("en-IN")

function formatRupees(n: number): string {
  return `₹${INR.format(n)}`
}

function formatDate(d?: Date): string {
  return d ? d.toLocaleDateString() : ""
}

export type InventoryFilterParams = {
  type?: string
  status?: string
}

function parseFilters(p: InventoryFilterParams): UnitFilters {
  const types: UnitType[] =
    p.type === "parking"
      ? ["parking"]
      : p.type === "all"
        ? []
        : ["apartment"]
  const statuses: UnitStatus[] =
    p.status === "sold"
      ? ["sold"]
      : p.status === "all"
        ? []
        : ["available"]
  return { types, statuses }
}

export async function InventoryTable({
  projectId,
  role,
  searchParams,
  page,
  pageSize,
  currentSearchParams,
}: {
  projectId: string
  role: Role
  searchParams: InventoryFilterParams
  page: number
  pageSize: number
  currentSearchParams: Record<string, string | string[] | undefined>
}) {
  const filters = parseFilters(searchParams)
  const { rows: units, total } = await listUnitsForProject(
    new ObjectId(projectId),
    filters,
    page,
    pageSize,
  )

  if (units.length === 0) {
    return (
      <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
        No units match these filters.
      </Card>
    )
  }

  const showActions = role === "admin"
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="flex flex-col gap-3">
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Number</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Floor</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Buyer</th>
              <th className="px-4 py-3">Sold price</th>
              <th className="px-4 py-3">Sold date</th>
              {showActions ? <th className="px-4 py-3" /> : null}
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={String(u._id)} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-mono">{u.number}</td>
                <td className="px-4 py-3 capitalize">{u.type}</td>
                <td className="px-4 py-3 font-mono">{u.floor}</td>
                <td className="px-4 py-3">
                  <Badge variant={u.status === "sold" ? "default" : "secondary"}>
                    {u.status === "sold" ? "Sold" : "Available"}
                  </Badge>
                </td>
                <td className="px-4 py-3">{u.buyerName ?? ""}</td>
                <td className="px-4 py-3 font-mono">
                  {u.soldPriceTotal ? formatRupees(u.soldPriceTotal) : ""}
                </td>
                <td className="px-4 py-3">{formatDate(u.soldAt)}</td>
                {showActions ? (
                  <td className="px-4 py-3 text-right">
                    {u.status === "available" ? (
                      <MarkSoldButton
                        projectId={projectId}
                        unitId={String(u._id)}
                        unitType={u.type}
                        unitNumber={u.number}
                      />
                    ) : (
                      <UnmarkButton
                        unitId={String(u._id)}
                        unitType={u.type}
                        unitNumber={u.number}
                      />
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <UnitsPagination
        current={page}
        totalPages={totalPages}
        searchParams={currentSearchParams}
      />
    </div>
  )
}

function UnitsPagination({
  current,
  totalPages,
  searchParams,
}: {
  current: number
  totalPages: number
  searchParams: Record<string, string | string[] | undefined>
}) {
  if (totalPages <= 1) return null
  const base = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (k === "unitsPage") continue
    if (typeof v === "string") base.set(k, v)
  }
  const hrefFor = (p: number) => {
    const q = new URLSearchParams(base)
    q.set("unitsPage", String(p))
    return `?${q.toString()}`
  }
  return (
    <nav className="flex items-center gap-3 text-sm">
      <PaginationLink href={hrefFor(current - 1)} disabled={current <= 1} label="← Prev" />
      <span className="text-muted-foreground">
        Page {current} of {totalPages}
      </span>
      <PaginationLink
        href={hrefFor(current + 1)}
        disabled={current >= totalPages}
        label="Next →"
      />
    </nav>
  )
}

function PaginationLink({ href, disabled, label }: { href: string; disabled: boolean; label: string }) {
  if (disabled) {
    return <span className="text-muted-foreground">{label}</span>
  }
  return (
    <a className="text-primary hover:underline" href={href}>
      {label}
    </a>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean for the inventory + ledger surfaces. Transfers errors remain.

- [ ] **Step 4: Commit**

```bash
git add app/(authed)/projects/[id]/page.tsx app/(authed)/projects/[id]/inventory/inventory-table.tsx
git commit -m "feat(phase-9): wire units pagination into per-project page"
```

---

### Task 8: Wire pagination into the transfers page (both tabs)

**Files:**
- Modify: `app/(authed)/transfers/page.tsx`
- Modify: `app/(authed)/transfers/money-transfers-table.tsx`
- Modify: `app/(authed)/transfers/material-transfers-table.tsx`

- [ ] **Step 1: Replace `app/(authed)/transfers/page.tsx` with the paginated version**

```tsx
import { requireAdmin } from "@/lib/auth/session"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { listMoneyTransfers } from "@/lib/transactions/repository"
import { listMaterialTransfers, listCatalog } from "@/lib/materials/repository"
import { listProjects } from "@/lib/projects/repository"
import { GlobalFilters } from "@/app/(authed)/financials/global-filters"
import { MoneyTransfersTable } from "./money-transfers-table"
import { MaterialTransfersTable } from "./material-transfers-table"
import { MoneyTransferButton } from "./money-transfer-dialog"
import { MaterialTransferButton } from "./material-transfer-dialog"

const TRANSFERS_PAGE_SIZE = 50

function startOfYear(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), 0, 1)
}

function parseDate(raw: string | undefined, fallback: Date): Date {
  if (!raw) return fallback
  const d = new Date(raw)
  return isNaN(d.getTime()) ? fallback : d
}

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function parsePage(raw: string | undefined): number {
  if (!raw) return 1
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return 1
  return n
}

function formatUnit(unit: string, unitOther?: string): string {
  if (unit === "other") return unitOther || "—"
  if (unit === "m2") return "m²"
  if (unit === "m3") return "m³"
  return unit
}

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireAdmin()
  const sp = await searchParams
  const defaultFrom = startOfYear()
  const defaultTo = new Date()
  const range = {
    from: parseDate(sp.from, defaultFrom),
    to: parseDate(sp.to, defaultTo),
  }
  const moneyPage = parsePage(sp.moneyPage)
  const materialPage = parsePage(sp.materialPage)

  const [moneyResult, materialResult, projects, catalog] = await Promise.all([
    listMoneyTransfers(range, moneyPage, TRANSFERS_PAGE_SIZE),
    listMaterialTransfers(range, materialPage, TRANSFERS_PAGE_SIZE),
    listProjects(),
    listCatalog(),
  ])

  const projectOptions = projects.map((p) => ({
    id: p._id.toHexString(),
    name: p.name,
  }))
  const materialOptions = catalog.map((m) => ({
    id: m._id.toHexString(),
    name: m.name,
    unitLabel: formatUnit(m.unit, m.unitOther),
  }))

  return (
    <div className="flex flex-col gap-4 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Transfers</h1>
        <p className="text-sm text-muted-foreground">
          Inter-project money and material transfers, across all projects.
        </p>
      </header>
      <GlobalFilters defaultFrom={isoDate(defaultFrom)} defaultTo={isoDate(defaultTo)} />
      <Tabs defaultValue="money" className="w-full">
        <TabsList>
          <TabsTrigger value="money">Money</TabsTrigger>
          <TabsTrigger value="material">Material</TabsTrigger>
        </TabsList>
        <TabsContent value="money" className="flex flex-col gap-3">
          <div className="flex justify-end">
            <MoneyTransferButton projects={projectOptions} />
          </div>
          <MoneyTransfersTable
            rows={moneyResult.rows}
            page={moneyPage}
            pageSize={TRANSFERS_PAGE_SIZE}
            total={moneyResult.total}
            searchParams={sp}
          />
        </TabsContent>
        <TabsContent value="material" className="flex flex-col gap-3">
          <div className="flex justify-end">
            <MaterialTransferButton
              projects={projectOptions}
              materials={materialOptions}
            />
          </div>
          <MaterialTransfersTable
            rows={materialResult.rows}
            page={materialPage}
            pageSize={TRANSFERS_PAGE_SIZE}
            total={materialResult.total}
            searchParams={sp}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

Note: the `isoDate` helper changed from `toISOString().slice(0,10)` to local components — this matches the Phase 8 convention. This is a bug fix that lands incidentally with this task.

- [ ] **Step 2: Update `money-transfers-table.tsx` to accept pagination props and render Prev/Next**

For now, KEEP the existing per-row History button — Task 17 will remove it. Replace the file:

```tsx
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { MoneyTransferRow } from "@/lib/transfers/schemas"
import { HistorySheet } from "@/app/(authed)/components/history-sheet"
import { ReverseTransferButton } from "./reverse-transfer-dialog"

const INR = new Intl.NumberFormat("en-IN")

function fmtDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function MoneyTransfersTable({
  rows,
  page,
  pageSize,
  total,
  searchParams,
}: {
  rows: MoneyTransferRow[]
  page: number
  pageSize: number
  total: number
  searchParams: Record<string, string | string[] | undefined>
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  if (rows.length === 0) {
    return (
      <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
        No money transfers in this date range.
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">From → To</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created by</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.transferGroupId}
                className="border-b border-border last:border-0"
              >
                <td className="px-4 py-3 font-mono text-xs">{fmtDate(r.occurredAt)}</td>
                <td className="px-4 py-3">
                  <span>{r.sourceProjectName}</span>
                  <span className="px-2 text-muted-foreground">→</span>
                  <span>{r.destProjectName}</span>
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  ₹{INR.format(r.amount)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.description}</td>
                <td className="px-4 py-3">
                  {r.status === "reversed" ? (
                    <Badge variant="secondary">
                      Reversed{r.reversedAt ? ` on ${fmtDate(r.reversedAt)}` : ""}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Active</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {r.createdByName ?? "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <HistorySheet
                      entityType="transaction"
                      entityId={r.sourceTxId}
                      trigger={
                        <Button variant="ghost" size="sm">
                          History
                        </Button>
                      }
                    />
                    {r.status === "active" ? (
                      <ReverseTransferButton
                        transferGroupId={r.transferGroupId}
                        kind="money"
                        summary={`${r.sourceProjectName} → ${r.destProjectName} · ₹${INR.format(r.amount)}`}
                      />
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <MoneyPagination
        current={page}
        totalPages={totalPages}
        searchParams={searchParams}
      />
    </div>
  )
}

function MoneyPagination({
  current,
  totalPages,
  searchParams,
}: {
  current: number
  totalPages: number
  searchParams: Record<string, string | string[] | undefined>
}) {
  if (totalPages <= 1) return null
  const base = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (k === "moneyPage") continue
    if (typeof v === "string") base.set(k, v)
  }
  const hrefFor = (p: number) => {
    const q = new URLSearchParams(base)
    q.set("moneyPage", String(p))
    return `?${q.toString()}`
  }
  return (
    <nav className="flex items-center gap-3 text-sm">
      <PaginationLink href={hrefFor(current - 1)} disabled={current <= 1} label="← Prev" />
      <span className="text-muted-foreground">
        Page {current} of {totalPages}
      </span>
      <PaginationLink
        href={hrefFor(current + 1)}
        disabled={current >= totalPages}
        label="Next →"
      />
    </nav>
  )
}

function PaginationLink({ href, disabled, label }: { href: string; disabled: boolean; label: string }) {
  if (disabled) {
    return <span className="text-muted-foreground">{label}</span>
  }
  return (
    <a className="text-primary hover:underline" href={href}>
      {label}
    </a>
  )
}
```

- [ ] **Step 3: Update `material-transfers-table.tsx` analogously**

Replace the file with the version below. Again keep History button — Task 18 removes it.

```tsx
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { MaterialTransferRow } from "@/lib/transfers/schemas"
import type { MaterialUnit } from "@/lib/materials/schemas"
import { HistorySheet } from "@/app/(authed)/components/history-sheet"
import { ReverseTransferButton } from "./reverse-transfer-dialog"

function fmtDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function formatUnit(unit: MaterialUnit, unitOther?: string): string {
  if (unit === "other") return unitOther || "—"
  if (unit === "m2") return "m²"
  if (unit === "m3") return "m³"
  return unit
}

export function MaterialTransfersTable({
  rows,
  page,
  pageSize,
  total,
  searchParams,
}: {
  rows: MaterialTransferRow[]
  page: number
  pageSize: number
  total: number
  searchParams: Record<string, string | string[] | undefined>
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  if (rows.length === 0) {
    return (
      <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
        No material transfers in this date range.
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">From → To</th>
              <th className="px-4 py-3">Material</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created by</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const unitLabel = formatUnit(r.materialUnit, r.materialUnitOther)
              return (
                <tr
                  key={r.transferGroupId}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-3 font-mono text-xs">
                    {fmtDate(r.occurredAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span>{r.sourceProjectName}</span>
                    <span className="px-2 text-muted-foreground">→</span>
                    <span>{r.destProjectName}</span>
                  </td>
                  <td className="px-4 py-3">{r.materialName}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {r.qty} {unitLabel}
                  </td>
                  <td className="px-4 py-3">
                    {r.status === "reversed" ? (
                      <Badge variant="secondary">
                        Reversed{r.reversedAt ? ` on ${fmtDate(r.reversedAt)}` : ""}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Active</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.createdByName ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <HistorySheet
                        entityType="movement"
                        entityId={r.sourceMovId}
                        trigger={
                          <Button variant="ghost" size="sm">
                            History
                          </Button>
                        }
                      />
                      {r.status === "active" ? (
                        <ReverseTransferButton
                          transferGroupId={r.transferGroupId}
                          kind="material"
                          summary={`${r.sourceProjectName} → ${r.destProjectName} · ${r.qty} ${unitLabel} ${r.materialName}`}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
      <MaterialPagination
        current={page}
        totalPages={totalPages}
        searchParams={searchParams}
      />
    </div>
  )
}

function MaterialPagination({
  current,
  totalPages,
  searchParams,
}: {
  current: number
  totalPages: number
  searchParams: Record<string, string | string[] | undefined>
}) {
  if (totalPages <= 1) return null
  const base = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (k === "materialPage") continue
    if (typeof v === "string") base.set(k, v)
  }
  const hrefFor = (p: number) => {
    const q = new URLSearchParams(base)
    q.set("materialPage", String(p))
    return `?${q.toString()}`
  }
  return (
    <nav className="flex items-center gap-3 text-sm">
      <PaginationLink href={hrefFor(current - 1)} disabled={current <= 1} label="← Prev" />
      <span className="text-muted-foreground">
        Page {current} of {totalPages}
      </span>
      <PaginationLink
        href={hrefFor(current + 1)}
        disabled={current >= totalPages}
        label="Next →"
      />
    </nav>
  )
}

function PaginationLink({ href, disabled, label }: { href: string; disabled: boolean; label: string }) {
  if (disabled) {
    return <span className="text-muted-foreground">{label}</span>
  }
  return (
    <a className="text-primary hover:underline" href={href}>
      {label}
    </a>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean for all of Group B's repository surfaces.

- [ ] **Step 5: Commit**

```bash
git add app/(authed)/transfers/page.tsx app/(authed)/transfers/money-transfers-table.tsx app/(authed)/transfers/material-transfers-table.tsx
git commit -m "feat(phase-9): paginate transfers page (money + material tabs)"
```

---

### Task 9: Strip `page` params from filter components on change

**Files:**
- Modify: `app/(authed)/projects/[id]/financials/ledger-filters.tsx`
- Modify: `app/(authed)/projects/[id]/inventory/inventory-filters.tsx`
- Modify: `app/(authed)/financials/global-filters.tsx`

Filter components currently mutate the existing URLSearchParams (`new URLSearchParams(sp.toString())`). When `?page=N` is set and the user changes a filter, `page=N` carries over to the new URL — which means a filter change preserves a stale page index. Each filter component needs to delete the relevant page params on every URL rebuild.

- [ ] **Step 1: Patch `ledger-filters.tsx`**

Find the three helpers `applySearch`, `clearSearch` (uses `applySearch`), and `setParam` (current lines ~57–90). After each `const params = new URLSearchParams(sp.toString())` / `const next = new URLSearchParams(sp.toString())` line, insert `params.delete("page")` (or `next.delete("page")`).

Concretely, change `applySearch` to:

```ts
function applySearch(next: string) {
  const trimmed = next.trim()
  const params = new URLSearchParams(sp.toString())
  params.delete("page")
  if (trimmed.length >= 2) params.set("search", trimmed)
  else params.delete("search")
  startTransition(() => {
    router.replace(`?${params.toString()}`, { scroll: false })
  })
}
```

And `setParam` to:

```ts
function setParam(key: string, value: string) {
  const next = new URLSearchParams(sp.toString())
  next.delete("page")
  next.set(key, value)
  startTransition(() => {
    router.replace(`?${next.toString()}`, { scroll: false })
  })
}
```

`clearSearch` already calls `applySearch("")`, so no further change.

- [ ] **Step 2: Patch `inventory-filters.tsx`**

Find `setParam` (around line 27). Change to:

```ts
function setParam(key: "type" | "status", value: string) {
  const next = new URLSearchParams(sp.toString())
  next.delete("unitsPage")
  next.set(key, value)
  startTransition(() => {
    router.replace(`?${next.toString()}`, { scroll: false })
  })
}
```

- [ ] **Step 3: Patch `global-filters.tsx`**

`<GlobalFilters>` is used by `/financials` AND `/transfers`. It should clear ALL page params used by either consumer: `page`, `moneyPage`, `materialPage`.

Find `setParam` (around line 22). Change to:

```ts
function setParam(key: string, value: string) {
  const next = new URLSearchParams(sp.toString())
  next.delete("page")
  next.delete("moneyPage")
  next.delete("materialPage")
  next.delete("unitsPage")
  next.set(key, value)
  startTransition(() => {
    router.replace(`?${next.toString()}`, { scroll: false })
  })
}
```

- [ ] **Step 4: Typecheck + lint**

```bash
npm run typecheck
npm run lint
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add app/(authed)/projects/[id]/financials/ledger-filters.tsx app/(authed)/projects/[id]/inventory/inventory-filters.tsx app/(authed)/financials/global-filters.tsx
git commit -m "fix(phase-9): reset page params on every filter change"
```

---

### Task 10: Paginate the movements sheet

**Files:**
- Modify: `app/api/movements/route.ts`
- Modify: `app/(authed)/projects/[id]/materials/movements-sheet.tsx`

- [ ] **Step 1: Update `app/api/movements/route.ts` to accept `page`/`pageSize` and return `{rows,total}`**

Replace the file:

```ts
import { ObjectId } from "mongodb"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth/session"
import { listMovements } from "@/lib/materials/repository"

const DEFAULT_PAGE_SIZE = 50

function parsePage(raw: string | null): number {
  if (!raw) return 1
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return 1
  return n
}

function parsePageSize(raw: string | null): number {
  if (!raw) return DEFAULT_PAGE_SIZE
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return DEFAULT_PAGE_SIZE
  return Math.min(200, n)
}

export async function GET(req: Request) {
  const user = await requireAuth()
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get("projectId") ?? ""
  const materialId = searchParams.get("materialId") ?? ""
  if (!ObjectId.isValid(projectId) || !ObjectId.isValid(materialId)) {
    return NextResponse.json({ rows: [], total: 0 }, { status: 400 })
  }
  const page = parsePage(searchParams.get("page"))
  const pageSize = parsePageSize(searchParams.get("pageSize"))
  const { rows: movements, total } = await listMovements(
    new ObjectId(projectId),
    new ObjectId(materialId),
    page,
    pageSize,
  )
  const stripMoney = user.role !== "admin"
  const rows = movements.map((m) => ({
    _id: String(m._id),
    kind: m.kind,
    category: m.category,
    qty: m.qty,
    amount: stripMoney ? undefined : m.amount,
    purpose: m.purpose,
    notes: m.notes,
    occurredAt: m.occurredAt.toISOString(),
    voided: m.voided === true ? true : undefined,
  }))
  return NextResponse.json({ rows, total })
}
```

- [ ] **Step 2: Update the movements sheet to manage client-side page state + Prev/Next**

Replace `app/(authed)/projects/[id]/materials/movements-sheet.tsx`. The `<HistoryDialog>` per-row is KEPT for now — Task 20 removes it. The current Reverse / row-actions structure inside the sheet is unchanged.

```tsx
"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { HistoryDialog } from "@/app/(authed)/components/history-sheet"
import type { MaterialMovement } from "@/lib/materials/schemas"
import type { Role } from "@/types"

const INR = new Intl.NumberFormat("en-IN")
const PAGE_SIZE = 50

type MovementRow = {
  _id: string
  kind: "in" | "out"
  category: MaterialMovement["category"]
  qty: number
  amount?: number
  purpose?: string
  notes?: string
  occurredAt: string
  voided?: boolean
}

function categoryLabel(c: MovementRow["category"]): string {
  switch (c) {
    case "purchase": return "Purchase"
    case "return": return "Return"
    case "consumption": return "Consumption"
    case "transfer_in": return "Transfer in"
    case "transfer_out": return "Transfer out"
  }
}

export function MovementsSheetButton({
  projectId,
  materialId,
  materialName,
  unitLabel,
  role,
}: {
  projectId: string
  materialId: string
  materialName: string
  unitLabel: string
  role: Role
}) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<MovementRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setRows(null)
    setError(null)
    fetch(
      `/api/movements?projectId=${projectId}&materialId=${materialId}&page=${page}&pageSize=${PAGE_SIZE}`,
      { cache: "no-store" },
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: { rows: MovementRow[]; total: number }) => {
        if (!cancelled) {
          setRows(data.rows)
          setTotal(data.total)
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load history.")
      })
    return () => {
      cancelled = true
    }
  }, [open, projectId, materialId, page])

  const loading = open && rows === null && error === null
  const showAmount = role === "admin"
  const isAdmin = role === "admin"
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
      >
        History
      </Button>
      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) {
            setRows(null)
            setError(null)
            setPage(1)
            setTotal(0)
          }
        }}
      >
        <SheetContent side="right" className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{materialName} — movement history</SheetTitle>
            <SheetDescription>
              Newest first. Quantities in {unitLabel}.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 flex flex-col gap-3">
            {error ? (
              <p className="text-sm text-destructive" role="alert">{error}</p>
            ) : loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !rows || rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No movements yet.</p>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2">Date</th>
                      <th className="py-2">Type</th>
                      <th className="py-2 text-right">Qty</th>
                      {showAmount ? <th className="py-2 text-right">Amount</th> : null}
                      <th className="py-2">Purpose / notes</th>
                      {isAdmin ? <th className="py-2 text-right">Actions</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r._id}
                        className="border-b border-border last:border-0"
                      >
                        <td className="py-2 font-mono">
                          {new Date(r.occurredAt).toLocaleDateString()}
                        </td>
                        <td className="py-2">
                          <Badge variant={r.kind === "in" ? "default" : "secondary"}>
                            {categoryLabel(r.category)}
                          </Badge>
                        </td>
                        <td className="py-2 text-right font-mono">
                          {r.kind === "in" ? "+" : "−"}
                          {r.qty}
                        </td>
                        {showAmount ? (
                          <td className="py-2 text-right font-mono">
                            {r.amount != null ? `₹${INR.format(r.amount)}` : ""}
                          </td>
                        ) : null}
                        <td className="py-2 text-muted-foreground">
                          {[r.purpose, r.notes].filter(Boolean).join(" — ")}
                        </td>
                        {isAdmin ? (
                          <td className="py-2 text-right">
                            <HistoryDialog
                              entityType="movement"
                              entityId={r._id}
                              trigger={
                                <Button variant="ghost" size="sm">
                                  History
                                </Button>
                              }
                            />
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {totalPages > 1 ? (
                  <nav className="flex items-center justify-end gap-3 text-sm">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      ← Prev
                    </Button>
                    <span className="text-muted-foreground">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next →
                    </Button>
                  </nav>
                ) : null}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
```

- [ ] **Step 3: Typecheck + lint**

```bash
npm run typecheck
npm run lint
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/api/movements/route.ts app/(authed)/projects/[id]/materials/movements-sheet.tsx
git commit -m "feat(phase-9): paginate movements sheet (client state) + API"
```

---

## Group C — Drilldown infrastructure

### Task 11: Drilldown schemas

**Files:**
- Create: `lib/drilldown/schemas.ts`

- [ ] **Step 1: Write the file**

```ts
import { z } from "zod"

// Entity types the drilldown sheet knows how to render. Five variants because
// money/material transfers render differently from plain transactions even
// though they share underlying collections.
export const DrilldownEntityTypeSchema = z.enum([
  "transaction",
  "movement",
  "unit",
  "money_transfer",
  "material_transfer",
])
export type DrilldownEntityType = z.infer<typeof DrilldownEntityTypeSchema>

// Per-variant Details payload. The shapes are kept minimal — the sheet renders
// labelled rows in whatever order the variant lists.
export type TransactionDrilldown =
  | {
      entityType: "transaction"
      kind: "sale"
      occurredAt: Date
      amount: number
      buyerName: string
      unitLabel: string | null    // "Apt 4B" / "Parking P2" / null when unit is missing
      description: string
      voided: boolean
      isReversal: boolean
      reversedById: string | null  // hex of the reversing tx, if any
      linkedMovement: {
        materialName: string
        qty: number
        unitLabel: string
      } | null
    }
  | {
      entityType: "transaction"
      kind: "purchase"
      occurredAt: Date
      amount: number
      description: string
      voided: boolean
      isReversal: boolean
      reversedById: string | null
      linkedMovement: {
        materialName: string
        qty: number
        projectName: string
      } | null
    }
  | {
      entityType: "transaction"
      kind: "transfer"
      occurredAt: Date
      amount: number
      direction: "in" | "out"
      peerProjectName: string
      transferGroupId: string  // hex
      isReversal: boolean
      reversedAt: Date | null
    }
  | {
      entityType: "transaction"
      kind: "adhoc"
      occurredAt: Date
      amount: number
      txKind: "income" | "expense"
      description: string
      notes: string | null
      voided: boolean
      isReversal: boolean
      reversedById: string | null
    }

export type MovementDrilldown = {
  entityType: "movement"
  occurredAt: Date
  materialName: string
  qty: number
  unitLabel: string
  category: "purchase" | "return" | "consumption" | "transfer_in" | "transfer_out"
  amount: number | null    // null for FM callers
  purpose: string | null
  notes: string | null
  voided: boolean
  peerProjectName: string | null  // set only when category is transfer_in/out
}

export type UnitDrilldown = {
  entityType: "unit"
  type: "apartment" | "parking"
  number: string
  floor: number | null
  status: "available" | "sold"
  soldPriceTotal: number | null    // null for FM callers and for available units
  buyerName: string | null
  soldAt: Date | null
}

export type MoneyTransferDrilldown = {
  entityType: "money_transfer"
  sourceProjectName: string
  destProjectName: string
  amount: number
  occurredAt: Date
  transferGroupId: string
  status: "active" | "reversed"
  reversedAt: Date | null
}

export type MaterialTransferDrilldown = {
  entityType: "material_transfer"
  sourceProjectName: string
  destProjectName: string
  materialName: string
  qty: number
  unitLabel: string
  occurredAt: Date
  transferGroupId: string
  status: "active" | "reversed"
  reversedAt: Date | null
}

export type DrilldownDetail =
  | TransactionDrilldown
  | MovementDrilldown
  | UnitDrilldown
  | MoneyTransferDrilldown
  | MaterialTransferDrilldown
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/drilldown/schemas.ts
git commit -m "feat(phase-9): add DrilldownDetail discriminated union schemas"
```

---

### Task 12: `fetchDrilldownDetail` server action

**Files:**
- Create: `lib/drilldown/actions.ts`

- [ ] **Step 1: Write the file**

The server action branches on `entityType`. Admin-only types (`transaction`, `money_transfer`) call `requireAdmin`; FM-allowed types (`movement`, `unit`, `material_transfer`) call `requireAuth` and strip money fields for FMs.

```ts
"use server"

import { ObjectId } from "mongodb"
import { requireAdmin, requireAuth } from "@/lib/auth/session"
import { getDb } from "@/lib/db/client"
import type { ActionResult } from "@/types"
import type {
  DrilldownDetail,
  DrilldownEntityType,
} from "./schemas"
import { DrilldownEntityTypeSchema } from "./schemas"
import type { Transaction } from "@/lib/transactions/schemas"
import type {
  Material,
  MaterialMovement,
  MaterialUnit,
} from "@/lib/materials/schemas"
import type { Unit } from "@/lib/projects/schemas"

function formatUnit(unit: MaterialUnit, unitOther?: string): string {
  if (unit === "other") return unitOther || "unit"
  if (unit === "m2") return "m²"
  if (unit === "m3") return "m³"
  return unit
}

function unitLabel(u: { type: Unit["type"]; number: string }): string {
  return `${u.type === "apartment" ? "Apt" : "Parking"} ${u.number}`
}

// Local helper types used inside the transaction-sale / transaction-purchase
// branches of fetchDrilldownDetail. Defined here (before the function) so the
// reading order matches the usage order.
type LinkedMovementSale = {
  materialName: string
  qty: number
  unitLabel: string
}
type LinkedMovementPurchase = {
  materialName: string
  qty: number
  projectName: string
}

export async function fetchDrilldownDetail(
  rawEntityType: string,
  entityId: string,
): Promise<ActionResult<DrilldownDetail>> {
  const parsed = DrilldownEntityTypeSchema.safeParse(rawEntityType)
  if (!parsed.success) {
    return { ok: false, error: "Invalid entity type." }
  }
  const entityType: DrilldownEntityType = parsed.data
  if (!ObjectId.isValid(entityId)) {
    return { ok: false, error: "Invalid entity id." }
  }
  const oid = new ObjectId(entityId)
  const db = getDb()

  try {
    switch (entityType) {
      case "transaction":
      case "money_transfer": {
        await requireAdmin()
        const tx = await db
          .collection<Transaction>("transactions")
          .findOne({ _id: oid })
        if (!tx) return { ok: false, error: "Transaction not found." }

        if (entityType === "money_transfer" || tx.category === "transfer_in" || tx.category === "transfer_out") {
          // Render as money_transfer regardless of which variant was requested
          // — both surfaces present the same fields.
          const peer = await db
            .collection<Transaction>("transactions")
            .findOne({
              transferGroupId: tx.transferGroupId,
              _id: { $ne: tx._id },
              reversalOf: { $exists: false },
            })
          const reversal = await db
            .collection<Transaction>("transactions")
            .findOne({ reversalOf: tx._id })
          const sourceLeg = tx.category === "transfer_out" ? tx : (peer ?? tx)
          const destLeg = tx.category === "transfer_in" ? tx : (peer ?? tx)
          const [sourceProj, destProj] = await Promise.all([
            db.collection<{ _id: ObjectId; name: string }>("projects").findOne({ _id: sourceLeg.projectId }, { projection: { name: 1 } }),
            db.collection<{ _id: ObjectId; name: string }>("projects").findOne({ _id: destLeg.projectId }, { projection: { name: 1 } }),
          ])
          return {
            ok: true,
            data: {
              entityType: "money_transfer",
              sourceProjectName: sourceProj?.name ?? "(unknown project)",
              destProjectName: destProj?.name ?? "(unknown project)",
              amount: sourceLeg.amount,
              occurredAt: sourceLeg.occurredAt,
              transferGroupId: tx.transferGroupId?.toHexString() ?? "",
              status: reversal ? "reversed" : "active",
              reversedAt: reversal?.createdAt ?? null,
            },
          }
        }

        const isReversal = tx.reversalOf != null
        const reversedBy = await db
          .collection<Transaction>("transactions")
          .findOne({ reversalOf: tx._id }, { projection: { _id: 1 } })
        const reversedById = reversedBy?._id.toHexString() ?? null

        if (tx.category === "sale") {
          let unitLbl: string | null = null
          if (tx.unitId) {
            const unit = await db
              .collection<Unit>("units")
              .findOne({ _id: tx.unitId }, { projection: { type: 1, number: 1 } })
            if (unit) unitLbl = unitLabel(unit)
          }
          const linkedMov = await db
            .collection<MaterialMovement>("materialMovements")
            .findOne({ transactionId: tx._id, category: "purchase" })
          let linkedMovement: LinkedMovementSale | null = null
          if (linkedMov) {
            const mat = await db
              .collection<Material>("materials")
              .findOne({ _id: linkedMov.materialId })
            if (mat) {
              linkedMovement = {
                materialName: mat.name,
                qty: linkedMov.qty,
                unitLabel: formatUnit(mat.unit, mat.unitOther),
              }
            }
          }
          return {
            ok: true,
            data: {
              entityType: "transaction",
              kind: "sale",
              occurredAt: tx.occurredAt,
              amount: tx.amount,
              buyerName: tx.buyerName ?? "",
              unitLabel: unitLbl,
              description: tx.description,
              voided: tx.voided === true,
              isReversal,
              reversedById,
              linkedMovement,
            },
          }
        }
        if (tx.category === "purchase") {
          const linkedMov = await db
            .collection<MaterialMovement>("materialMovements")
            .findOne({ transactionId: tx._id, category: "purchase" })
          let linkedMovement: LinkedMovementPurchase | null = null
          if (linkedMov) {
            const [mat, proj] = await Promise.all([
              db.collection<Material>("materials").findOne({ _id: linkedMov.materialId }),
              db
                .collection<{ _id: ObjectId; name: string }>("projects")
                .findOne({ _id: linkedMov.projectId }, { projection: { name: 1 } }),
            ])
            if (mat) {
              linkedMovement = {
                materialName: mat.name,
                qty: linkedMov.qty,
                projectName: proj?.name ?? "(unknown project)",
              }
            }
          }
          return {
            ok: true,
            data: {
              entityType: "transaction",
              kind: "purchase",
              occurredAt: tx.occurredAt,
              amount: tx.amount,
              description: tx.description,
              voided: tx.voided === true,
              isReversal,
              reversedById,
              linkedMovement,
            },
          }
        }
        // adhoc
        return {
          ok: true,
          data: {
            entityType: "transaction",
            kind: "adhoc",
            occurredAt: tx.occurredAt,
            amount: tx.amount,
            txKind: tx.kind,
            description: tx.description,
            notes: tx.notes ?? null,
            voided: tx.voided === true,
            isReversal,
            reversedById,
          },
        }
      }

      case "movement":
      case "material_transfer": {
        const user = await requireAuth()
        const mov = await db
          .collection<MaterialMovement>("materialMovements")
          .findOne({ _id: oid })
        if (!mov) return { ok: false, error: "Movement not found." }
        const mat = await db
          .collection<Material>("materials")
          .findOne({ _id: mov.materialId })
        if (!mat) return { ok: false, error: "Material not found." }
        const unitLbl = formatUnit(mat.unit, mat.unitOther)

        if (entityType === "material_transfer" || mov.category === "transfer_in" || mov.category === "transfer_out") {
          // Material transfers are admin-only by route, but be defensive — only admins see this view.
          if (user.role !== "admin") {
            return { ok: false, error: "Not authorized." }
          }
          const peer = await db
            .collection<MaterialMovement>("materialMovements")
            .findOne({
              transferGroupId: mov.transferGroupId,
              _id: { $ne: mov._id },
              reversalOf: { $exists: false },
            })
          const reversal = await db
            .collection<MaterialMovement>("materialMovements")
            .findOne({ reversalOf: mov._id })
          const sourceLeg = mov.category === "transfer_out" ? mov : (peer ?? mov)
          const destLeg = mov.category === "transfer_in" ? mov : (peer ?? mov)
          const [sourceProj, destProj] = await Promise.all([
            db.collection<{ _id: ObjectId; name: string }>("projects").findOne({ _id: sourceLeg.projectId }, { projection: { name: 1 } }),
            db.collection<{ _id: ObjectId; name: string }>("projects").findOne({ _id: destLeg.projectId }, { projection: { name: 1 } }),
          ])
          return {
            ok: true,
            data: {
              entityType: "material_transfer",
              sourceProjectName: sourceProj?.name ?? "(unknown project)",
              destProjectName: destProj?.name ?? "(unknown project)",
              materialName: mat.name,
              qty: sourceLeg.qty,
              unitLabel: unitLbl,
              occurredAt: sourceLeg.occurredAt,
              transferGroupId: mov.transferGroupId?.toHexString() ?? "",
              status: reversal ? "reversed" : "active",
              reversedAt: reversal?.createdAt ?? null,
            },
          }
        }

        // Plain movement (purchase / return / consumption)
        let peerProjectName: string | null = null
        // (Non-transfer movements have no peer; left null.)
        return {
          ok: true,
          data: {
            entityType: "movement",
            occurredAt: mov.occurredAt,
            materialName: mat.name,
            qty: mov.qty,
            unitLabel: unitLbl,
            category: mov.category,
            amount: user.role === "admin" ? (mov.amount ?? null) : null,
            purpose: mov.purpose ?? null,
            notes: mov.notes ?? null,
            voided: mov.voided === true,
            peerProjectName,
          },
        }
      }

      case "unit": {
        const user = await requireAuth()
        const u = await db.collection<Unit>("units").findOne({ _id: oid })
        if (!u) return { ok: false, error: "Unit not found." }
        return {
          ok: true,
          data: {
            entityType: "unit",
            type: u.type,
            number: u.number,
            floor: u.floor ?? null,
            status: u.status,
            soldPriceTotal:
              user.role === "admin" ? (u.soldPriceTotal ?? null) : null,
            buyerName: u.buyerName ?? null,
            soldAt: u.soldAt ?? null,
          },
        }
      }
    }
  } catch (err) {
    console.error("fetchDrilldownDetail failed", err)
    return { ok: false, error: "Could not load detail. Please try again." }
  }
}

```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean. (If `ActionResult` is missing from `@/types`, search for its current definition path — it was introduced in Phase 5 and lives in the project's shared `types` module.)

- [ ] **Step 3: Commit**

```bash
git add lib/drilldown/actions.ts
git commit -m "feat(phase-9): add fetchDrilldownDetail server action"
```

---

### Task 13: Shared `<DrilldownSheet>` component

**Files:**
- Create: `app/(authed)/components/drilldown-sheet.tsx`

The sheet is a panel-only component: it receives `entityType` / `entityId` / `open` / `onOpenChange` and renders two tabs. Details tab calls `fetchDrilldownDetail` on open. History tab calls `getEntityHistoryAction` lazily on first tab activation.

Note: `getEntityHistoryAction` is admin-only. The History tab is hidden for floor managers; the Details tab is the only one they see.

- [ ] **Step 1: Write the component**

```tsx
"use client"

import { useEffect, useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { fetchDrilldownDetail } from "@/lib/drilldown/actions"
import type {
  DrilldownDetail,
  DrilldownEntityType,
} from "@/lib/drilldown/schemas"
import { getEntityHistoryAction } from "@/app/(authed)/audit/actions"
import type { AuditEvent, AuditEntityType } from "@/lib/audit/schemas"

const INR = new Intl.NumberFormat("en-IN")

function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function entityTypeForHistory(t: DrilldownEntityType): AuditEntityType {
  switch (t) {
    case "transaction":
    case "money_transfer":
      return "transaction"
    case "movement":
    case "material_transfer":
      return "movement"
    case "unit":
      return "unit"
  }
}

type DrilldownSheetProps = {
  entityType: DrilldownEntityType
  entityId: string
  role: "admin" | "floor_manager"
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DrilldownSheet({
  entityType,
  entityId,
  role,
  open,
  onOpenChange,
}: DrilldownSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Details</SheetTitle>
          <SheetDescription>
            Full row detail, including audit history.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          <DrilldownBody
            key={open ? `open-${entityId}` : "closed"}
            entityType={entityType}
            entityId={entityId}
            role={role}
            open={open}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function DrilldownBody({
  entityType,
  entityId,
  role,
  open,
}: {
  entityType: DrilldownEntityType
  entityId: string
  role: "admin" | "floor_manager"
  open: boolean
}) {
  const showHistory = role === "admin"
  return (
    <Tabs defaultValue="details">
      <TabsList>
        <TabsTrigger value="details">Details</TabsTrigger>
        {showHistory ? <TabsTrigger value="history">History</TabsTrigger> : null}
      </TabsList>
      <TabsContent value="details" className="mt-4">
        <DetailsTab entityType={entityType} entityId={entityId} open={open} />
      </TabsContent>
      {showHistory ? (
        <TabsContent value="history" className="mt-4">
          <HistoryTab entityType={entityType} entityId={entityId} />
        </TabsContent>
      ) : null}
    </Tabs>
  )
}

function DetailsTab({
  entityType,
  entityId,
  open,
}: {
  entityType: DrilldownEntityType
  entityId: string
  open: boolean
}) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; data: DrilldownDetail }
  >({ status: "loading" })

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setState({ status: "loading" })
    fetchDrilldownDetail(entityType, entityId)
      .then((res) => {
        if (cancelled) return
        if (!res.ok) setState({ status: "error", message: res.error })
        else setState({ status: "ready", data: res.data })
      })
      .catch(() => {
        if (cancelled) return
        setState({ status: "error", message: "Could not load detail." })
      })
    return () => {
      cancelled = true
    }
  }, [entityType, entityId, open])

  if (state.status === "loading") {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (state.status === "error") {
    return (
      <p className="text-sm text-destructive" role="alert">
        {state.message}
      </p>
    )
  }
  return <DrilldownDetailView data={state.data} />
}

function HistoryTab({
  entityType,
  entityId,
}: {
  entityType: DrilldownEntityType
  entityId: string
}) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; events: AuditEvent[] }
  >({ status: "loading" })

  useEffect(() => {
    let cancelled = false
    getEntityHistoryAction(entityTypeForHistory(entityType), entityId)
      .then((res) => {
        if (cancelled) return
        if (!res.ok) setState({ status: "error", message: res.error })
        else setState({ status: "ready", events: res.data })
      })
      .catch(() => {
        if (cancelled) return
        setState({ status: "error", message: "Could not load history." })
      })
    return () => {
      cancelled = true
    }
  }, [entityType, entityId])

  if (state.status === "loading") {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (state.status === "error") {
    return (
      <p className="text-sm text-destructive" role="alert">
        {state.message}
      </p>
    )
  }
  if (state.events.length === 0) {
    return <p className="text-sm text-muted-foreground">No history found.</p>
  }
  return (
    <ol className="flex flex-col gap-3">
      {state.events.map((e) => (
        <li
          key={e.id}
          className="flex flex-col gap-1 rounded border border-border bg-card p-3"
        >
          <div className="flex items-center gap-2">
            <Badge variant={actionVariant(e.action)}>{e.action}</Badge>
            <span className="text-sm font-medium">{e.actorName}</span>
            <Badge variant="outline" className="text-xs">
              {e.actorRole === "admin" ? "admin" : "floor manager"}
            </Badge>
            <span
              className="ml-auto text-xs text-muted-foreground"
              title={e.occurredAt.toISOString()}
            >
              {formatRelative(e.occurredAt)}
            </span>
          </div>
          <p className="text-sm">{e.summary}</p>
        </li>
      ))}
    </ol>
  )
}

function actionVariant(
  a: AuditEvent["action"],
): "default" | "destructive" | "secondary" {
  if (a === "voided") return "destructive"
  if (a === "reversed") return "secondary"
  return "default"
}

function formatRelative(d: Date): string {
  const diff = Date.now() - d.getTime()
  const m = Math.round(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.round(h / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString()
}

function DrilldownDetailView({ data }: { data: DrilldownDetail }) {
  switch (data.entityType) {
    case "transaction":
      switch (data.kind) {
        case "sale":
          return (
            <DetailGrid>
              <Row label="Date" value={fmtDate(data.occurredAt)} />
              <Row label="Amount" value={`₹${INR.format(data.amount)}`} />
              <Row label="Buyer" value={data.buyerName || "—"} />
              <Row label="Unit" value={data.unitLabel ?? "—"} />
              <Row label="Description" value={data.description || "—"} />
              {data.linkedMovement ? (
                <Row
                  label="Linked stock"
                  value={`${data.linkedMovement.materialName} · ${data.linkedMovement.qty} ${data.linkedMovement.unitLabel}`}
                />
              ) : null}
              <StatusRow voided={data.voided} isReversal={data.isReversal} />
            </DetailGrid>
          )
        case "purchase":
          return (
            <DetailGrid>
              <Row label="Date" value={fmtDate(data.occurredAt)} />
              <Row label="Amount" value={`₹${INR.format(data.amount)}`} />
              <Row label="Description" value={data.description || "—"} />
              {data.linkedMovement ? (
                <Row
                  label="Linked stock"
                  value={`${data.linkedMovement.materialName} · ${data.linkedMovement.qty} · ${data.linkedMovement.projectName}`}
                />
              ) : null}
              <StatusRow voided={data.voided} isReversal={data.isReversal} />
            </DetailGrid>
          )
        case "transfer":
          return (
            <DetailGrid>
              <Row label="Date" value={fmtDate(data.occurredAt)} />
              <Row label="Amount" value={`₹${INR.format(data.amount)}`} />
              <Row label="Direction" value={data.direction === "in" ? "In" : "Out"} />
              <Row label="Peer project" value={data.peerProjectName} />
              <Row label="Transfer group" value={data.transferGroupId.slice(0, 8)} />
              {data.isReversal ? <Row label="Status" value="Reversal" /> : null}
              {data.reversedAt ? (
                <Row label="Reversed at" value={fmtDate(data.reversedAt)} />
              ) : null}
            </DetailGrid>
          )
        case "adhoc":
          return (
            <DetailGrid>
              <Row label="Date" value={fmtDate(data.occurredAt)} />
              <Row label="Amount" value={`₹${INR.format(data.amount)}`} />
              <Row label="Kind" value={data.txKind === "income" ? "Income" : "Expense"} />
              <Row label="Description" value={data.description || "—"} />
              {data.notes ? <Row label="Notes" value={data.notes} /> : null}
              <StatusRow voided={data.voided} isReversal={data.isReversal} />
            </DetailGrid>
          )
      }
    case "movement":
      return (
        <DetailGrid>
          <Row label="Date" value={fmtDate(data.occurredAt)} />
          <Row label="Material" value={data.materialName} />
          <Row label="Qty" value={`${data.qty} ${data.unitLabel}`} />
          <Row label="Category" value={data.category.replace("_", " ")} />
          {data.amount != null ? (
            <Row label="Amount" value={`₹${INR.format(data.amount)}`} />
          ) : null}
          {data.purpose ? <Row label="Purpose" value={data.purpose} /> : null}
          {data.notes ? <Row label="Notes" value={data.notes} /> : null}
          {data.peerProjectName ? (
            <Row label="Peer project" value={data.peerProjectName} />
          ) : null}
          {data.voided ? <Row label="Status" value="Voided" /> : null}
        </DetailGrid>
      )
    case "unit":
      return (
        <DetailGrid>
          <Row label="Type" value={data.type === "apartment" ? "Apartment" : "Parking"} />
          <Row label="Number" value={data.number} />
          {data.floor != null ? <Row label="Floor" value={String(data.floor)} /> : null}
          <Row label="Status" value={data.status === "sold" ? "Sold" : "Available"} />
          {data.soldPriceTotal != null ? (
            <Row label="Sold price" value={`₹${INR.format(data.soldPriceTotal)}`} />
          ) : null}
          {data.buyerName ? <Row label="Buyer" value={data.buyerName} /> : null}
          {data.soldAt ? <Row label="Sold on" value={fmtDate(data.soldAt)} /> : null}
        </DetailGrid>
      )
    case "money_transfer":
      return (
        <DetailGrid>
          <Row label="From" value={data.sourceProjectName} />
          <Row label="To" value={data.destProjectName} />
          <Row label="Amount" value={`₹${INR.format(data.amount)}`} />
          <Row label="Date" value={fmtDate(data.occurredAt)} />
          <Row label="Status" value={data.status === "reversed" ? "Reversed" : "Active"} />
          {data.reversedAt ? (
            <Row label="Reversed at" value={fmtDate(data.reversedAt)} />
          ) : null}
        </DetailGrid>
      )
    case "material_transfer":
      return (
        <DetailGrid>
          <Row label="From" value={data.sourceProjectName} />
          <Row label="To" value={data.destProjectName} />
          <Row label="Material" value={data.materialName} />
          <Row label="Qty" value={`${data.qty} ${data.unitLabel}`} />
          <Row label="Date" value={fmtDate(data.occurredAt)} />
          <Row label="Status" value={data.status === "reversed" ? "Reversed" : "Active"} />
          {data.reversedAt ? (
            <Row label="Reversed at" value={fmtDate(data.reversedAt)} />
          ) : null}
        </DetailGrid>
      )
  }
}

function DetailGrid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">{children}</dl>
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </>
  )
}

function StatusRow({ voided, isReversal }: { voided: boolean; isReversal: boolean }) {
  if (!voided && !isReversal) return null
  return (
    <>
      <dt className="text-muted-foreground">Status</dt>
      <dd>
        {voided ? (
          <Badge variant="destructive">Voided</Badge>
        ) : (
          <Badge variant="secondary">Reversal</Badge>
        )}
      </dd>
    </>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/(authed)/components/drilldown-sheet.tsx
git commit -m "feat(phase-9): add shared DrilldownSheet component"
```

---

## Group D — Drilldown UI wiring

### Task 14: Ledger row drilldown (and remove History from row-actions-menu)

**Files:**
- Create: `app/(authed)/projects/[id]/financials/ledger-row.tsx`
- Modify: `app/(authed)/projects/[id]/financials/ledger-table.tsx`
- Modify: `app/(authed)/projects/[id]/financials/row-actions-menu.tsx`

- [ ] **Step 1: Create `<LedgerRow>` client wrapper**

```tsx
"use client"

import { useState, type MouseEvent } from "react"
import type { Transaction } from "@/lib/transactions/schemas"
import { Badge } from "@/components/ui/badge"
import { DrilldownSheet } from "@/app/(authed)/components/drilldown-sheet"
import { RowActionsMenu } from "./row-actions-menu"

const INR = new Intl.NumberFormat("en-IN")

function fmtAmount(amount: number, isReversal: boolean): string {
  const sign = isReversal ? "−" : ""
  return `${sign}₹${INR.format(amount)}`
}

function categoryLabel(c: Transaction["category"]): string {
  switch (c) {
    case "sale":
      return "Sale"
    case "purchase":
      return "Purchase"
    case "adhoc":
      return "Ad-hoc"
    case "transfer_in":
      return "Transfer in"
    case "transfer_out":
      return "Transfer out"
  }
}

export type LedgerRowProps = {
  row: {
    _id: string
    occurredAt: string  // ISO; client re-parses
    kind: "income" | "expense"
    category: Transaction["category"]
    amount: number
    description: string
    buyerName: string | null
    notes: string | null
    voided: boolean
    isReversal: boolean
    transferGroupId: string | null
    unitLabel: string
    peerProjectName: string | null
  }
  linkedMaterial?: {
    name: string
    unit: string
    qty: number
    projectName: string
  }
}

export function LedgerRow({ row, linkedMaterial }: LedgerRowProps) {
  const [drilldownOpen, setDrilldownOpen] = useState(false)
  const rowClass = row.voided
    ? "border-b border-border last:border-0 opacity-60 line-through cursor-pointer hover:bg-muted/40"
    : "border-b border-border last:border-0 cursor-pointer hover:bg-muted/40"

  function onActionsClick(e: MouseEvent<HTMLTableCellElement>) {
    e.stopPropagation()
  }

  const occurredAt = new Date(row.occurredAt)
  // Reconstruct the Transaction shape RowActionsMenu expects from primitives.
  const txForActions = {
    _id: row._id,
    kind: row.kind,
    category: row.category,
    amount: row.amount,
    description: row.description,
    voided: row.voided,
    isReversal: row.isReversal,
  }

  return (
    <>
      <tr className={rowClass} onClick={() => setDrilldownOpen(true)}>
        <td className="px-4 py-3 font-mono">{occurredAt.toLocaleDateString()}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <Badge variant={row.kind === "income" ? "default" : "secondary"}>
              {row.kind === "income" ? "Income" : "Expense"}
            </Badge>
            {row.isReversal ? (
              <Badge variant="outline" className="text-xs">
                Reversal
              </Badge>
            ) : null}
          </div>
        </td>
        <td className="px-4 py-3">
          <Badge variant="secondary">{categoryLabel(row.category)}</Badge>
        </td>
        <td className="px-4 py-3 text-right font-mono">
          {fmtAmount(row.amount, row.isReversal)}
        </td>
        <td className="px-4 py-3">
          {row.description}
          {row.transferGroupId ? (
            <Badge variant="outline" className="ml-2 text-xs">
              ↔ {row.peerProjectName ?? "Other project"}
            </Badge>
          ) : null}
        </td>
        <td className="px-4 py-3 text-muted-foreground">{row.buyerName ?? ""}</td>
        <td className="px-4 py-3 text-muted-foreground">{row.unitLabel}</td>
        <td className="px-4 py-3 text-right" onClick={onActionsClick}>
          <RowActionsMenu
            transactionId={txForActions._id}
            description={txForActions.description}
            amount={txForActions.amount}
            kind={txForActions.kind}
            category={txForActions.category}
            voided={txForActions.voided}
            isReversal={txForActions.isReversal}
            linkedMaterial={linkedMaterial}
          />
        </td>
      </tr>
      <DrilldownSheet
        entityType="transaction"
        entityId={row._id}
        role="admin"
        open={drilldownOpen}
        onOpenChange={setDrilldownOpen}
      />
    </>
  )
}
```

- [ ] **Step 2: Update `ledger-table.tsx` to use `<LedgerRow>`**

Replace the body of the existing async server component. The unit-label denormalization stays on the server (the existing `fetchUnitsForRows`). The peer-project lookup also stays where it is (in `app/(authed)/projects/[id]/page.tsx`). We pass primitives to the client wrapper.

```tsx
import { ObjectId } from "mongodb"
import { Card } from "@/components/ui/card"
import type { Transaction } from "@/lib/transactions/schemas"
import type { Unit } from "@/lib/projects/schemas"
import { getDb } from "@/lib/db/client"
import { LedgerRow } from "./ledger-row"

async function fetchUnitsForRows(
  rows: Transaction[],
): Promise<Map<string, string>> {
  const unitIds = Array.from(
    new Set(
      rows
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

export async function LedgerTable({
  rows,
  otherProjectByRowId,
  linkedMaterials,
}: {
  rows: Transaction[]
  otherProjectByRowId: Map<string, string>
  linkedMaterials?: Map<
    string,
    { name: string; unit: string; qty: number; projectName: string }
  >
}) {
  if (rows.length === 0) {
    return (
      <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
        No transactions match these filters.
      </Card>
    )
  }
  const unitLabels = await fetchUnitsForRows(rows)

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Kind</th>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3 text-right">Amount</th>
            <th className="px-4 py-3">Description</th>
            <th className="px-4 py-3">Buyer</th>
            <th className="px-4 py-3">Linked</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
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
                    r.transferGroupId ? r.transferGroupId.toHexString() : null,
                  unitLabel,
                  peerProjectName:
                    otherProjectByRowId.get(id) ?? null,
                }}
                linkedMaterial={linkedMaterials?.get(id)}
              />
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}
```

- [ ] **Step 3: Remove the standalone History button from `row-actions-menu.tsx`**

Find the `<HistorySheet entityType="transaction" ... />` block (current lines ~55–63). DELETE the entire `<HistorySheet>` element. ALSO remove the `import { HistorySheet }` line at the top of the file. The dropdown for Void / Reverse is unchanged.

Resulting top of the JSX:

```tsx
return (
  <div className="flex items-center justify-end gap-1">
    {canVoid || canReverse ? (
      <DropdownMenu>
        ...
```

- [ ] **Step 4: Typecheck + lint**

```bash
npm run typecheck
npm run lint
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add app/(authed)/projects/[id]/financials/ledger-row.tsx app/(authed)/projects/[id]/financials/ledger-table.tsx app/(authed)/projects/[id]/financials/row-actions-menu.tsx
git commit -m "feat(phase-9): ledger row drilldown; drop History from row actions"
```

---

### Task 15: Money transfer row drilldown (and remove History button)

**Files:**
- Create: `app/(authed)/transfers/money-transfer-row.tsx`
- Modify: `app/(authed)/transfers/money-transfers-table.tsx`

- [ ] **Step 1: Create `<MoneyTransferRow>` client wrapper**

```tsx
"use client"

import { useState, type MouseEvent } from "react"
import { Badge } from "@/components/ui/badge"
import type { MoneyTransferRow as MoneyTransferRowData } from "@/lib/transfers/schemas"
import { DrilldownSheet } from "@/app/(authed)/components/drilldown-sheet"
import { ReverseTransferButton } from "./reverse-transfer-dialog"

const INR = new Intl.NumberFormat("en-IN")

function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function MoneyTransferRow({
  row,
}: {
  row: {
    transferGroupId: string
    sourceTxId: string
    occurredAt: string
    sourceProjectName: string
    destProjectName: string
    amount: number
    description: string
    status: MoneyTransferRowData["status"]
    reversedAt: string | null
    createdByName: string | null
  }
}) {
  const [open, setOpen] = useState(false)
  function onActionsClick(e: MouseEvent<HTMLTableCellElement>) {
    e.stopPropagation()
  }
  return (
    <>
      <tr
        className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/40"
        onClick={() => setOpen(true)}
      >
        <td className="px-4 py-3 font-mono text-xs">{fmtDate(row.occurredAt)}</td>
        <td className="px-4 py-3">
          <span>{row.sourceProjectName}</span>
          <span className="px-2 text-muted-foreground">→</span>
          <span>{row.destProjectName}</span>
        </td>
        <td className="px-4 py-3 text-right font-mono">
          ₹{INR.format(row.amount)}
        </td>
        <td className="px-4 py-3 text-muted-foreground">{row.description}</td>
        <td className="px-4 py-3">
          {row.status === "reversed" ? (
            <Badge variant="secondary">
              Reversed{row.reversedAt ? ` on ${fmtDate(row.reversedAt)}` : ""}
            </Badge>
          ) : (
            <Badge variant="outline">Active</Badge>
          )}
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          {row.createdByName ?? "—"}
        </td>
        <td className="px-4 py-3 text-right" onClick={onActionsClick}>
          {row.status === "active" ? (
            <ReverseTransferButton
              transferGroupId={row.transferGroupId}
              kind="money"
              summary={`${row.sourceProjectName} → ${row.destProjectName} · ₹${INR.format(row.amount)}`}
            />
          ) : null}
        </td>
      </tr>
      <DrilldownSheet
        entityType="money_transfer"
        entityId={row.sourceTxId}
        role="admin"
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
```

- [ ] **Step 2: Update `money-transfers-table.tsx` to use the wrapper and drop the inline History button**

Replace the file's row-rendering section. Keep the table header and the existing Pagination logic from Task 8. Drop the import of `HistorySheet` and `Button`.

```tsx
import { Card } from "@/components/ui/card"
import type { MoneyTransferRow as MoneyTransferRowData } from "@/lib/transfers/schemas"
import { MoneyTransferRow } from "./money-transfer-row"

export function MoneyTransfersTable({
  rows,
  page,
  pageSize,
  total,
  searchParams,
}: {
  rows: MoneyTransferRowData[]
  page: number
  pageSize: number
  total: number
  searchParams: Record<string, string | string[] | undefined>
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  if (rows.length === 0) {
    return (
      <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
        No money transfers in this date range.
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">From → To</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created by</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <MoneyTransferRow
                key={r.transferGroupId}
                row={{
                  transferGroupId: r.transferGroupId,
                  sourceTxId: r.sourceTxId,
                  occurredAt: r.occurredAt.toISOString(),
                  sourceProjectName: r.sourceProjectName,
                  destProjectName: r.destProjectName,
                  amount: r.amount,
                  description: r.description,
                  status: r.status,
                  reversedAt: r.reversedAt ? r.reversedAt.toISOString() : null,
                  createdByName: r.createdByName,
                }}
              />
            ))}
          </tbody>
        </table>
      </Card>
      <MoneyPagination
        current={page}
        totalPages={totalPages}
        searchParams={searchParams}
      />
    </div>
  )
}

function MoneyPagination({
  current,
  totalPages,
  searchParams,
}: {
  current: number
  totalPages: number
  searchParams: Record<string, string | string[] | undefined>
}) {
  if (totalPages <= 1) return null
  const base = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (k === "moneyPage") continue
    if (typeof v === "string") base.set(k, v)
  }
  const hrefFor = (p: number) => {
    const q = new URLSearchParams(base)
    q.set("moneyPage", String(p))
    return `?${q.toString()}`
  }
  return (
    <nav className="flex items-center gap-3 text-sm">
      <PaginationLink href={hrefFor(current - 1)} disabled={current <= 1} label="← Prev" />
      <span className="text-muted-foreground">
        Page {current} of {totalPages}
      </span>
      <PaginationLink
        href={hrefFor(current + 1)}
        disabled={current >= totalPages}
        label="Next →"
      />
    </nav>
  )
}

function PaginationLink({ href, disabled, label }: { href: string; disabled: boolean; label: string }) {
  if (disabled) {
    return <span className="text-muted-foreground">{label}</span>
  }
  return (
    <a className="text-primary hover:underline" href={href}>
      {label}
    </a>
  )
}
```

- [ ] **Step 3: Typecheck + lint**

```bash
npm run typecheck
npm run lint
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/(authed)/transfers/money-transfer-row.tsx app/(authed)/transfers/money-transfers-table.tsx
git commit -m "feat(phase-9): money transfer row drilldown; drop inline History"
```

---

### Task 16: Material transfer row drilldown (and remove History button)

**Files:**
- Create: `app/(authed)/transfers/material-transfer-row.tsx`
- Modify: `app/(authed)/transfers/material-transfers-table.tsx`

- [ ] **Step 1: Create `<MaterialTransferRow>` client wrapper**

```tsx
"use client"

import { useState, type MouseEvent } from "react"
import { Badge } from "@/components/ui/badge"
import type {
  MaterialTransferRow as MaterialTransferRowData,
} from "@/lib/transfers/schemas"
import type { MaterialUnit } from "@/lib/materials/schemas"
import { DrilldownSheet } from "@/app/(authed)/components/drilldown-sheet"
import { ReverseTransferButton } from "./reverse-transfer-dialog"

function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function formatUnit(unit: MaterialUnit, unitOther?: string): string {
  if (unit === "other") return unitOther || "—"
  if (unit === "m2") return "m²"
  if (unit === "m3") return "m³"
  return unit
}

export function MaterialTransferRow({
  row,
}: {
  row: {
    transferGroupId: string
    sourceMovId: string
    occurredAt: string
    sourceProjectName: string
    destProjectName: string
    materialName: string
    materialUnit: MaterialUnit
    materialUnitOther?: string
    qty: number
    status: MaterialTransferRowData["status"]
    reversedAt: string | null
    createdByName: string | null
  }
}) {
  const [open, setOpen] = useState(false)
  const unitLabel = formatUnit(row.materialUnit, row.materialUnitOther)
  function onActionsClick(e: MouseEvent<HTMLTableCellElement>) {
    e.stopPropagation()
  }
  return (
    <>
      <tr
        className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/40"
        onClick={() => setOpen(true)}
      >
        <td className="px-4 py-3 font-mono text-xs">{fmtDate(row.occurredAt)}</td>
        <td className="px-4 py-3">
          <span>{row.sourceProjectName}</span>
          <span className="px-2 text-muted-foreground">→</span>
          <span>{row.destProjectName}</span>
        </td>
        <td className="px-4 py-3">{row.materialName}</td>
        <td className="px-4 py-3 text-right font-mono">
          {row.qty} {unitLabel}
        </td>
        <td className="px-4 py-3">
          {row.status === "reversed" ? (
            <Badge variant="secondary">
              Reversed{row.reversedAt ? ` on ${fmtDate(row.reversedAt)}` : ""}
            </Badge>
          ) : (
            <Badge variant="outline">Active</Badge>
          )}
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          {row.createdByName ?? "—"}
        </td>
        <td className="px-4 py-3 text-right" onClick={onActionsClick}>
          {row.status === "active" ? (
            <ReverseTransferButton
              transferGroupId={row.transferGroupId}
              kind="material"
              summary={`${row.sourceProjectName} → ${row.destProjectName} · ${row.qty} ${unitLabel} ${row.materialName}`}
            />
          ) : null}
        </td>
      </tr>
      <DrilldownSheet
        entityType="material_transfer"
        entityId={row.sourceMovId}
        role="admin"
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
```

- [ ] **Step 2: Update `material-transfers-table.tsx`**

```tsx
import { Card } from "@/components/ui/card"
import type { MaterialTransferRow as MaterialTransferRowData } from "@/lib/transfers/schemas"
import { MaterialTransferRow } from "./material-transfer-row"

export function MaterialTransfersTable({
  rows,
  page,
  pageSize,
  total,
  searchParams,
}: {
  rows: MaterialTransferRowData[]
  page: number
  pageSize: number
  total: number
  searchParams: Record<string, string | string[] | undefined>
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  if (rows.length === 0) {
    return (
      <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
        No material transfers in this date range.
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">From → To</th>
              <th className="px-4 py-3">Material</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created by</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <MaterialTransferRow
                key={r.transferGroupId}
                row={{
                  transferGroupId: r.transferGroupId,
                  sourceMovId: r.sourceMovId,
                  occurredAt: r.occurredAt.toISOString(),
                  sourceProjectName: r.sourceProjectName,
                  destProjectName: r.destProjectName,
                  materialName: r.materialName,
                  materialUnit: r.materialUnit,
                  materialUnitOther: r.materialUnitOther,
                  qty: r.qty,
                  status: r.status,
                  reversedAt: r.reversedAt ? r.reversedAt.toISOString() : null,
                  createdByName: r.createdByName,
                }}
              />
            ))}
          </tbody>
        </table>
      </Card>
      <MaterialPagination
        current={page}
        totalPages={totalPages}
        searchParams={searchParams}
      />
    </div>
  )
}

function MaterialPagination({
  current,
  totalPages,
  searchParams,
}: {
  current: number
  totalPages: number
  searchParams: Record<string, string | string[] | undefined>
}) {
  if (totalPages <= 1) return null
  const base = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (k === "materialPage") continue
    if (typeof v === "string") base.set(k, v)
  }
  const hrefFor = (p: number) => {
    const q = new URLSearchParams(base)
    q.set("materialPage", String(p))
    return `?${q.toString()}`
  }
  return (
    <nav className="flex items-center gap-3 text-sm">
      <PaginationLink href={hrefFor(current - 1)} disabled={current <= 1} label="← Prev" />
      <span className="text-muted-foreground">
        Page {current} of {totalPages}
      </span>
      <PaginationLink
        href={hrefFor(current + 1)}
        disabled={current >= totalPages}
        label="Next →"
      />
    </nav>
  )
}

function PaginationLink({ href, disabled, label }: { href: string; disabled: boolean; label: string }) {
  if (disabled) {
    return <span className="text-muted-foreground">{label}</span>
  }
  return (
    <a className="text-primary hover:underline" href={href}>
      {label}
    </a>
  )
}
```

- [ ] **Step 3: Typecheck + lint**

```bash
npm run typecheck
npm run lint
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/(authed)/transfers/material-transfer-row.tsx app/(authed)/transfers/material-transfers-table.tsx
git commit -m "feat(phase-9): material transfer row drilldown; drop inline History"
```

---

### Task 17: Units rows drilldown (inline wrapper in inventory-table.tsx)

**Files:**
- Modify: `app/(authed)/projects/[id]/inventory/inventory-table.tsx`

Per the spec: drilldown on units is "low complexity" so a tiny client wrapper inlined in the same directory is acceptable. We add a `<UnitRow>` client component next to `InventoryTable`.

- [ ] **Step 1: Create a tiny `<UnitRow>` client wrapper file**

Create `app/(authed)/projects/[id]/inventory/unit-row.tsx`:

```tsx
"use client"

import { useState, type MouseEvent } from "react"
import { Badge } from "@/components/ui/badge"
import { DrilldownSheet } from "@/app/(authed)/components/drilldown-sheet"
import { MarkSoldButton } from "./mark-sold-dialog"
import { UnmarkButton } from "./unmark-confirm-dialog"
import type { Role } from "@/types"

const INR = new Intl.NumberFormat("en-IN")

export function UnitRow({
  unit,
  projectId,
  role,
}: {
  unit: {
    _id: string
    number: string
    type: "apartment" | "parking"
    floor: number | null
    status: "available" | "sold"
    buyerName: string | null
    soldPriceTotal: number | null
    soldAt: string | null
  }
  projectId: string
  role: Role
}) {
  const [open, setOpen] = useState(false)
  const showActions = role === "admin"
  function onActionsClick(e: MouseEvent<HTMLTableCellElement>) {
    e.stopPropagation()
  }
  return (
    <>
      <tr
        className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/40"
        onClick={() => setOpen(true)}
      >
        <td className="px-4 py-3 font-mono">{unit.number}</td>
        <td className="px-4 py-3 capitalize">{unit.type}</td>
        <td className="px-4 py-3 font-mono">{unit.floor ?? ""}</td>
        <td className="px-4 py-3">
          <Badge variant={unit.status === "sold" ? "default" : "secondary"}>
            {unit.status === "sold" ? "Sold" : "Available"}
          </Badge>
        </td>
        <td className="px-4 py-3">{unit.buyerName ?? ""}</td>
        <td className="px-4 py-3 font-mono">
          {unit.soldPriceTotal != null ? `₹${INR.format(unit.soldPriceTotal)}` : ""}
        </td>
        <td className="px-4 py-3">
          {unit.soldAt ? new Date(unit.soldAt).toLocaleDateString() : ""}
        </td>
        {showActions ? (
          <td className="px-4 py-3 text-right" onClick={onActionsClick}>
            {unit.status === "available" ? (
              <MarkSoldButton
                projectId={projectId}
                unitId={unit._id}
                unitType={unit.type}
                unitNumber={unit.number}
              />
            ) : (
              <UnmarkButton
                unitId={unit._id}
                unitType={unit.type}
                unitNumber={unit.number}
              />
            )}
          </td>
        ) : null}
      </tr>
      <DrilldownSheet
        entityType="unit"
        entityId={unit._id}
        role={role === "admin" ? "admin" : "floor_manager"}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
```

- [ ] **Step 2: Update `inventory-table.tsx` to render `<UnitRow>` instead of inline `<tr>`**

Find the `<tbody>` block in the file (from Task 7) and replace the inline `{units.map(...)}` with:

```tsx
<tbody>
  {units.map((u) => (
    <UnitRow
      key={String(u._id)}
      unit={{
        _id: String(u._id),
        number: u.number,
        type: u.type,
        floor: u.floor ?? null,
        status: u.status,
        buyerName: u.buyerName ?? null,
        soldPriceTotal: u.soldPriceTotal ?? null,
        soldAt: u.soldAt ? u.soldAt.toISOString() : null,
      }}
      projectId={projectId}
      role={role}
    />
  ))}
</tbody>
```

Also add the import at the top:

```ts
import { UnitRow } from "./unit-row"
```

And REMOVE the (now-unused) imports of `MarkSoldButton`, `UnmarkButton`, `Badge`, and any unused helpers.

- [ ] **Step 3: Typecheck + lint**

```bash
npm run typecheck
npm run lint
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/(authed)/projects/[id]/inventory/unit-row.tsx app/(authed)/projects/[id]/inventory/inventory-table.tsx
git commit -m "feat(phase-9): unit row drilldown"
```

---

### Task 18: Movements sheet drilldown (and remove inline `<HistoryDialog>`)

**Files:**
- Modify: `app/(authed)/projects/[id]/materials/movements-sheet.tsx`

The sheet already opens its own panel. Adding another sheet on top (the drilldown) requires either nesting or replacing. We go with row-click → drilldown, dropping the `<HistoryDialog>` column entirely.

- [ ] **Step 1: Replace the file**

Open `app/(authed)/projects/[id]/materials/movements-sheet.tsx`. Make these changes:

1. Remove the import `import { HistoryDialog } from "@/app/(authed)/components/history-sheet"`.
2. Add the import `import { DrilldownSheet } from "@/app/(authed)/components/drilldown-sheet"`.
3. Add a top-level state at the start of `MovementsSheetButton`: `const [drilldownId, setDrilldownId] = useState<string | null>(null)`.
4. Remove the Actions column entirely (`<th>` and per-row `<td>`).
5. Make each `<tr>` clickable: `onClick={() => setDrilldownId(r._id)}`, with `className` adding `cursor-pointer hover:bg-muted/40`.
6. After the `</table>` (and inside the same fragment that holds pagination), add:

```tsx
<DrilldownSheet
  entityType="movement"
  entityId={drilldownId ?? ""}
  role={role}
  open={drilldownId !== null}
  onOpenChange={(o) => {
    if (!o) setDrilldownId(null)
  }}
/>
```

7. When the outer sheet closes (existing `onOpenChange` handler), also reset `setDrilldownId(null)`.

Full file:

```tsx
"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { DrilldownSheet } from "@/app/(authed)/components/drilldown-sheet"
import type { MaterialMovement } from "@/lib/materials/schemas"
import type { Role } from "@/types"

const INR = new Intl.NumberFormat("en-IN")
const PAGE_SIZE = 50

type MovementRow = {
  _id: string
  kind: "in" | "out"
  category: MaterialMovement["category"]
  qty: number
  amount?: number
  purpose?: string
  notes?: string
  occurredAt: string
  voided?: boolean
}

function categoryLabel(c: MovementRow["category"]): string {
  switch (c) {
    case "purchase": return "Purchase"
    case "return": return "Return"
    case "consumption": return "Consumption"
    case "transfer_in": return "Transfer in"
    case "transfer_out": return "Transfer out"
  }
}

export function MovementsSheetButton({
  projectId,
  materialId,
  materialName,
  unitLabel,
  role,
}: {
  projectId: string
  materialId: string
  materialName: string
  unitLabel: string
  role: Role
}) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<MovementRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [drilldownId, setDrilldownId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setRows(null)
    setError(null)
    fetch(
      `/api/movements?projectId=${projectId}&materialId=${materialId}&page=${page}&pageSize=${PAGE_SIZE}`,
      { cache: "no-store" },
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: { rows: MovementRow[]; total: number }) => {
        if (!cancelled) {
          setRows(data.rows)
          setTotal(data.total)
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load history.")
      })
    return () => {
      cancelled = true
    }
  }, [open, projectId, materialId, page])

  const loading = open && rows === null && error === null
  const showAmount = role === "admin"
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
      >
        History
      </Button>
      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) {
            setRows(null)
            setError(null)
            setPage(1)
            setTotal(0)
            setDrilldownId(null)
          }
        }}
      >
        <SheetContent side="right" className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{materialName} — movement history</SheetTitle>
            <SheetDescription>
              Newest first. Quantities in {unitLabel}. Click a row for details.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 flex flex-col gap-3">
            {error ? (
              <p className="text-sm text-destructive" role="alert">{error}</p>
            ) : loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !rows || rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No movements yet.</p>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2">Date</th>
                      <th className="py-2">Type</th>
                      <th className="py-2 text-right">Qty</th>
                      {showAmount ? <th className="py-2 text-right">Amount</th> : null}
                      <th className="py-2">Purpose / notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r._id}
                        className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/40"
                        onClick={() => setDrilldownId(r._id)}
                      >
                        <td className="py-2 font-mono">
                          {new Date(r.occurredAt).toLocaleDateString()}
                        </td>
                        <td className="py-2">
                          <Badge variant={r.kind === "in" ? "default" : "secondary"}>
                            {categoryLabel(r.category)}
                          </Badge>
                        </td>
                        <td className="py-2 text-right font-mono">
                          {r.kind === "in" ? "+" : "−"}
                          {r.qty}
                        </td>
                        {showAmount ? (
                          <td className="py-2 text-right font-mono">
                            {r.amount != null ? `₹${INR.format(r.amount)}` : ""}
                          </td>
                        ) : null}
                        <td className="py-2 text-muted-foreground">
                          {[r.purpose, r.notes].filter(Boolean).join(" — ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {totalPages > 1 ? (
                  <nav className="flex items-center justify-end gap-3 text-sm">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      ← Prev
                    </Button>
                    <span className="text-muted-foreground">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next →
                    </Button>
                  </nav>
                ) : null}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <DrilldownSheet
        entityType="movement"
        entityId={drilldownId ?? ""}
        role={role}
        open={drilldownId !== null}
        onOpenChange={(o) => {
          if (!o) setDrilldownId(null)
        }}
      />
    </>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
npm run typecheck
npm run lint
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/(authed)/projects/[id]/materials/movements-sheet.tsx
git commit -m "feat(phase-9): movements sheet row drilldown; drop inline HistoryDialog"
```

---

## Group E — Final verification

### Task 19: Build, lint, manual T-tasks

**Files:** (none changed in this task — pure verification)

- [ ] **Step 1: Run a clean build**

```bash
npm run typecheck
npm run lint
npm run build
```
Expected: typecheck clean, lint clean, build succeeds. If build fails on dev-mode-only code paths, investigate before declaring success.

- [ ] **Step 2: Start the dev server and walk through pagination T-tasks**

```bash
npm run dev
```

Open http://localhost:3000 and log in as admin (btechy4@gmail.com). Run each T-task. Mark PASS or note the issue.

**Pagination:**

- [ ] T-pag-1: Open a project's Financials tab. If there are >50 ledger rows in the date window, page 1 shows 50 rows; click Next → page 2 shows the next 50. No duplicates. No skipped rows (check a few row dates straddling the boundary).
- [ ] T-pag-2: The entries line reads `Showing 50 of NNN entries.` and the pagination control reads `Page 1 of M`.
- [ ] T-pag-3: From page 3 of the ledger, change the Kind filter to "Income". URL should drop `?page=` and reset to page 1.
- [ ] T-pag-4: Navigate to `?page=2&from=...&to=...` directly via URL. Page state persists across reload.
- [ ] T-pag-5: Pick a window with ≤50 results. The `<Pagination>` block should not render.
- [ ] T-pag-6: Repeat T-pag-1 through T-pag-5 on:
  - `/transfers` — money tab uses `?moneyPage`, material tab uses `?materialPage`. Changing the GlobalFilters date drops both.
  - Per-project Inventory tab — `?unitsPage`. Changing the type/status filter resets.
- [ ] T-pag-7: Open the movements sheet (project → Materials → click a material's stock → History). If >50 movements, Prev/Next appear. Close and reopen — page should reset to 1.

**Drilldown:**

- [ ] T-drill-1: On the ledger, click an open area of a row (not the ⋮ button area). The drilldown sheet opens with the Details tab showing correct fields for that row type.
- [ ] T-drill-2: Click the ⋮ button area on the same row. The sheet does NOT open; the dropdown menu opens. (`e.stopPropagation` works.)
- [ ] T-drill-3: Test Details for each transaction kind: sale (shows unit + buyer + linked stock if any), purchase (shows linked materialMovement project + qty), transfer (shows direction + peer + group id), adhoc (shows description + notes).
- [ ] T-drill-4: Click the History tab. Events list matches what the old History sheet showed.
- [ ] T-drill-5: Open drilldown on a money transfer row, a material transfer row, a unit row, and a movement row inside the movements sheet.
- [ ] T-drill-6: Sign in as a floor manager and verify:
  - Floor managers cannot reach financials pages (existing route guard).
  - On a project's Materials tab → click a material's History → click a row → drilldown opens. Details tab shows the movement with NO `amount` field. NO History tab is visible.
- [ ] T-drill-7: Open drilldown on a voided ledger row. Voided badge appears in Details.
- [ ] T-drill-8: Open drilldown on a reversal row (an "Income" row with a Reversal badge in the ledger). The Details tab shows "Reversal" status.

**Atlas Search interaction:**

- [ ] T-search-pag-1: Set the ledger search to a query returning >50 matches. Page 1 + Next page work; `total` accurately reflects match count.
- [ ] T-search-pag-2: Clearing search resets page to 1.

- [ ] **Step 3: Stop the dev server. If any T-task failed, file it as a follow-up and decide whether to fix in-branch or defer.**

- [ ] **Step 4: Final commit (only if there are any cleanup changes)**

If T-tasks revealed any small fixes you applied in-session:

```bash
git add <files>
git commit -m "fix(phase-9): T-task fixes from manual verification"
```

If no cleanup was needed, skip this step.

---

## Done

Phase 9 is feature-complete when all 19 tasks above are committed and the T-task list is walked through. Follow up with the user about merging the feature branch into master per the project's existing flow (the `superpowers:finishing-a-development-branch` skill).
