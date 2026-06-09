# Dashboard Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only `/dashboard` page that visualizes financials, sales/inventory, and materials/procurement across all projects combined or for a single project, rendered with Recharts via the shadcn chart component.

**Architecture:** A new self-contained data module `lib/dashboard/` (date helpers, currency formatters, and a repository of MongoDB aggregation functions that each take a `{ projectId, from, to }` scope and return plain JSON). A server component `app/(authed)/dashboard/page.tsx` resolves the scope from URL params, fetches all aggregates in parallel, and passes plain data into three `"use client"` chart section components plus a client filter bar. The existing `/financials` page is untouched.

**Tech Stack:** Next.js 16 (App Router, RSC, server components), React 19, Recharts + shadcn `components/ui/chart.tsx`, MongoDB native driver (aggregation pipelines), Tailwind CSS v4, TypeScript, Zod (not needed here — reads only).

**Spec:** `docs/superpowers/specs/2026-06-09-dashboard-design.md`

**Testing note:** This repo has **no automated test framework** (no `test` script; no jest/vitest/playwright). The verification gate for every task is `npm run typecheck` then `npm run lint`, with a final `npm run build` and manual `npm run dev` check in the last task. There are no unit tests to write. Where a task says "verify," it means run those commands and read the output.

**Scope/serialization rule (applies to the whole repository module):** Every exported repository function returns **plain JSON only** — months as `"YYYY-MM"` strings, ids as hex strings, all values as numbers/booleans. No `ObjectId` or `Date` instances cross into the returned objects, so results serialize cleanly into the client chart components.

---

## File Structure

- **Create** `lib/dashboard/dates.ts` — pure date/month helpers (start/end of year, iso, parse, last-12-months, month range + labels). No DB, no React.
- **Create** `lib/dashboard/format.ts` — pure INR formatters (`formatINR`, `formatINRCompact`). No DB, no React.
- **Create** `lib/dashboard/repository.ts` — all aggregation reads. Imports `getDb` and `ObjectId` only; **must not** import `lib/transactions/repository.ts` or `lib/materials/repository.ts` at the top level (they form a value-import cycle — see project memory). Pipelines are written directly against collections.
- **Create** `components/ui/chart.tsx` — the shadcn chart primitive (wraps Recharts). Added via the shadcn CLI (Task 1).
- **Create** `app/(authed)/dashboard/dashboard-filters.tsx` — `"use client"` scope select + date range + presets.
- **Create** `app/(authed)/dashboard/financial-trends.tsx` — `"use client"` Section A charts.
- **Create** `app/(authed)/dashboard/sales-inventory.tsx` — `"use client"` Section B charts.
- **Create** `app/(authed)/dashboard/materials-procurement.tsx` — `"use client"` Section C charts.
- **Create** `app/(authed)/dashboard/page.tsx` — server component that wires everything (built last).
- **Modify** `app/(authed)/layout.tsx` — add the "Dashboard" nav link in the admin-only block.

Tasks are ordered so each produces a file that type-checks on its own; the page (Task 10) is assembled last so it is wired in a single coherent step.

---

## Task 1: Add Recharts + the shadcn chart primitive

**Files:**
- Create: `components/ui/chart.tsx`
- Modify: `package.json` (adds `recharts`)

- [ ] **Step 1: Add the chart component via the shadcn CLI**

Run: `npx shadcn@latest add chart --yes`

Expected: creates `components/ui/chart.tsx` and adds `recharts` to `package.json` dependencies. The CLI is non-interactive with `--yes` and uses the existing `components.json`.

- [ ] **Step 2: Verify the component and dependency landed**

- Confirm `components/ui/chart.tsx` exists and exports (at minimum) `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, and the `ChartConfig` type.
- Confirm `recharts` now appears under `dependencies` in `package.json`.

If the CLI could not reach the registry, fall back: run `npm install recharts`, then create `components/ui/chart.tsx` from the canonical source at <https://ui.shadcn.com/docs/components/chart> (the "chart.tsx" file shown there). The rest of this plan only uses the four exports listed above, which are stable across shadcn chart versions.

- [ ] **Step 3: Type-check and build**

Run: `npm run typecheck`
Expected: PASS (no errors).

Run: `npm run lint`
Expected: PASS. The generated `chart.tsx` is vendored shadcn code; if lint flags it (e.g. an existing repo rule), leave the file as generated and do not hand-edit beyond what the CLI produced.

- [ ] **Step 4: Commit**

```bash
git add components/ui/chart.tsx package.json package-lock.json
git commit -m "feat(dashboard): add recharts and shadcn chart primitive"
```

---

## Task 2: Date and currency helpers

**Files:**
- Create: `lib/dashboard/dates.ts`
- Create: `lib/dashboard/format.ts`

- [ ] **Step 1: Create `lib/dashboard/dates.ts`**

```ts
// Pure date + month-bucket helpers for the dashboard. No DB, no React.
// Month keys are "YYYY-MM" strings to match the repository's $dateToString
// output (which buckets in Asia/Kolkata).

export function startOfYear(d: Date = new Date()): Date {
  const x = new Date(d)
  x.setMonth(0, 1)
  x.setHours(0, 0, 0, 0)
  return x
}

export function endOfYear(d: Date = new Date()): Date {
  const x = new Date(d)
  x.setMonth(11, 31)
  x.setHours(23, 59, 59, 999)
  return x
}

export function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function parseISODate(raw: string | undefined, fallback: Date): Date {
  if (!raw) return fallback
  const d = new Date(raw + "T00:00:00")
  return Number.isNaN(d.getTime()) ? fallback : d
}

/** First day of the month 11 months ago (gives a 12-month inclusive window). */
export function last12MonthsStart(d: Date = new Date()): Date {
  const x = new Date(d)
  x.setMonth(x.getMonth() - 11, 1)
  x.setHours(0, 0, 0, 0)
  return x
}

