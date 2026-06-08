# Project detail page — move overview sections into tabs

**Date:** 2026-06-09
**Status:** Approved (design)

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

- **Separate tabs**, one per section (not a single combined "Overview" tab).
- **Tab order:** Summary · Capital · Joint Venture · Inventory · Materials · Financials.
- **Default tab:** Summary (the page lands here).
- **Visibility** matches today's gating exactly.

## Final tab bar

| Tab | Visible to | Content |
|---|---|---|
| Summary *(default)* | everyone | the 5 apartments-overview tiles: Total apartments, Total parkings, Sold, Revenue, Created |
| Capital | admin only | the 4 capital tiles (Total capital, Revenue, Total spent, Available funds) + the capital-injections table (when non-empty) + the **Add capital** button |
| Joint Venture | admin **and** `project.isJointVenture` | the 2 JV tiles (JV units, JV revenue) |
| Inventory | everyone | unchanged |
| Materials | everyone | unchanged |
| Financials | admin only | unchanged |

A user who requests a tab they cannot see (e.g. a non-admin hitting
`?tab=capital` or `?tab=financials`, or anyone hitting `?tab=jv` on a non-JV
project) falls back to **Summary**.

## Component changes

### 1. `app/(authed)/projects/[id]/project-tabs.tsx`

- Extend `TabValue` to
  `"summary" | "capital" | "jv" | "inventory" | "materials" | "financials"`.
- Add props: `summary`, `capital`, `jointVenture` (all `ReactNode`) and
  `isJointVenture: boolean`.
- Update `pickTab(raw, role, isJointVenture)`:
  - default `"summary"`;
  - honor the `?tab=` param;
  - gate `capital` and `financials` to `role === "admin"`;
  - gate `jv` to `role === "admin" && isJointVenture`;
  - fall back to `"summary"` for any disallowed/unknown value.
- Render `TabsTrigger`/`TabsContent` for Summary always; Capital and Financials
  for admins; Joint Venture for admins on JV projects; Inventory/Materials
  always. Order as specified above.
- Summary/Capital/JV `TabsContent` use `min-h-0 overflow-auto` so a long
  capital-injections list scrolls within the tab. Inventory/Materials/Financials
  keep `min-h-0 overflow-hidden` and their own internal scrolling.

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
