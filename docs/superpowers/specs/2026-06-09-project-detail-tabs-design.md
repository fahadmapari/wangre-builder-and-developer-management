# Project detail page — move overview sections into tabs

**Date:** 2026-06-09
**Status:** Implemented

> **Revision (2026-06-09, post-implementation):** the original design put all six
> tabs in a single strip. Per follow-up feedback, the layout now uses **two
> independent tab strips**: an overview strip (Summary / Capital / Joint Venture)
> at content height on top, and a data strip (Inventory / Materials / Financials)
> below it filling the remaining height. Each strip switches independently, so an
> overview tab and a data table are visible at the same time. Sections below are
> updated to match.

## Problem

The project detail page (`app/(authed)/projects/[id]/page.tsx`) pins a tall
block of cards above the data tabs: the project header, a 5-tile apartments
overview, a **Capital** section (4 tiles + a capital-injections table), and a
**Joint Venture** section. The page is height-constrained
(`h-[calc(100svh-3.5rem)]`, overflow hidden), so this pinned block squeezes the
table tabs (Inventory / Materials / Financials) into very little vertical space.

## Goal

Shrink the pinned top area to just the project header. Move the apartments
overview, Capital, and Joint Venture into their own tabs so that whichever tab
is active gets the full remaining height.

This is a presentational reorganization only: no data-fetching, repository,
schema, or test-data changes.

## Decisions

- **Two independent tab strips**, not one combined strip:
  - **Overview strip** (top, content height): Summary · Capital · Joint Venture.
  - **Data strip** (below, fills remaining height): Inventory · Materials · Financials.
- The strips switch independently — an overview tab and a data table show at once.
- **Defaults:** overview strip lands on Summary; data strip lands on Inventory.
- **Visibility** matches today's gating exactly.
- For non-admins the overview strip has only Summary, so its tab list is hidden
  and the Summary tiles render directly above the data strip.

## Tab strips

**Overview strip** (top, `shrink-0`):

| Tab | Visible to | Content |
|---|---|---|
| Summary *(default)* | everyone | the 5 apartments-overview tiles: Total apartments, Total parkings, Sold, Revenue, Created |
| Capital | admin only | the 4 capital tiles (Total capital, Revenue, Total spent, Available funds) + the capital-injections table (when non-empty) + the **Add capital** button |
| Joint Venture | admin **and** `project.isJointVenture` | the 2 JV tiles (JV units, JV revenue) |

**Data strip** (below, `flex-1`):

| Tab | Visible to | Content |
|---|---|---|
| Inventory *(default)* | everyone | unchanged |
| Materials | everyone | unchanged |
| Financials | admin only | unchanged |

The `?tab=` deep link drives whichever strip owns that value: `?tab=financials`
selects Financials in the data strip (overview stays on Summary); `?tab=capital`
selects Capital in the overview strip (data stays on Inventory). A value a user
cannot see (e.g. non-admin `?tab=financials`/`?tab=capital`, or `?tab=jv` on a
non-JV project) is ignored and the owning strip keeps its default.

## Component changes

### 1. `app/(authed)/projects/[id]/project-tabs.tsx`

- Two tab-value unions: `OverviewTab = "summary" | "capital" | "jv"` and
  `DataTab = "inventory" | "materials" | "financials"`.
- Two pick helpers reading the same `?tab=` param:
  - `pickOverviewTab(raw, isAdmin, isJointVenture)` → `capital` (admin), `jv`
    (admin + JV), else `summary`.
  - `pickDataTab(raw, isAdmin)` → `materials`, `financials` (admin), else
    `inventory`.
- Props: `summary`, `capital`, `jointVenture`, `inventory`, `materials`,
  `financials` (all `ReactNode`) and `isJointVenture: boolean`.
- Render two `<Tabs>` inside a fragment:
  - Overview `<Tabs className="shrink-0">` — its `TabsList` (Summary, Capital for
    admin, Joint Venture for admin+JV) is rendered only for admins; non-admins
    get the Summary `TabsContent` alone. Overview `TabsContent` use
    `overflow-auto` (the capital-injections table keeps its own `max-h-64`
    internal scroll).
  - Data `<Tabs className="flex min-h-0 flex-1 flex-col">` — `TabsList`
    (Inventory, Materials, Financials for admin) plus `TabsContent` with
    `min-h-0 overflow-hidden` and the existing internal scrolling / Phase
    placeholders.
- The parent (`page.tsx`) supplies the flex column with `gap-4` between strips.

### 2. `app/(authed)/projects/[id]/page.tsx`

- Remove from the pinned top area: the apartments-overview tile grid, both
  `CollapsibleSection` blocks (Capital, Joint Venture), and the `gap-8` stacking.
  The pinned area keeps only the `<header>` (name, location, last-updated line,
  status badge, Edit / Expand buttons).
- Build three ReactNodes and pass them into `<ProjectTabs>`:
  - `summary` — the existing 5-tile grid.
  - `capital` — the **Add capital** button + the 4 capital tiles + the
    capital-injections table (admin path; rendered only when `isAdmin`).
  - `jointVenture` — the 2 JV tiles (rendered only when `isAdmin && isJointVenture`).
- Pass `isJointVenture={project.isJointVenture ?? false}` to `<ProjectTabs>`.
- No change to the `Promise.all` data fetch: `funds`, `capitalInjections`,
  `jvStats`, `soldCount`, `revenue` are already fetched and simply render inside
  tab slots now. The `Tile` helper is retained.

### 3. Delete `app/(authed)/projects/[id]/collapsible-section.tsx`

After the move it has no remaining importers, so remove it.

## Deep links preserved

`?tab=financials` is linked from
`app/(authed)/financials/per-project-table.tsx`. That, plus `?tab=materials`
and `?tab=inventory`, continue to work. New accepted values: `summary`,
`capital`, `jv`.

## Out of scope

- No changes to the data layer, repositories, or schemas.
- No changes to the Inventory/Materials/Financials tab internals.
- No new dependencies.