/** Inclusive list of "YYYY-MM" month keys from `from`'s month to `to`'s month. */
export function monthRange(from: Date, to: Date): string[] {
  const out: string[] = []
  const cur = new Date(from.getFullYear(), from.getMonth(), 1)
  const end = new Date(to.getFullYear(), to.getMonth(), 1)
  while (cur <= end) {
    out.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`,
    )
    cur.setMonth(cur.getMonth() + 1)
  }
  return out
}

/** "2026-03" -> "Mar 26" for compact chart axis labels. */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleString("en-IN", {
    month: "short",
    year: "2-digit",
  })
}
```

- [ ] **Step 2: Create `lib/dashboard/format.ts`**

```ts
// Pure INR formatters. No DB, no React. Safe to import from client components.

const INR = new Intl.NumberFormat("en-IN")

/** Full amount, e.g. "₹12,34,567" or "−₹4,500". */
export function formatINR(n: number): string {
  return `${n < 0 ? "−" : ""}₹${INR.format(Math.abs(Math.round(n)))}`
}

function trim(x: number): string {
  return (Math.round(x * 10) / 10).toString()
}

/** Compact INR for axis ticks: ₹1.2Cr / ₹45L / ₹3.4K / ₹900. */
export function formatINRCompact(n: number): string {
  const sign = n < 0 ? "−" : ""
  const a = Math.abs(n)
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7)}Cr`
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5)}L`
  if (a >= 1e3) return `${sign}₹${trim(a / 1e3)}K`
  return `${sign}₹${Math.round(a)}`
}
```

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/dashboard/dates.ts lib/dashboard/format.ts
git commit -m "feat(dashboard): add date and currency helpers"
```

---

## Task 3: Repository — financial aggregations

**Files:**
- Create: `lib/dashboard/repository.ts`

This task creates the module with the scope type, shared helpers, and the three financial reads. Sales/inventory (Task 4) and materials (Task 5) append more exports to the same file.

- [ ] **Step 1: Create `lib/dashboard/repository.ts`**

```ts
import { ObjectId } from "mongodb"
import { getDb } from "@/lib/db/client"
import { monthRange } from "@/lib/dashboard/dates"

// IMPORTANT: do not import lib/transactions/repository.ts or
// lib/materials/repository.ts at the top level — they form a bidirectional
// value-import cycle. All pipelines here run directly against collections.

export type DashboardScope = {
  projectId: ObjectId | null // null = all projects (combined)
  from: Date
  to: Date
}

const TZ = "Asia/Kolkata"

function endOfDay(d: Date): Date {
  const e = new Date(d)
  e.setHours(23, 59, 59, 999)
  return e
}

/** Match on a date field within scope, plus projectId when scoped. */
function rangeMatch(scope: DashboardScope, dateField: string): Record<string, unknown> {
  const m: Record<string, unknown> = {
    [dateField]: { $gte: scope.from, $lte: endOfDay(scope.to) },
  }
  if (scope.projectId) m.projectId = scope.projectId
  return m
}

/** Month bucket expression on `occurredAt`, in IST. */
const MONTH_EXPR = {
  $dateToString: { format: "%Y-%m", date: "$occurredAt", timezone: TZ },
}

/** $sum that nets reversal rows (reversalOf set => subtract their amount). */
const NETTED_AMOUNT_SUM = {
  $sum: {
    $cond: [
      { $ifNull: ["$reversalOf", false] },
      { $multiply: [{ $ifNull: ["$amount", 0] }, -1] },
      { $ifNull: ["$amount", 0] },
    ],
  },
}

async function getJvRevenue(
  db: ReturnType<typeof getDb>,
  projectId: ObjectId,
): Promise<number> {
  const res = await db
    .collection("units")
    .aggregate<{ total: number }>([
      {
        $match: {
          projectId,
          isJointVentureUnit: true,
          type: "apartment",
          status: "sold",
        },
      },
      { $group: { _id: null, total: { $sum: { $ifNull: ["$soldPriceTotal", 0] } } } },
    ])
    .toArray()
  return res[0]?.total ?? 0
}

export type KpiSummary = {
  revenue: number
  expenses: number
  net: number
  capital: number
  availableFunds: number
  unitsSold: number
  unitsTotal: number
  sellThroughPct: number
  materialsSpend: number
  jvRevenue: number | null // null when not scoped to a single JV project
}

/**
 * Top-line KPIs. Financials, capital, and materials spend are range-bound;
 * unit counts (sold / total / sell-through) are a current snapshot and ignore
 * the date range. jvRevenue is computed only when scoped to a single project.
 */
