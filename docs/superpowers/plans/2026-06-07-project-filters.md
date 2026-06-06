# Project List Filters — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a search box (matches project name or location) and status chip filters to the `/projects` list page.

**Architecture:** URL search params drive server-side MongoDB filtering — the same pattern used by `LedgerFilters` and `InventoryFilters`. A new `"use client"` component `ProjectFilters` manages the URL; `page.tsx` reads `searchParams` and passes them to `listProjects()`.

**Tech Stack:** Next.js 16 App Router (async server components, `searchParams` is a `Promise`), MongoDB regex + `$or` queries, React `useSearchParams` / `router.replace`, shadcn `Button` + `Input`.

---

## File Map

| File | Action |
|------|--------|
| `lib/projects/repository.ts` | Modify — add optional `ProjectListFilters` param to `listProjects` |
| `app/(authed)/projects/project-filters.tsx` | Create — client component with search + status chips |
| `app/(authed)/projects/page.tsx` | Modify — read `searchParams`, pass filters, show filter-aware count |

---

### Task 1: Add filter support to `listProjects()`

**Files:**
- Modify: `lib/projects/repository.ts` (function `listProjects` at line 25)

- [ ] **Step 1: Add `ProjectListFilters` type and update `listProjects` signature**

Open `lib/projects/repository.ts`. Replace the existing `listProjects` function (lines 25–32) with:

```typescript
export type ProjectListFilters = {
  status?: string   // undefined or "all" → no filter
  search?: string   // undefined or <2 chars → no filter; regex on name + location
}

export async function listProjects(filters?: ProjectListFilters): Promise<Project[]> {
  const db = getDb()
  const query: Record<string, unknown> = {}

  if (filters?.status && filters.status !== "all") {
    query.status = filters.status
  }

  const trimmed = filters?.search?.trim() ?? ""
  if (trimmed.length >= 2) {
    const regex = { $regex: trimmed, $options: "i" }
    query.$or = [{ name: regex }, { location: regex }]
  }

  return db
    .collection<Project>("projects")
    .find(query)
    .sort({ createdAt: -1 })
    .toArray()
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```
npx tsc --noEmit
```
Expected: no errors related to `listProjects`.

- [ ] **Step 3: Commit**

```
git add lib/projects/repository.ts
git commit -m "feat(projects): add optional status+search filters to listProjects"
```

---

### Task 2: Create the `ProjectFilters` client component

**Files:**
- Create: `app/(authed)/projects/project-filters.tsx`

- [ ] **Step 1: Create the file**

Create `app/(authed)/projects/project-filters.tsx` with this exact content:

```tsx
"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "planning", label: "Planning" },
  { value: "under_construction", label: "Under construction" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On hold" },
] as const

