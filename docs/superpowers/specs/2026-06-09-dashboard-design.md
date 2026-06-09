# Dashboard — Design

**Date:** 2026-06-09
**Status:** Approved (design); pending implementation plan

## Summary

Add an admin-only `/dashboard` page that visualizes the business across all
domains — financials, sales/inventory, and materials/procurement — with a single
scope control to switch between a **combined all-projects view** and a
**per-project view**. The existing `/financials` page is preserved unchanged; the
dashboard is the visual/insights layer that links into Financials and project
detail pages for row-level detail.

Charts are rendered with **Recharts** via the **shadcn chart** component, themed
to the app's existing CSS tokens.

## Goals

- One place to see how the business is doing, in depth, with real charts (not
  just tiles).
- A scope selector: "All projects (combined)" or a single project.
- A date-range filter with quick presets.
- Three deep insight areas: financial trends, sales & inventory, materials &
  procurement.

## Non-goals

- No change to `/financials` (stays as the detailed table + CSV export view).
- No project-comparison leaderboard beyond a single "revenue by project" bar in
  the combined view.
- No new write operations. Read/visualize only.
- Not the post-login landing page (still redirects to `/projects`).

## Access & placement

- Route: `app/(authed)/dashboard/page.tsx`, server component, guarded by
  `requireAdmin()` (same gating as `/financials`).
- Nav: add a **"Dashboard"** link to the admin-only block in
  `app/(authed)/layout.tsx`, as the first item before "Catalog".
- Admin-only, full data. Floor managers never see it (consistent with the app's
  rule that financial figures are admin-only).

## Controls (URL-param driven)

Mirrors the existing `?from/?to` pattern in
`app/(authed)/financials/global-filters.tsx` and the `use-url-filters` hook.

- **Scope** → `?project=all` (default) or `?project=<projectId>`.
  - Rendered as a select: "All projects (combined)" plus one entry per project
    (from `listProjects()`).
  - Drives whether repository functions receive `projectId: null` (all) or a
    specific `ObjectId`.
- **Date range** → `?from=YYYY-MM-DD&?to=YYYY-MM-DD`.
  - Default = current calendar year (start-of-year → end-of-year), matching
    `/financials`.
  - Quick presets: **This year**, **Last 12 months**, **All time**.
  - "All time" lower bound is derived server-side from the earliest
    transaction/movement date in scope (falls back to current-year start if no
    data).

## Layout

```
┌────────────────────────────────────────────────────────────┐
│ Dashboard                          [Scope ▾] [Date range ▾] │
│ subtitle                                                     │
├────────────────────────────────────────────────────────────┤
│ KPI tiles (scope + range aware)                             │
│ Revenue · Expenses · Net · Capital deployed · Available     │
│ funds · Units sold/total (+ sell-through %) · Materials spend│
├────────────────────────────────────────────────────────────┤
│ Section A — Financial trends                                │
│ Section B — Sales & inventory                               │
│ Section C — Materials & procurement                         │
└────────────────────────────────────────────────────────────┘
```

KPI tiles reuse the existing bordered mono-`Tile` aesthetic (see
`projects/[id]/page.tsx` and `financials/page.tsx`). Net is color-coded
(destructive when negative). When a single JV project is in scope, add a "JV
revenue (excl. from P&L)" tile.

## Section A — Financial trends (transactions + capitalInjections)

- **Revenue vs Expenses by month** — grouped bar chart (two bars per month;
  grouped, not stacked, so the comparison is direct).
- **Net trend** — monthly line chart.
- **Cumulative cash flow** — area chart of running available funds
  (capital + revenue − expenses), accumulated month over month.

Rules: monthly buckets; voided rows excluded (`voided: { $ne: true }`);
reversals netted via the existing
`$cond: [{ $ifNull: ["$reversalOf", false] }, -amount, amount]` pattern used in
`computeTotals` / `listCrossProjectTotals`.

## Section B — Sales & inventory (units + sale transactions)

- **Inventory status** — donut: sold vs available. Apartments are the primary
  ring; parkings shown as a second ring or a small companion tile.
- **Sales velocity** — combo chart: units sold per month (bars) + sale revenue
  per month (line). Sold units bucket by `soldAt`; revenue from
  `soldPriceTotal` (or the matching sale transaction `amount`).
- **Revenue contribution by project** — horizontal bar, **combined view only**
  (hidden when a single project is selected). Each bar links to
  `/projects/<id>?tab=financials`.

## Section C — Materials & procurement (materialMovements + projectMaterials + materials)

- **Top materials by spend** — horizontal bar, top N by purchase `amount`
  (joined to catalog `name`).
- **Purchases vs consumption by month** — grouped bar, both valued in rupees.
  Purchases use the movement `amount`. Consumption uses the movement `amount`
  when present, else `qty × catalog unitPrice`; if the material has no price,
  that consumption contributes 0 value (and is noted, not silently dropped).