export async function getKpiSummary(scope: DashboardScope): Promise<KpiSummary> {
  const db = getDb()
  const txnMatch = { ...rangeMatch(scope, "occurredAt"), voided: { $ne: true } }
  const capMatch = rangeMatch(scope, "occurredAt")
  const matMatch = {
    ...rangeMatch(scope, "occurredAt"),
    category: "purchase",
    voided: { $ne: true },
  }
  const unitMatch: Record<string, unknown> = {}
  if (scope.projectId) unitMatch.projectId = scope.projectId

  const [byKind, capAgg, unitRows, matAgg, jvRevenue] = await Promise.all([
    db
      .collection("transactions")
      .aggregate<{ _id: "income" | "expense"; total: number }>([
        { $match: txnMatch },
        { $group: { _id: "$kind", total: NETTED_AMOUNT_SUM } },
      ])
      .toArray(),
    db
      .collection("capitalInjections")
      .aggregate<{ total: number }>([
        { $match: capMatch },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray(),
    db
      .collection("units")
      .aggregate<{ _id: "available" | "sold"; count: number }>([
        { $match: unitMatch },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ])
      .toArray(),
    db
      .collection("materialMovements")
      .aggregate<{ total: number }>([
        { $match: matMatch },
        { $group: { _id: null, total: NETTED_AMOUNT_SUM } },
      ])
      .toArray(),
    scope.projectId ? getJvRevenue(db, scope.projectId) : Promise.resolve(null),
  ])

  let revenue = 0
  let expenses = 0
  for (const r of byKind) {
    if (r._id === "income") revenue = r.total
    else if (r._id === "expense") expenses = r.total
  }
  let unitsSold = 0
  let unitsTotal = 0
  for (const r of unitRows) {
    unitsTotal += r.count
    if (r._id === "sold") unitsSold = r.count
  }
  const capital = capAgg[0]?.total ?? 0
  const materialsSpend = matAgg[0]?.total ?? 0

  return {
    revenue,
    expenses,
    net: revenue - expenses,
    capital,
    availableFunds: capital + revenue - expenses,
    unitsSold,
    unitsTotal,
    sellThroughPct: unitsTotal > 0 ? Math.round((unitsSold / unitsTotal) * 100) : 0,
    materialsSpend,
    jvRevenue,
  }
}

export type MonthlyFinancialPoint = {
  month: string
  revenue: number
  expenses: number
  capital: number
}

/** Monthly revenue / expenses / capital, gap-filled across the scope window. */
export async function getMonthlyFinancials(
  scope: DashboardScope,
): Promise<MonthlyFinancialPoint[]> {
  const db = getDb()
  const txnMatch = { ...rangeMatch(scope, "occurredAt"), voided: { $ne: true } }

  const [txnRows, capRows] = await Promise.all([
    db
      .collection("transactions")
      .aggregate<{ _id: { month: string; kind: "income" | "expense" }; total: number }>([
        { $match: txnMatch },
        { $group: { _id: { month: MONTH_EXPR, kind: "$kind" }, total: NETTED_AMOUNT_SUM } },
      ])
      .toArray(),
    db
      .collection("capitalInjections")
      .aggregate<{ _id: string; total: number }>([
        { $match: rangeMatch(scope, "occurredAt") },
        { $group: { _id: MONTH_EXPR, total: { $sum: "$amount" } } },
      ])
      .toArray(),
  ])

  const byMonth = new Map<string, { revenue: number; expenses: number; capital: number }>()
  const ensure = (m: string) => {
    let e = byMonth.get(m)
    if (!e) {
      e = { revenue: 0, expenses: 0, capital: 0 }
      byMonth.set(m, e)
    }
    return e
  }
  for (const r of txnRows) {
    const e = ensure(r._id.month)
    if (r._id.kind === "income") e.revenue = r.total
    else if (r._id.kind === "expense") e.expenses = r.total
  }
  for (const r of capRows) ensure(r._id).capital = r.total

  return monthRange(scope.from, scope.to).map((month) => ({
    month,
    revenue: byMonth.get(month)?.revenue ?? 0,
    expenses: byMonth.get(month)?.expenses ?? 0,
    capital: byMonth.get(month)?.capital ?? 0,
  }))
}

/**
 * Earliest activity date in scope (min of transaction / movement occurredAt),
 * used to bound the "All time" preset. Returns null when there is no activity.
 */
export async function getEarliestActivityDate(
  projectId: ObjectId | null,
): Promise<Date | null> {
  const db = getDb()
  const m: Record<string, unknown> = {}
  if (projectId) m.projectId = projectId
  const [t, mv] = await Promise.all([
    db
      .collection("transactions")
      .find(m)
      .sort({ occurredAt: 1 })
      .limit(1)
      .project<{ occurredAt: Date }>({ occurredAt: 1 })
      .toArray(),
    db
      .collection("materialMovements")
      .find(m)
      .sort({ occurredAt: 1 })
      .limit(1)
      .project<{ occurredAt: Date }>({ occurredAt: 1 })
      .toArray(),
  ])
  const dates = [t[0]?.occurredAt, mv[0]?.occurredAt].filter(
    (d): d is Date => d instanceof Date,
  )
  if (dates.length === 0) return null
  return new Date(Math.min(...dates.map((d) => d.getTime())))
}
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: PASS. If you see "Cannot find name 'monthRange'", Task 2 was skipped.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/dashboard/repository.ts
git commit -m "feat(dashboard): add financial aggregations (KPIs, monthly, earliest)"
```

---

## Task 4: Repository — sales & inventory aggregations

**Files:**
- Modify: `lib/dashboard/repository.ts` (append exports)

- [ ] **Step 1: Append to `lib/dashboard/repository.ts`**

Add at the end of the file:

```ts
export type InventoryBreakdown = {
  soldApartments: number
  availableApartments: number
  soldParkings: number
  availableParkings: number
}

/** Current inventory snapshot (ignores the date range). */
export async function getInventoryBreakdown(
  scope: DashboardScope,
): Promise<InventoryBreakdown> {
  const db = getDb()
  const match: Record<string, unknown> = {}
  if (scope.projectId) match.projectId = scope.projectId
  const rows = await db
    .collection("units")
    .aggregate<{ _id: { type: string; status: string }; count: number }>([
      { $match: match },
      { $group: { _id: { type: "$type", status: "$status" }, count: { $sum: 1 } } },
    ])
    .toArray()
  const out: InventoryBreakdown = {
    soldApartments: 0,
    availableApartments: 0,
    soldParkings: 0,
    availableParkings: 0,
  }
  for (const r of rows) {
    if (r._id.type === "apartment") {
      if (r._id.status === "sold") out.soldApartments = r.count
      else out.availableApartments = r.count
    } else if (r._id.type === "parking") {
      if (r._id.status === "sold") out.soldParkings = r.count
      else out.availableParkings = r.count
    }
  }
  return out
}

export type MonthlySalesPoint = { month: string; unitsSold: number; revenue: number }

/** Units sold per month (bucketed by soldAt) + sale revenue, gap-filled. */
export async function getMonthlySales(
  scope: DashboardScope,
): Promise<MonthlySalesPoint[]> {
  const db = getDb()
  const match: Record<string, unknown> = {
    status: "sold",
    soldAt: { $gte: scope.from, $lte: endOfDay(scope.to) },
  }
  if (scope.projectId) match.projectId = scope.projectId
  const rows = await db
    .collection("units")
    .aggregate<{ _id: string; unitsSold: number; revenue: number }>([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$soldAt", timezone: TZ } },
          unitsSold: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$soldPriceTotal", 0] } },
        },
      },
    ])
    .toArray()
  const byMonth = new Map(rows.map((r) => [r._id, r]))
  return monthRange(scope.from, scope.to).map((month) => ({
    month,
    unitsSold: byMonth.get(month)?.unitsSold ?? 0,
    revenue: byMonth.get(month)?.revenue ?? 0,
  }))
}

export type ProjectRevenuePoint = {
  projectId: string
  projectName: string
  revenue: number
}

/**
 * Net income per project within the range (combined view only — always spans
 * all projects regardless of scope.projectId). Sorted descending.
 */