export function ProjectFilters() {
  const router = useRouter()
  const sp = useSearchParams()
  const [, startTransition] = useTransition()

  const status = sp.get("status") ?? "all"
  const initialSearch = sp.get("search") ?? ""
  const [searchValue, setSearchValue] = useState(initialSearch)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  function applySearch(next: string) {
    const trimmed = next.trim()
    const params = new URLSearchParams(sp.toString())
    if (trimmed.length >= 2) params.set("search", trimmed)
    else params.delete("search")
    startTransition(() => {
      router.replace(`?${params.toString()}`, { scroll: false })
    })
  }

  function onSearchChange(next: string) {
    setSearchValue(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => applySearch(next), 350)
  }

  function flushSearch() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    applySearch(searchValue)
  }

  function clearSearch() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSearchValue("")
    applySearch("")
  }

  function setStatus(value: string) {
    const params = new URLSearchParams(sp.toString())
    if (value === "all") params.delete("status")
    else params.set("status", value)
    startTransition(() => {
      router.replace(`?${params.toString()}`, { scroll: false })
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex w-full sm:w-72">
        <Input
          type="search"
          placeholder="Search by name or location…"
          value={searchValue}
          maxLength={200}
          className="[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              flushSearch()
            }
          }}
        />
        {searchValue.length > 0 ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={clearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          Status
        </span>
        <div className="flex flex-wrap gap-1">
          {STATUS_OPTIONS.map((o) => (
            <Button
              key={o.value}
              size="sm"
              variant={status === o.value ? "default" : "outline"}
              onClick={() => setStatus(o.value)}
              type="button"
            >
              {o.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```
npx tsc --noEmit
```
Expected: no errors in `project-filters.tsx`.

- [ ] **Step 3: Commit**

```
git add app/(authed)/projects/project-filters.tsx
git commit -m "feat(projects): add ProjectFilters client component (search + status chips)"
```

---

### Task 3: Wire filters into the projects page

**Files:**
- Modify: `app/(authed)/projects/page.tsx`

- [ ] **Step 1: Replace `page.tsx` content**

Replace the entire file with:

```tsx
import { Suspense } from "react"
import Link from "next/link"
import { requireAuth } from "@/lib/auth/session"
import { listProjects } from "@/lib/projects/repository"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { NewProjectButton } from "./new-project-dialog"
import { ProjectFilters } from "./project-filters"

const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  under_construction: "Under construction",
  completed: "Completed",
  on_hold: "On hold",
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>
}) {
  const user = await requireAuth()
  const sp = await searchParams
  const projects = await listProjects({ status: sp.status, search: sp.search })

  const hasFilters =
    (sp.status && sp.status !== "all") ||
    ((sp.search?.trim().length ?? 0) >= 2)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {projects.length === 0
              ? hasFilters
                ? "No projects match your filters."
                : "No projects yet."
              : `${projects.length} project${projects.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {user.role === "admin" ? <NewProjectButton /> : null}
      </div>

      <Suspense>
        <ProjectFilters />
      </Suspense>

      {projects.length === 0 ? (
        <Card className="grid place-items-center gap-3 p-12 text-center">
          <p className="text-sm text-muted-foreground">
            {hasFilters ? "No projects match your filters." : "No projects yet."}
          </p>
          {user.role === "admin" && !hasFilters ? (
            <NewProjectButton variant="cta" />
          ) : null}
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <li key={String(p._id)}>
              <Link href={`/projects/${String(p._id)}`} className="block">
                <Card className="flex h-full flex-col gap-3 p-5 transition hover:border-foreground/30">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <h2 className="font-medium leading-tight">{p.name}</h2>
                      {p.isJointVenture && (
                        <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900 dark:text-indigo-300 text-[10px] px-1.5 py-0">
                          JV
                        </Badge>
                      )}
                    </div>
                    <Badge variant="secondary">
                      {STATUS_LABEL[p.status] ?? p.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{p.location}</p>
                  <div className="mt-auto flex items-baseline gap-4 text-xs text-muted-foreground">
                    <span>
                      <span className="font-mono text-foreground">
                        {p.totalUnits}
                      </span>{" "}
                      apartments
                    </span>
                    <span>
                      <span className="font-mono text-foreground">
                        {p.totalParkings}
                      </span>{" "}
                      parkings
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Created {p.createdAt.toLocaleDateString()}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

> **Note:** `ProjectFilters` uses `useSearchParams()` which requires a `<Suspense>` boundary in the parent server component — this is a Next.js requirement.

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 3: Smoke-test in the browser**

Run `npm run dev` and open `http://localhost:3000/projects`.

Verify:
- Search box appears above the project cards
- Status chips appear below the search box: All | Planning | Under construction | Completed | On hold
- Typing 2+ chars in the search box filters projects by name or location (cards update after ~350ms)
- Pressing ✕ clears the search and restores all projects
- Clicking a status chip filters to that status; clicking "All" restores all
- URL updates in the address bar for both controls
- Empty state says "No projects match your filters." when filters yield zero results

- [ ] **Step 4: Commit**

```
git add app/(authed)/projects/page.tsx
git commit -m "feat(projects): wire ProjectFilters into projects page with server-side filtering"
```