- **Current stock value on hand** — KPI tile + small per-material breakdown:
  Σ `projectMaterials.stockOnHand × materials.unitPrice` (materials with a null
  unitPrice contribute 0 and are flagged).

Rules: exclude voided/reversed movements consistently with how the materials
domain nets them; scope by `projectId` when set.

## Data layer

New self-contained module `lib/dashboard/repository.ts`. Every function takes a
single scope object `{ projectId: ObjectId | null; from: Date; to: Date }`
(`projectId: null` ⇒ all projects) and returns **plain JSON only** — months as
`"YYYY-MM"` strings, ids as hex strings, all values as numbers — so results
serialize cleanly across the server/client boundary into the chart components.

Functions:

- `getKpiSummary(scope)` → revenue, expenses, net, capital, availableFunds,
  unitsSold, unitsTotal, sellThroughPct, materialsSpend, (jvRevenue when single
  JV project).
- `getMonthlyFinancials(scope)` → `[{ month, revenue, expenses, net }]`.
- `getInventoryBreakdown(scope)` → `{ soldApartments, availableApartments,
  soldParkings, availableParkings }`.
- `getMonthlySales(scope)` → `[{ month, unitsSold, revenue }]`.
- `getRevenueByProject(range)` → `[{ projectId, projectName, revenue }]`
  (combined view only).
- `getTopMaterialsBySpend(scope, limit)` → `[{ materialId, name, spend }]`.
- `getMonthlyMaterialFlow(scope)` → `[{ month, purchases, consumption }]`.
- `getStockValue(scope)` → `{ total, byMaterial: [{ name, value }] }`.
- `getEarliestActivityDate(projectId | null)` → `Date | null` (for the "All
  time" preset lower bound).

Pipelines are written directly against collections (`transactions`, `units`,
`capitalInjections`, `materialMovements`, `projectMaterials`, `materials`). The
module must **not** import `lib/transactions/repository.ts` or
`lib/materials/repository.ts` at the top level — those two already form a
bidirectional value-import cycle, and a new top-level importer risks pulling it
into the dashboard module. Where existing aggregation logic is reused
(`computeTotals`-style netting, `listCrossProjectTotals`), copy the pipeline
shape rather than importing the function, or reference it inside a function body.

## Components

- `app/(authed)/dashboard/page.tsx` — server component: `requireAdmin`, parse
  `project/from/to`, resolve scope, fetch all aggregates with `Promise.all`,
  pass plain data to client components.
- `app/(authed)/dashboard/dashboard-filters.tsx` — `"use client"`: scope select
  + date range + presets, using `use-url-filters` / `use-debounced-search-param`
  hooks.
- `components/ui/chart.tsx` — the shadcn chart primitive (wraps Recharts),
  configured against existing CSS variables so chart colors match the theme in
  light and dark mode.
- `app/(authed)/dashboard/financial-trends.tsx` — `"use client"` Section A
  charts.
- `app/(authed)/dashboard/sales-inventory.tsx` — `"use client"` Section B
  charts.
- `app/(authed)/dashboard/materials-procurement.tsx` — `"use client"` Section C
  charts.

Each chart component receives data as props and renders an empty-state ("No data
in this range") when its series is empty. No client-side data fetching; no
`setState` inside `useEffect` (the enforced `react-hooks/set-state-in-effect`
rule).

## Dependencies

- Add `recharts`.
- Add `components/ui/chart.tsx` following the shadcn chart pattern.

## Formatting & conventions

- Money formatted with `Intl.NumberFormat("en-IN")`; whole rupees.
- Chart currency axis ticks abbreviated for readability (e.g. `₹1.2Cr`, `₹45L`);
  tooltips show full en-IN amounts.
- Monthly granularity for every time series.
- Reuse existing `Tile`, `Card`, `Select`, `Button`, `Badge` components and the
  mono/bordered aesthetic.

## Edge cases

- Empty scope / no data in range → KPIs show 0; each chart shows its empty-state.
- Single project with no JV → JV tile omitted.
- "Revenue by project" hidden entirely in per-project scope.
- Negative net / deficit available funds → destructive color, explicit
  `(deficit)` label as in the existing capital tab.
- Materials with null `unitPrice` → contribute 0 to stock value, surfaced as a
  note rather than silently dropped.
- Reversed/voided rows excluded everywhere, consistent with existing repos.

## Testing

- Repository aggregations: verify scope filtering (all vs single project), date
  bounds (inclusive, end-of-day on `to`), void/reversal netting, and month
  bucketing produce expected numbers against seeded data.
- Page renders for admin; redirects/blocks for non-admin.
- Charts render with representative data and with empty data (empty-state).
- Serialization: repository outputs contain no `ObjectId`/`Date` instances.

## Out of scope / future

- Weekly/daily granularity toggle.
- Export of dashboard data (CSV/PDF).
- Drill-down click-through from every chart segment (only the revenue-by-project
  bars link out in v1).
- Project-comparison leaderboard / health scoring.