export async function getRevenueByProject(range: {
  from: Date
  to: Date
}): Promise<ProjectRevenuePoint[]> {
  const db = getDb()
  const rows = await db
    .collection("transactions")
    .aggregate<{ _id: ObjectId; revenue: number }>([
      {
        $match: {
          kind: "income",
          voided: { $ne: true },
          occurredAt: { $gte: range.from, $lte: endOfDay(range.to) },
        },
      },
      { $group: { _id: "$projectId", revenue: NETTED_AMOUNT_SUM } },
      { $match: { revenue: { $gt: 0 } } },
      { $sort: { revenue: -1 } },
    ])
    .toArray()
  if (rows.length === 0) return []
  const projects = await db
    .collection("projects")
    .find({ _id: { $in: rows.map((r) => r._id) } })
    .project<{ _id: ObjectId; name: string }>({ name: 1 })
    .toArray()
  const nameById = new Map(projects.map((p) => [p._id.toHexString(), p.name]))
  return rows.map((r) => ({
    projectId: r._id.toHexString(),
    projectName: nameById.get(r._id.toHexString()) ?? "(unknown project)",
    revenue: r.revenue,
  }))
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/dashboard/repository.ts
git commit -m "feat(dashboard): add sales and inventory aggregations"
```

---

## Task 5: Repository — materials & procurement aggregations

**Files:**
- Modify: `lib/dashboard/repository.ts` (append exports)

- [ ] **Step 1: Append to `lib/dashboard/repository.ts`**

Add at the end of the file:

```ts
export type MaterialSpendPoint = { materialId: string; name: string; spend: number }

/** Top materials by net purchase spend in the range. */
export async function getTopMaterialsBySpend(
  scope: DashboardScope,
  limit = 8,
): Promise<MaterialSpendPoint[]> {
  const db = getDb()
  const match = {
    ...rangeMatch(scope, "occurredAt"),
    category: "purchase",
    voided: { $ne: true },
  }
  const rows = await db
    .collection("materialMovements")
    .aggregate<{ _id: ObjectId; spend: number }>([
      { $match: match },
      { $group: { _id: "$materialId", spend: NETTED_AMOUNT_SUM } },
      { $match: { spend: { $gt: 0 } } },
      { $sort: { spend: -1 } },
      { $limit: limit },
    ])
    .toArray()
  if (rows.length === 0) return []
  const mats = await db
    .collection("materials")
    .find({ _id: { $in: rows.map((r) => r._id) } })
    .project<{ _id: ObjectId; name: string }>({ name: 1 })
    .toArray()
  const nameById = new Map(mats.map((m) => [m._id.toHexString(), m.name]))
  return rows.map((r) => ({
    materialId: r._id.toHexString(),
    name: nameById.get(r._id.toHexString()) ?? "(unknown)",
    spend: r.spend,
  }))
}

export type MaterialFlowPoint = { month: string; purchases: number; consumption: number }

/**
 * Monthly purchase vs consumption value (₹), gap-filled. Purchases use the
 * netted movement amount. Consumption uses the movement amount when present,
 * else qty × catalog unitPrice; a material with no price contributes 0.
 */
export async function getMonthlyMaterialFlow(
  scope: DashboardScope,
): Promise<MaterialFlowPoint[]> {
  const db = getDb()
  const match = {
    ...rangeMatch(scope, "occurredAt"),
    category: { $in: ["purchase", "consumption"] },
    voided: { $ne: true },
  }
  const rows = await db
    .collection("materialMovements")
    .aggregate<{ _id: { month: string; category: string }; value: number }>([
      { $match: match },
      {
        $lookup: {
          from: "materials",
          localField: "materialId",
          foreignField: "_id",
          as: "mat",
        },
      },
      { $addFields: { unitPrice: { $ifNull: [{ $arrayElemAt: ["$mat.unitPrice", 0] }, 0] } } },
      {
        $addFields: {
          value: {
            $cond: [
              { $eq: ["$category", "purchase"] },
              {
                $cond: [
                  { $ifNull: ["$reversalOf", false] },
                  { $multiply: [{ $ifNull: ["$amount", 0] }, -1] },
                  { $ifNull: ["$amount", 0] },
                ],
              },
              { $ifNull: ["$amount", { $multiply: ["$qty", "$unitPrice"] }] },
            ],
          },
        },
      },
      { $group: { _id: { month: MONTH_EXPR, category: "$category" }, value: { $sum: "$value" } } },
    ])
    .toArray()
  const byMonth = new Map<string, { purchases: number; consumption: number }>()
  for (const r of rows) {
    let e = byMonth.get(r._id.month)
    if (!e) {
      e = { purchases: 0, consumption: 0 }
      byMonth.set(r._id.month, e)
    }
    if (r._id.category === "purchase") e.purchases = r.value
    else if (r._id.category === "consumption") e.consumption = r.value
  }
  return monthRange(scope.from, scope.to).map((month) => ({
    month,
    purchases: byMonth.get(month)?.purchases ?? 0,
    consumption: byMonth.get(month)?.consumption ?? 0,
  }))
}

export type StockValue = {
  total: number
  byMaterial: { name: string; value: number }[]
  hasUnpriced: boolean
}

/** Current stock value on hand (snapshot): Σ stockOnHand × catalog unitPrice. */
export async function getStockValue(scope: DashboardScope): Promise<StockValue> {
  const db = getDb()
  const match: Record<string, unknown> = {}
  if (scope.projectId) match.projectId = scope.projectId
  const rows = await db
    .collection("projectMaterials")
    .aggregate<{ _id: ObjectId; name: string; stock: number; unitPrice: number | null }>([
      { $match: match },
      { $group: { _id: "$materialId", stock: { $sum: "$stockOnHand" } } },
      { $lookup: { from: "materials", localField: "_id", foreignField: "_id", as: "mat" } },
      {
        $addFields: {
          name: { $ifNull: [{ $arrayElemAt: ["$mat.name", 0] }, "(unknown)"] },
          unitPrice: { $arrayElemAt: ["$mat.unitPrice", 0] },
        },
      },
      { $project: { name: 1, stock: 1, unitPrice: 1 } },
    ])
    .toArray()
  let total = 0
  let hasUnpriced = false
  const byMaterial = rows
    .map((r) => {
      const price = r.unitPrice ?? 0
      if ((r.unitPrice == null) && r.stock > 0) hasUnpriced = true
      const value = r.stock * price
      total += value
      return { name: r.name, value }
    })
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)
  return { total, byMaterial, hasUnpriced }
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/dashboard/repository.ts
git commit -m "feat(dashboard): add materials and procurement aggregations"
```

---

## Task 6: Filter bar (scope + date range + presets)

**Files:**
- Create: `app/(authed)/dashboard/dashboard-filters.tsx`

- [ ] **Step 1: Create `app/(authed)/dashboard/dashboard-filters.tsx`**

```tsx
"use client"

import { useUrlFilters } from "@/lib/hooks"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { isoDate, last12MonthsStart } from "@/lib/dashboard/dates"

export function DashboardFilters({
  projects,
  defaultFrom,
  defaultTo,
  allTimeFrom,
}: {
  projects: { id: string; name: string }[]
  defaultFrom: string
  defaultTo: string
  allTimeFrom: string
}) {
  // Dashboard has no pagination params to reset.
  const { get, setParam, setParams } = useUrlFilters([])
  const project = get("project", "all")
  const from = get("from", defaultFrom)
  const to = get("to", defaultTo)
  const today = isoDate(new Date())

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label>Scope</Label>
        <Select value={project} onValueChange={(v) => setParam("project", v)}>
          <SelectTrigger className="w-[240px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects (combined)</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="from">From</Label>
        <Input
          id="from"
          type="date"
          value={from}
          onChange={(e) => setParam("from", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="to">To</Label>
        <Input
          id="to"
          type="date"
          value={to}
          onChange={(e) => setParam("to", e.target.value)}
        />
      </div>
      <div className="flex items-center gap-1.5 pb-0.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setParams({ from: defaultFrom, to: defaultTo })}
        >
          This year
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setParams({ from: isoDate(last12MonthsStart()), to: today })
          }
        >
          Last 12 months
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setParams({ from: allTimeFrom, to: today })}
        >
          All time
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/(authed)/dashboard/dashboard-filters.tsx
git commit -m "feat(dashboard): add scope + date-range filter bar"
```

---

## Task 7: Section A — Financial trends charts

**Files:**
- Create: `app/(authed)/dashboard/financial-trends.tsx`

- [ ] **Step 1: Create `app/(authed)/dashboard/financial-trends.tsx`**

```tsx
"use client"

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { MonthlyFinancialPoint } from "@/lib/dashboard/repository"
import { monthLabel } from "@/lib/dashboard/dates"
import { formatINR, formatINRCompact } from "@/lib/dashboard/format"

const config = {
  revenue: { label: "Revenue", color: "var(--chart-2)" },
  expenses: { label: "Expenses", color: "var(--chart-4)" },
  net: { label: "Net", color: "var(--chart-1)" },
  cumulative: { label: "Available funds", color: "var(--chart-3)" },
} satisfies ChartConfig

type Row = MonthlyFinancialPoint & { net: number; cumulative: number }

export function FinancialTrends({ monthly }: { monthly: MonthlyFinancialPoint[] }) {
  let running = 0
  const data: Row[] = monthly.map((m) => {
    const net = m.revenue - m.expenses
    running += m.capital + net
    return { ...m, net, cumulative: running }
  })

  const hasActivity = monthly.some(
    (m) => m.revenue !== 0 || m.expenses !== 0 || m.capital !== 0,
  )

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Financial trends
      </h2>
      {!hasActivity ? (
        <Empty>No financial activity in this range.</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="Revenue vs Expenses by month">
            <ChartContainer config={config} className="h-[260px] w-full">
              <BarChart data={data} margin={{ left: 4, right: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={monthLabel}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tickFormatter={formatINRCompact}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(v) => monthLabel(String(v))}
                      formatter={(value, name) => (
                        <span className="flex w-full justify-between gap-3">
                          <span className="text-muted-foreground">
                            {config[name as keyof typeof config]?.label ?? name}
                          </span>
                          <span className="font-mono">{formatINR(Number(value))}</span>
                        </span>
                      )}
                    />
                  }
                />
                <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} />
                <Bar dataKey="expenses" fill="var(--color-expenses)" radius={4} />
              </BarChart>
            </ChartContainer>
          </ChartCard>

          <ChartCard title="Net by month">
            <ChartContainer config={config} className="h-[260px] w-full">
              <LineChart data={data} margin={{ left: 4, right: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={monthLabel}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tickFormatter={formatINRCompact}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(v) => monthLabel(String(v))}
                      formatter={(value) => (
                        <span className="font-mono">{formatINR(Number(value))}</span>
                      )}
                    />
                  }
                />
                <Line
                  dataKey="net"
                  stroke="var(--color-net)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          </ChartCard>

          <ChartCard title="Cumulative available funds" full>
            <ChartContainer config={config} className="h-[260px] w-full">
              <AreaChart data={data} margin={{ left: 4, right: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={monthLabel}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tickFormatter={formatINRCompact}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(v) => monthLabel(String(v))}
                      formatter={(value) => (
                        <span className="font-mono">{formatINR(Number(value))}</span>
                      )}
                    />
                  }
                />
                <Area
                  dataKey="cumulative"
                  stroke="var(--color-cumulative)"
                  fill="var(--color-cumulative)"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </ChartCard>
        </div>
      )}
    </section>
  )
}

