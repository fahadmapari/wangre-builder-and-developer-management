# Project List Filters — Design Spec

**Date:** 2026-06-07  
**Status:** Approved

## Summary

Add a search box and status chip filters to the Projects list page (`/projects`), consistent with the existing `LedgerFilters` and `InventoryFilters` patterns.

## Architecture

Server-side filtering via URL search params. The projects page is already a Next.js async server component; reading `searchParams` causes Next.js to re-render it on URL change. Filters update the URL via `router.replace()` in a client component (no full navigation).

## Components

### `app/(authed)/projects/project-filters.tsx` (new, `"use client"`)

- **Search input** — controlled, debounced 350ms, fires `applySearch` on change and on Enter. Displays a ✕ clear button when non-empty. Minimum 2 chars before setting the `search` param (same as ledger).
- **Status chip group** — options: All | Planning | Under Construction | Completed | On Hold. Single active selection; "All" removes the param. Uses the same `ChipGroup` sub-component pattern as existing filters.
- URL param keys: `search`, `status`.

### `app/(authed)/projects/page.tsx` (modified)

- Accept `{ searchParams }` prop (Next.js server component convention).
- Pass `status` and `search` values to `listProjects()`.
- Count subtitle: shows filtered count (e.g. "3 of 7 projects") when any filter is active, otherwise plain count.

### `lib/projects/repository.ts` — `listProjects()` (modified)

```ts
export type ProjectFilters = {
  status?: string   // undefined = all
  search?: string   // undefined = no search; regex on name + location
}

export async function listProjects(filters?: ProjectFilters): Promise<Project[]>
```

- If `status` is set (and not `"all"`), add `{ status }` to the MongoDB query.
- If `search` is set, add `{ $or: [{ name: regex }, { location: regex }] }` with case-insensitive regex.
- Sort remains `{ createdAt: -1 }`.

## Data Flow

```
User types in search / clicks status chip
  → ProjectFilters updates URL params via router.replace()
  → Next.js re-renders ProjectsPage (server)
  → listProjects({ status, search }) queries MongoDB
  → Filtered project cards rendered
```

## Error Handling

- Invalid `status` param values are ignored (no match → empty list is acceptable; repository only passes through known values).
- Search with < 2 chars removes the param (no partial noise).

## Files Changed

| File | Action |
|------|--------|
| `app/(authed)/projects/project-filters.tsx` | Create |
| `app/(authed)/projects/page.tsx` | Modify |
| `lib/projects/repository.ts` | Modify `listProjects` signature |
