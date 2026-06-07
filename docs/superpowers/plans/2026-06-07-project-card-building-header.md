# Project Card Building Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-width colored banner with a large centered building icon to the top of each project card, varying by apartment count tier.

**Architecture:** A pure `getBuildingTier` helper function maps `totalUnits` to an icon component + Tailwind background classes. The card gains `overflow-hidden` and a new header `<div>` prepended before the existing body content. Body content moves into an inner padding div.

**Tech Stack:** Next.js (RSC), Tailwind CSS, lucide-react, shadcn/ui Card

> **Note:** This project has no test runner configured. The `getBuildingTier` function is pure and trivially verifiable by manual inspection; no test step is included.

---

### Task 1: Add imports and `getBuildingTier` helper

**Files:**
- Modify: `app/(authed)/projects/page.tsx:1-8`

- [ ] **Step 1: Add lucide-react icon imports and `cn` utility**

Replace the current import block at the top of `app/(authed)/projects/page.tsx`:

```tsx
import { Suspense } from "react"
import Link from "next/link"
import { Home, Building2, Building, Hotel, Landmark } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { requireAuth } from "@/lib/auth/session"
import { listProjects } from "@/lib/projects/repository"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { NewProjectButton } from "./new-project-dialog"
import { ProjectFilters } from "./project-filters"
```

- [ ] **Step 2: Add `getBuildingTier` helper after the `STATUS_LABEL` constant**

Add this function directly after the `STATUS_LABEL` object (after line 15):

```ts
function getBuildingTier(units: number): { Icon: LucideIcon; bg: string } {
  if (units <= 12)  return { Icon: Home,      bg: "bg-amber-400 dark:bg-amber-700" }
  if (units <= 30)  return { Icon: Building2, bg: "bg-emerald-500 dark:bg-emerald-700" }
  if (units <= 80)  return { Icon: Building,  bg: "bg-sky-500 dark:bg-sky-700" }
  if (units <= 200) return { Icon: Hotel,     bg: "bg-indigo-500 dark:bg-indigo-700" }
  return                    { Icon: Landmark, bg: "bg-slate-600 dark:bg-slate-700" }
}
```

- [ ] **Step 3: Verify TypeScript compiles with no errors**

Run:
```bash
npx tsc --noEmit
```
Expected: no output (exit 0). If there are errors, fix them before continuing.

- [ ] **Step 4: Commit**

```bash
git add app/(authed)/projects/page.tsx
git commit -m "feat(projects): add getBuildingTier helper for card header"
```

---

### Task 2: Update card JSX to include the building header

**Files:**
- Modify: `app/(authed)/projects/page.tsx:68-100`

- [ ] **Step 1: Replace the card JSX**

Find and replace the entire `<Card ...>` block inside the `projects.map` (currently lines 68–100). Replace it with:

```tsx
<Card className="flex h-full flex-col overflow-hidden transition hover:border-foreground/30">
  {(() => {
    const { Icon, bg } = getBuildingTier(p.totalUnits)
    return (
      <div className={cn("flex h-24 items-center justify-center", bg)}>
        <Icon className="h-12 w-12 text-white" />
      </div>
    )
  })()}
  <div className="flex flex-col gap-3 p-5">
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
        <span className="font-mono text-foreground">{p.totalUnits}</span>{" "}
        apartments
      </span>
      <span>
        <span className="font-mono text-foreground">{p.totalParkings}</span>{" "}
        parkings
      </span>
    </div>
    <p className="text-xs text-muted-foreground">
      Created {p.createdAt.toLocaleDateString()}
    </p>
  </div>
</Card>
```

Key changes vs the original:
- `<Card>` loses `gap-3 p-5` (those move to inner div), gains `overflow-hidden`
- New header `<div>` is first child — uses `getBuildingTier` result for bg class and icon
- All existing body content wrapped in `<div className="flex flex-col gap-3 p-5">`

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no output (exit 0).

- [ ] **Step 3: Start the dev server and visually verify cards**

```bash
npm run dev
```

Open `http://localhost:3000/projects` in a browser. Verify:
- Each card shows a colored banner at the top with a large centered icon
- Cards with different `totalUnits` values show different icon + color combinations
- Card body (name, badges, location, stats, date) is unchanged and correctly padded
- Hover effect still works (border highlight on hover)
- Dark mode (if toggled) shows the darker banner variants

- [ ] **Step 4: Commit**

```bash
git add app/(authed)/projects/page.tsx
git commit -m "feat(projects): add building tier header banner to project cards"
```