function ChartCard({
  title,
  children,
  full,
}: {
  title: string
  children: React.ReactNode
  full?: boolean
}) {
  return (
    <Card className={full ? "lg:col-span-2" : ""}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
      {children}
    </Card>
  )
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npm run typecheck`
Expected: PASS. The `satisfies ChartConfig` and the `formatter`/`labelFormatter` render props are typed by the shadcn chart component; if typecheck complains about a `formatter` signature, ensure `components/ui/chart.tsx` from Task 1 exports `ChartTooltipContent` (it does in all shadcn versions).

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/(authed)/dashboard/financial-trends.tsx
git commit -m "feat(dashboard): add financial trends section"
```

---

## Task 8: Section B — Sales & inventory charts

**Files:**
- Create: `app/(authed)/dashboard/sales-inventory.tsx`

- [ ] **Step 1: Create `app/(authed)/dashboard/sales-inventory.tsx`**

```tsx
"use client"

import { useRouter } from "next/navigation"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type {
  InventoryBreakdown,
  MonthlySalesPoint,
  ProjectRevenuePoint,
} from "@/lib/dashboard/repository"
import { monthLabel } from "@/lib/dashboard/dates"
import { formatINR, formatINRCompact } from "@/lib/dashboard/format"

const velocityConfig = {
  unitsSold: { label: "Units sold", color: "var(--chart-1)" },
  revenue: { label: "Sale revenue", color: "var(--chart-2)" },
} satisfies ChartConfig

const inventoryConfig = {
  sold: { label: "Sold", color: "var(--chart-3)" },
  available: { label: "Available", color: "var(--chart-1)" },
} satisfies ChartConfig

const revByProjectConfig = {
  revenue: { label: "Revenue", color: "var(--chart-2)" },
} satisfies ChartConfig

export function SalesInventory({
  inventory,
  monthlySales,
  revenueByProject,
  scoped,
}: {
  inventory: InventoryBreakdown
  monthlySales: MonthlySalesPoint[]
  revenueByProject: ProjectRevenuePoint[]
  scoped: boolean // true = single project (hides revenue-by-project)
}) {
  const router = useRouter()
  const aptData = [
    { key: "sold", label: "Sold", value: inventory.soldApartments, fill: "var(--color-sold)" },
    {
      key: "available",
      label: "Available",
      value: inventory.availableApartments,
      fill: "var(--color-available)",
    },
  ]
  const hasApts = inventory.soldApartments + inventory.availableApartments > 0
  const hasSales = monthlySales.some((m) => m.unitsSold !== 0 || m.revenue !== 0)

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Sales &amp; inventory
      </h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Apartment inventory</CardTitle>
          </CardHeader>
          <CardContent>
            {!hasApts ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No apartments in scope.
              </p>
            ) : (
              <>
                <ChartContainer
                  config={inventoryConfig}
                  className="mx-auto aspect-square h-[240px]"
                >
                  <PieChart>
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, name) => (
                            <span className="flex w-full justify-between gap-3">
                              <span className="text-muted-foreground">{name}</span>
                              <span className="font-mono">{Number(value)}</span>
                            </span>
                          )}
                        />
                      }
                    />
                    <Pie
                      data={aptData}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={60}
                      outerRadius={90}
                    >
                      {aptData.map((d) => (
                        <Cell key={d.key} fill={d.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <p className="mt-2 text-center text-sm text-muted-foreground">
                  Parkings: {inventory.soldParkings} sold /{" "}
                  {inventory.soldParkings + inventory.availableParkings} total
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sales velocity</CardTitle>
          </CardHeader>
          <CardContent>
            {!hasSales ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No sales in this range.
              </p>
            ) : (
              <ChartContainer config={velocityConfig} className="h-[240px] w-full">
                <ComposedChart data={monthlySales} margin={{ left: 4, right: 4 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={monthLabel}
                  />
                  <YAxis
                    yAxisId="left"
                    tickLine={false}
                    axisLine={false}
                    width={32}
                    allowDecimals={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tickFormatter={formatINRCompact}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(v) => monthLabel(String(v))}
                        formatter={(value, name) => (
                          <span className="flex w-full justify-between gap-3">
                            <span className="text-muted-foreground">
                              {velocityConfig[name as keyof typeof velocityConfig]?.label ??
                                name}
                            </span>
                            <span className="font-mono">
                              {name === "revenue"
                                ? formatINR(Number(value))
                                : Number(value)}
                            </span>
                          </span>
                        )}
                      />
                    }
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="unitsSold"
                    fill="var(--color-unitsSold)"
                    radius={4}
                  />
                  <Line
                    yAxisId="right"
                    dataKey="revenue"
                    stroke="var(--color-revenue)"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {!scoped ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Revenue by project</CardTitle>
            </CardHeader>
            <CardContent>
              {revenueByProject.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No project revenue in this range.
                </p>
              ) : (
                <>
                  <ChartContainer
                    config={revByProjectConfig}
                    className="w-full"
                    style={{ height: Math.max(160, revenueByProject.length * 40) }}
                  >
                    <BarChart
                      data={revenueByProject}
                      layout="vertical"
                      margin={{ left: 8, right: 16 }}
                    >
                      <CartesianGrid horizontal={false} />
                      <XAxis
                        type="number"
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={formatINRCompact}
                      />
                      <YAxis
                        type="category"
                        dataKey="projectName"
                        tickLine={false}
                        axisLine={false}
                        width={140}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(value) => (
                              <span className="font-mono">{formatINR(Number(value))}</span>
                            )}
                          />
                        }
                      />
                      <Bar
                        dataKey="revenue"
                        fill="var(--color-revenue)"
                        radius={4}
                        cursor="pointer"
                        onClick={(entry) => {
                          const pid = (entry as unknown as { projectId?: string })
                            .projectId
                          if (pid) router.push(`/projects/${pid}?tab=financials`)
                        }}
                      />
                    </BarChart>
                  </ChartContainer>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Click a bar to open that project&apos;s financials.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run lint`
Expected: PASS. If lint flags the `style={{ height: ... }}` inline style, that is acceptable for a data-driven dynamic height; if the repo's lint forbids inline styles, replace it with a fixed `className="h-[420px]"` on the `ChartContainer` instead.

- [ ] **Step 3: Commit**

```bash
git add app/(authed)/dashboard/sales-inventory.tsx
git commit -m "feat(dashboard): add sales and inventory section"
```

---

## Task 9: Section C — Materials & procurement charts

**Files:**
- Create: `app/(authed)/dashboard/materials-procurement.tsx`

- [ ] **Step 1: Create `app/(authed)/dashboard/materials-procurement.tsx`**

```tsx
"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type {
  MaterialFlowPoint,
  MaterialSpendPoint,
  StockValue,
} from "@/lib/dashboard/repository"
import { monthLabel } from "@/lib/dashboard/dates"
import { formatINR, formatINRCompact } from "@/lib/dashboard/format"

const spendConfig = {
  spend: { label: "Spend", color: "var(--chart-4)" },
} satisfies ChartConfig

const flowConfig = {
  purchases: { label: "Purchases", color: "var(--chart-2)" },
  consumption: { label: "Consumption", color: "var(--chart-5)" },
} satisfies ChartConfig

export function MaterialsProcurement({
  topMaterials,
  monthlyFlow,
  stockValue,
}: {
  topMaterials: MaterialSpendPoint[]
  monthlyFlow: MaterialFlowPoint[]
  stockValue: StockValue
}) {
  const hasFlow = monthlyFlow.some(
    (m) => m.purchases !== 0 || m.consumption !== 0,
  )

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Materials &amp; procurement
      </h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top materials by spend</CardTitle>
          </CardHeader>
          <CardContent>
            {topMaterials.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No purchases in this range.
              </p>
            ) : (
              <ChartContainer
                config={spendConfig}
                className="w-full"
                style={{ height: Math.max(160, topMaterials.length * 40) }}
              >
                <BarChart
                  data={topMaterials}
                  layout="vertical"
                  margin={{ left: 8, right: 16 }}
                >
                  <CartesianGrid horizontal={false} />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatINRCompact}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    width={140}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => (
                          <span className="font-mono">{formatINR(Number(value))}</span>
                        )}
                      />
                    }
                  />
                  <Bar dataKey="spend" fill="var(--color-spend)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Purchases vs consumption by month</CardTitle>
          </CardHeader>
          <CardContent>
            {!hasFlow ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No material movements in this range.
              </p>
            ) : (
              <ChartContainer config={flowConfig} className="h-[260px] w-full">
                <BarChart data={monthlyFlow} margin={{ left: 4, right: 4 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={monthLabel}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tickFormatter={formatINRCompact}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(v) => monthLabel(String(v))}
                        formatter={(value, name) => (
                          <span className="flex w-full justify-between gap-3">
                            <span className="text-muted-foreground">
                              {flowConfig[name as keyof typeof flowConfig]?.label ?? name}
                            </span>
                            <span className="font-mono">{formatINR(Number(value))}</span>
                          </span>
                        )}
                      />
                    }
                  />
                  <Bar dataKey="purchases" fill="var(--color-purchases)" radius={4} />
                  <Bar dataKey="consumption" fill="var(--color-consumption)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Current stock value on hand</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <span className="font-mono text-2xl">{formatINR(stockValue.total)}</span>
            {stockValue.byMaterial.length > 0 ? (
              <ul className="flex flex-col gap-1 text-sm">
                {stockValue.byMaterial.slice(0, 8).map((m) => (
                  <li key={m.name} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{m.name}</span>
                    <span className="font-mono">{formatINR(m.value)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No priced stock on hand in scope.
              </p>
            )}
            {stockValue.hasUnpriced ? (
              <p className="text-xs text-muted-foreground">
                Some materials have no catalog price and are excluded from this total.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run lint`
Expected: PASS. (Same inline-`style` note as Task 8 applies to the top-materials height.)

- [ ] **Step 3: Commit**

```bash
git add app/(authed)/dashboard/materials-procurement.tsx
git commit -m "feat(dashboard): add materials and procurement section"
```

---

## Task 10: Wire the page and add the nav link

**Files:**
- Create: `app/(authed)/dashboard/page.tsx`
- Modify: `app/(authed)/layout.tsx` (add the Dashboard link)

- [ ] **Step 1: Create `app/(authed)/dashboard/page.tsx`**

```tsx
import { ObjectId } from "mongodb"
import { requireAdmin } from "@/lib/auth/session"
import { listProjects } from "@/lib/projects/repository"
import {
  getKpiSummary,
  getMonthlyFinancials,
  getInventoryBreakdown,
  getMonthlySales,
  getRevenueByProject,
  getTopMaterialsBySpend,
  getMonthlyMaterialFlow,
  getStockValue,
  getEarliestActivityDate,
  type DashboardScope,
  type KpiSummary,
} from "@/lib/dashboard/repository"
import { startOfYear, endOfYear, isoDate, parseISODate } from "@/lib/dashboard/dates"
import { formatINR } from "@/lib/dashboard/format"
import { DashboardFilters } from "./dashboard-filters"
import { FinancialTrends } from "./financial-trends"
import { SalesInventory } from "./sales-inventory"
import { MaterialsProcurement } from "./materials-procurement"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; from?: string; to?: string }>
}) {
  await requireAdmin()
  const sp = await searchParams
  const projects = await listProjects()

  const projectId =
    sp.project && sp.project !== "all" && ObjectId.isValid(sp.project)
      ? new ObjectId(sp.project)
      : null

  const defaultFrom = startOfYear()
  const defaultTo = endOfYear()
  const from = parseISODate(sp.from, defaultFrom)
  const to = parseISODate(sp.to, defaultTo)
  const scope: DashboardScope = { projectId, from, to }

  const earliest = await getEarliestActivityDate(projectId)
  const allTimeFrom = isoDate(earliest ?? defaultFrom)

  const [
    kpis,
    monthly,
    inventory,
    monthlySales,
    revenueByProject,
    topMaterials,
    materialFlow,
    stockValue,
  ] = await Promise.all([
    getKpiSummary(scope),
    getMonthlyFinancials(scope),
    getInventoryBreakdown(scope),
    getMonthlySales(scope),
    projectId ? Promise.resolve([]) : getRevenueByProject({ from, to }),
    getTopMaterialsBySpend(scope),
    getMonthlyMaterialFlow(scope),
    getStockValue(scope),
  ])

  const selectedProject = projectId
    ? projects.find((p) => p._id.toHexString() === projectId.toHexString()) ?? null
    : null

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {selectedProject
            ? `Insights for ${selectedProject.name}.`
            : "Combined insights across all projects."}
        </p>
      </header>

      <DashboardFilters
        projects={projects.map((p) => ({ id: p._id.toHexString(), name: p.name }))}
        defaultFrom={isoDate(defaultFrom)}
        defaultTo={isoDate(defaultTo)}
        allTimeFrom={allTimeFrom}
      />

      <KpiRow kpis={kpis} />

      <FinancialTrends monthly={monthly} />
      <SalesInventory
        inventory={inventory}
        monthlySales={monthlySales}
        revenueByProject={revenueByProject}
        scoped={projectId !== null}
      />
      <MaterialsProcurement
        topMaterials={topMaterials}
        monthlyFlow={materialFlow}
        stockValue={stockValue}
      />
    </div>
  )
}

function KpiRow({ kpis }: { kpis: KpiSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile label="Revenue" value={formatINR(kpis.revenue)} />
      <Tile label="Expenses" value={formatINR(kpis.expenses)} />
      <Tile label="Net" value={formatINR(kpis.net)} negative={kpis.net < 0} />
      <Tile label="Capital deployed" value={formatINR(kpis.capital)} />
      <Tile
        label="Available funds"
        value={`${formatINR(Math.abs(kpis.availableFunds))}${
          kpis.availableFunds < 0 ? " (deficit)" : ""
        }`}
        negative={kpis.availableFunds < 0}
      />
      <Tile
        label="Units sold"
        value={`${kpis.unitsSold} / ${kpis.unitsTotal} (${kpis.sellThroughPct}%)`}
      />
      <Tile label="Materials spend" value={formatINR(kpis.materialsSpend)} />
      {kpis.jvRevenue !== null ? (
        <Tile label="JV revenue (excl. P&L)" value={formatINR(kpis.jvRevenue)} />
      ) : null}
    </div>
  )
}

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
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className={`font-mono text-xl${negative ? " text-destructive" : ""}`}>
        {value}
      </span>
    </div>
  )
}
```

- [ ] **Step 2: Add the "Dashboard" nav link in `app/(authed)/layout.tsx`**

In `app/(authed)/layout.tsx`, the admin-only block currently starts with the Catalog link. Insert a Dashboard link immediately after the opening `<>` of the `isAdmin ? (` fragment, **before** the Catalog `<Link>` (currently around line 38):

```tsx
              <Link
                href="/dashboard"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Dashboard
              </Link>
```

The result is the admin links read: **Dashboard · Catalog · Financials · Transfers · Audit · Settings**.

- [ ] **Step 3: Type-check and lint**

Run: `npm run typecheck`
Expected: PASS. If "Property 'X' does not exist on type ..." appears for a repository import, confirm Tasks 3–5 exported every name used in the `Promise.all`.

Run: `npm run lint`
Expected: PASS. Watch for unused imports — every import in `page.tsx` is used.

- [ ] **Step 4: Commit**

```bash
git add app/(authed)/dashboard/page.tsx app/(authed)/layout.tsx
git commit -m "feat(dashboard): wire dashboard page and add nav link"
```

---

## Task 11: Build and manual verification

**Files:** none (verification only)

- [ ] **Step 1: Production build**

Run: `npm run build`
Expected: build completes with no type or compile errors. Recharts is client-only; confirm the build does not error on the chart components (they are all `"use client"`).

- [ ] **Step 2: Start the dev server**

Run: `npm run dev`
Then open `http://localhost:3000/dashboard` as an **admin** user.

- [ ] **Step 3: Manual checks**

As an **admin**, confirm:
- The nav bar shows **Dashboard** as the first admin link; clicking it loads the page.
- Default scope is **All projects (combined)**; default range is the current year.
- **KPI tiles** show Revenue, Expenses, Net (red when negative), Capital deployed, Available funds (shows "(deficit)" + red when negative), Units sold / total (%), Materials spend. No JV tile in combined view.
- **Financial trends**: revenue-vs-expenses grouped bars, net line, cumulative-available-funds area — all bucketed by month with abbreviated ₹ axis ticks; hovering shows full ₹ amounts.
- **Sales & inventory**: apartment donut (sold vs available) + parkings line, sales-velocity combo (bars + revenue line), and a **Revenue by project** horizontal bar. Clicking a project bar navigates to `/projects/<id>?tab=financials`.
- **Materials & procurement**: top-materials horizontal bar, purchases-vs-consumption monthly bars, and the stock-value total + per-material list.
- Switch **Scope** to a single project: charts re-scope, the **Revenue by project** card disappears, and (for a JV project) the **JV revenue** KPI tile appears.
- Date **presets** (This year / Last 12 months / All time) change the range and the charts update. "All time" starts at the earliest activity.
- Pick a project / range with **no data**: KPIs read ₹0 and each chart shows its empty-state message rather than a broken chart.

As a **non-admin** (floor manager): navigating to `/dashboard` redirects to `/` (the `requireAdmin` guard). The Dashboard link is not shown in their nav.

- [ ] **Step 4: Stop the dev server** (Ctrl+C).

- [ ] **Step 5: Final commit (if any manual fixes were needed)**

If Step 3 surfaced fixes, commit them:

```bash
git add -A
git commit -m "fix(dashboard): manual verification adjustments"
```

Otherwise nothing to commit.

---

## Self-Review

**Spec coverage:**
- Admin-only `/dashboard` route — Task 10 (`requireAdmin`). ✓
- Nav link, Financials preserved — Task 10 Step 2 (link added; no `/financials` change). ✓
- Scope control (combined vs per-project) via `?project` — Tasks 6 + 10. ✓
- Date range + presets (This year / Last 12 months / All time) — Task 6; earliest bound from `getEarliestActivityDate` (Task 3). ✓
- KPI tile row (revenue, expenses, net, capital, available funds, units sold/total + %, materials spend, JV when scoped) — Task 10 `KpiRow`/`getKpiSummary`. ✓
- Section A: revenue-vs-expenses grouped bars, net line, cumulative cash-flow area — Task 7 + `getMonthlyFinancials`. ✓
- Section B: inventory donut, sales-velocity combo, revenue-by-project (combined only, links out) — Task 8 + `getInventoryBreakdown`/`getMonthlySales`/`getRevenueByProject`. ✓
- Section C: top materials by spend, purchases-vs-consumption (valued per the spec's rule), stock value on hand — Task 9 + `getTopMaterialsBySpend`/`getMonthlyMaterialFlow`/`getStockValue`. ✓
- Plain-JSON serialization — every repository return type uses strings/numbers only. ✓
- Import-cycle avoidance — repository imports only `getDb`, `ObjectId`, `monthRange`; no transactions/materials repo imports. ✓
- Reversal/void netting; monthly granularity; ₹ compact ticks + full tooltips; empty states — Tasks 3–9. ✓
- Edge cases (deficit color, JV-omitted, revenue-by-project hidden when scoped, unpriced materials note) — Tasks 8–10. ✓

**Placeholder scan:** none — every code step contains complete code; the only branch is the Task 1 CLI-vs-manual fallback for a vendored shadcn file, which is fully specified.

**Type consistency:** Repository export names (`getKpiSummary`, `getMonthlyFinancials`, `getInventoryBreakdown`, `getMonthlySales`, `getRevenueByProject`, `getTopMaterialsBySpend`, `getMonthlyMaterialFlow`, `getStockValue`, `getEarliestActivityDate`) and types (`DashboardScope`, `KpiSummary`, `MonthlyFinancialPoint`, `InventoryBreakdown`, `MonthlySalesPoint`, `ProjectRevenuePoint`, `MaterialSpendPoint`, `MaterialFlowPoint`, `StockValue`) match exactly between Tasks 3–5 and their consumers in Tasks 7–10. `DashboardScope` shape (`projectId`/`from`/`to`) is consistent throughout. Chart `config` keys match the `var(--color-<key>)` references and the `dataKey`s in every chart.
```
