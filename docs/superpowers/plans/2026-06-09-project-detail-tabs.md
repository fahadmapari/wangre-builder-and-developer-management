# Project Detail Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the apartments-overview, Capital, and Joint Venture sections off the pinned top area of the project detail page and into their own tabs, so the active tab gets the full remaining height.

**Architecture:** Purely presentational. The client `ProjectTabs` wrapper gains three new tab slots (Summary, Capital, Joint Venture) plus an `isJointVenture` flag; the server `page.tsx` stops rendering those sections inline and instead passes them in as `ReactNode` props. No data-fetching, repository, schema, or test-data changes. The now-unused `CollapsibleSection` component is deleted.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, Radix UI tabs (`@/components/ui/tabs`), Tailwind CSS v4, TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-09-project-detail-tabs-design.md`

**Testing note:** This repo has no automated test framework (no `test` script; no jest/vitest/playwright). The verification gate for every task is `npm run typecheck` then `npm run lint`, with `npm run build` and a manual `npm run dev` check at the end. There are no unit tests to write.

---

## File Structure

- **Modify** `app/(authed)/projects/[id]/project-tabs.tsx` — extend `TabValue`, `pickTab`, and props; render the new Summary/Capital/Joint Venture triggers and content with correct gating and order.
- **Modify** `app/(authed)/projects/[id]/page.tsx` — drop the inline overview/Capital/JV markup from the pinned area, build three `ReactNode`s, and pass them (plus `isJointVenture`) into `<ProjectTabs>`. Remove the `CollapsibleSection` import.
- **Delete** `app/(authed)/projects/[id]/collapsible-section.tsx` — no remaining importers after the page change.

Tasks 1 (the two file edits) are committed together because the new required `isJointVenture` prop makes them a single coupled change; an intermediate state with only one file edited would not type-check.

---

## Task 1: Rework ProjectTabs and rewire the page

**Files:**
- Modify: `app/(authed)/projects/[id]/project-tabs.tsx` (full rewrite)
- Modify: `app/(authed)/projects/[id]/page.tsx:34` (remove import), `:283-465` (return block + new node consts)

- [ ] **Step 1: Rewrite `project-tabs.tsx`**

Replace the entire contents of `app/(authed)/projects/[id]/project-tabs.tsx` with:

```tsx
"use client"

import type { ReactNode } from "react"
import { useSearchParams } from "next/navigation"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import type { Role } from "@/types"

type TabValue =
  | "summary"
  | "capital"
  | "jv"
  | "inventory"
  | "materials"
  | "financials"

function pickTab(
  raw: string | null,
  role: Role,
  isJointVenture: boolean
): TabValue {
  const isAdmin = role === "admin"
  if (raw === "capital" && isAdmin) return "capital"
  if (raw === "jv" && isAdmin && isJointVenture) return "jv"
  if (raw === "inventory") return "inventory"
  if (raw === "materials") return "materials"
  if (raw === "financials" && isAdmin) return "financials"
  return "summary"
}

export function ProjectTabs({
  role,
  isJointVenture,
  summary,
  capital,
  jointVenture,
  inventory,
  materials,
  financials,
}: {
  role: Role
  isJointVenture: boolean
  summary?: ReactNode
  capital?: ReactNode
  jointVenture?: ReactNode
  inventory?: ReactNode
  materials?: ReactNode
  financials?: ReactNode
}) {
  const sp = useSearchParams()
  const isAdmin = role === "admin"
  const showJV = isAdmin && isJointVenture
  const defaultTab = pickTab(sp.get("tab"), role, isJointVenture)
  return (
    <Tabs defaultValue={defaultTab} className="h-full">
      <TabsList>
        <TabsTrigger value="summary">Summary</TabsTrigger>
        {isAdmin ? <TabsTrigger value="capital">Capital</TabsTrigger> : null}
        {showJV ? (
          <TabsTrigger value="jv">Joint Venture</TabsTrigger>
        ) : null}
        <TabsTrigger value="inventory">Inventory</TabsTrigger>
        <TabsTrigger value="materials">Materials</TabsTrigger>
        {isAdmin ? (
          <TabsTrigger value="financials">Financials</TabsTrigger>
        ) : null}
      </TabsList>
      <TabsContent value="summary" className="min-h-0 overflow-auto">
        {summary}
      </TabsContent>
      {isAdmin ? (
        <TabsContent value="capital" className="min-h-0 overflow-auto">
          {capital}
        </TabsContent>
      ) : null}
      {showJV ? (
        <TabsContent value="jv" className="min-h-0 overflow-auto">
          {jointVenture}
        </TabsContent>
      ) : null}
      <TabsContent value="inventory" className="min-h-0 overflow-hidden">
        {inventory ?? (
          <Placeholder>Inventory listing coming in Phase 3.</Placeholder>
        )}
      </TabsContent>
      <TabsContent value="materials" className="min-h-0 overflow-hidden">
        {materials ?? (
          <Placeholder>Materials tracking coming in Phase 4.</Placeholder>
        )}
      </TabsContent>
      {isAdmin ? (
        <TabsContent value="financials" className="min-h-0 overflow-hidden">
          {financials ?? (
            <Placeholder>Financial ledger coming in Phase 5.</Placeholder>
          )}
        </TabsContent>
      ) : null}
    </Tabs>
  )
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
      {children}
    </Card>
  )
}
```

- [ ] **Step 2: Remove the `CollapsibleSection` import from `page.tsx`**

Delete this line (currently line 34):

```tsx
import { CollapsibleSection } from "./collapsible-section"
```

- [ ] **Step 3: Add the three tab-content node consts in `page.tsx`**

In `app/(authed)/projects/[id]/page.tsx`, immediately **before** the `return (` statement (after the `catalogForPicker` const, ~line 281), insert:

```tsx
  const summaryTab = (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <Tile label="Total apartments" value={String(project.totalUnits)} />
      <Tile label="Total parkings" value={String(project.totalParkings)} />
      <Tile label="Sold" value={`${soldCount} / ${totalUnitsAndParkings}`} />
      <Tile label="Revenue" value={`₹${INR.format(revenue)}`} />
      <Tile label="Created" value={project.createdAt.toLocaleDateString()} />
    </div>
  )

  const capitalTab = isAdmin ? (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <AddCapitalDialog projectId={id} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          label="Total capital"
          value={`₹${INR.format(funds.totalCapital)}`}
        />
        <Tile label="Revenue" value={`₹${INR.format(funds.totalRevenue)}`} />
        <Tile
          label="Total spent"
          value={`₹${INR.format(funds.totalSpent)}`}
        />
        <Tile
          label="Available funds"
          value={`₹${INR.format(Math.abs(funds.availableFunds))}${funds.availableFunds < 0 ? " (deficit)" : ""}`}
          negative={funds.availableFunds < 0}
        />
      </div>
      {capitalInjections.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border">
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b bg-muted">
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 text-left font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {capitalInjections.map((inj) => (
                  <tr
                    key={inj._id.toHexString()}
                    className="border-b last:border-0"
                  >
                    <td className="px-3 py-2 text-muted-foreground">
                      {inj.occurredAt.toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      ₹{INR.format(inj.amount)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {inj.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  ) : undefined

  const jointVentureTab =
    isAdmin && project.isJointVenture ? (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile
          label="JV units"
          value={`${jvStats.soldJVUnits} sold / ${jvStats.totalJVUnits} total`}
        />
        <Tile
          label="JV revenue (excl. from P&L)"
          value={`₹${INR.format(jvStats.jvRevenue)}`}
        />
      </div>
    ) : undefined
```

- [ ] **Step 4: Replace the `return ( ... )` JSX block in `page.tsx`**

Replace the entire current `return (` block (from `return (` on ~line 283 through its matching closing `)` on ~line 465) with:

```tsx
  return (
    <div className="mx-auto flex h-[calc(100svh-3.5rem)] w-full max-w-6xl flex-col overflow-hidden px-6">
      <div className="shrink-0 pb-4 pt-10">
        <header className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {project.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                {project.location}
              </p>
              {updaterName && project.lastUpdatedAt && (
                <LastUpdatedLine
                  actorName={updaterName}
                  at={project.lastUpdatedAt}
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {STATUS_LABEL[project.status] ?? project.status}
              </Badge>
              {isAdmin && (
                <div className="flex gap-2">
                  <EditProjectDialog
                    projectId={project._id.toHexString()}
                    current={{
                      name: project.name,
                      location: project.location,
                      status: project.status,
                      notes: project.notes,
                      isJointVenture: project.isJointVenture ?? false,
                    }}
                  />
                  <ExpandCapacityDialog
                    projectId={project._id.toHexString()}
                    current={{
                      totalUnits: project.totalUnits,
                      totalParkings: project.totalParkings,
                      startingUnitNumber: project.startingUnitNumber,
                      unitsPerFloor: project.unitsPerFloor,
                      parkingPrefix: project.parkingPrefix,
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </header>
      </div>
      <div className="flex min-h-0 flex-1 flex-col pb-8">
        <ProjectTabs
          role={user.role}
          isJointVenture={project.isJointVenture ?? false}
          summary={summaryTab}
          capital={capitalTab}
          jointVenture={jointVentureTab}
          inventory={
            <div className="flex h-full flex-col gap-2">
              <InventoryFilters />
              <InventoryTable
                projectId={id}
                role={user.role}
                searchParams={sp}
                page={parsePage(sp.unitsPage)}
                pageSize={UNITS_PAGE_SIZE}
                currentSearchParams={sp}
                isJointVentureProject={project.isJointVenture ?? false}
              />
            </div>
          }
          materials={
            <MaterialsTable
              projectId={id}
              role={user.role}
              rows={materialRows}
              catalog={catalogForPicker}
              projects={projectsForPicker}
            />
          }
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
        />
      </div>
    </div>
  )
```

> Note: the `Tile` function declaration at the bottom of the file is unchanged and is referenced by the new node consts via hoisting. The `AddCapitalDialog`, `EditProjectDialog`, `ExpandCapacityDialog`, `Badge`, and `LastUpdatedLine` imports are all still used and stay.

- [ ] **Step 5: Type-check**

Run: `npm run typecheck`
Expected: PASS (no errors). Common failure if missed: "Property 'isJointVenture' is missing" means Step 4's `<ProjectTabs>` props weren't updated; "CollapsibleSection refers to..." means the Step 2 import removal or Step 4 JSX replacement is incomplete.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: PASS, no new warnings. Watch for unused-import errors — every import in `page.tsx` should still be referenced.

- [ ] **Step 7: Commit**

```bash
git add app/(authed)/projects/[id]/project-tabs.tsx app/(authed)/projects/[id]/page.tsx
git commit -m "refactor(projects): move overview/capital/JV sections into tabs"
```

---

## Task 2: Delete the unused CollapsibleSection component

**Files:**
- Delete: `app/(authed)/projects/[id]/collapsible-section.tsx`

- [ ] **Step 1: Confirm there are no remaining importers**

Run: `npx eslint app/\(authed\)/projects/\[id\]/ --rule '{}'` is not needed — instead grep:
Search the repo for `collapsible-section` / `CollapsibleSection` in `.ts`/`.tsx` files. Expected: only the file itself matches (the `page.tsx` import was removed in Task 1).

- [ ] **Step 2: Delete the file**

```bash
git rm app/(authed)/projects/[id]/collapsible-section.tsx
```

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(projects): remove unused CollapsibleSection"
```

---

## Task 3: Build and manual verification

**Files:** none (verification only)

- [ ] **Step 1: Production build**

Run: `npm run build`
Expected: build completes with no type or compile errors.

- [ ] **Step 2: Start the dev server**

Run: `npm run dev`
Then open a project detail page: `http://localhost:3000/projects/<id>`.

- [ ] **Step 3: Manual checks**

As an **admin** on a **Joint Venture** project, confirm:
  - The pinned area shows only the header (name, location, status badge, Edit/Expand). It is short — the tab content fills the rest of the viewport height.
  - Tab bar order: **Summary · Capital · Joint Venture · Inventory · Materials · Financials**.
  - The page lands on **Summary**, which shows the 5 apartment tiles.
  - **Capital** shows the Add-capital button, the 4 tiles, and (if any) the injections table, which scrolls within the tab.
  - **Joint Venture** shows the 2 JV tiles.
  - Inventory / Materials / Financials still work and now get full height.

As an **admin** on a **non-JV** project: the **Joint Venture** tab is absent; all else as above.

As a **non-admin**: tab bar is **Summary · Inventory · Materials** only (no Capital, JV, or Financials); lands on Summary.

Deep links: `/projects/<id>?tab=financials` (admin) opens Financials; for a non-admin it falls back to Summary. The "View financials" links on the global `/financials` per-project table still land on the Financials tab.

- [ ] **Step 4: Stop the dev server** (Ctrl+C).

---

## Self-Review

**Spec coverage:**
- Separate Summary/Capital/JV tabs — Task 1 Step 1 & 3. ✓
- Tab order Summary·Capital·JV·Inventory·Materials·Financials — Task 1 Step 1 (`TabsList`). ✓
- Default = Summary — `pickTab` returns `"summary"` fallback. ✓
- Visibility (Capital admin; JV admin+JV; Summary all; Financials admin) — `isAdmin`/`showJV` gating in Step 1 + `isAdmin`-guarded node consts in Step 3. ✓
- Pinned area reduced to header — Task 1 Step 4. ✓
- Scroll wrappers (`overflow-auto` for new tabs, `overflow-hidden` for existing) — Step 1. ✓
- Deep links preserved + new values — `pickTab` honors `?tab=`. ✓
- Delete `CollapsibleSection` — Task 2. ✓
- No data-layer changes — confirmed; `Promise.all` untouched. ✓

**Placeholder scan:** none — all steps contain complete code/commands.

**Type consistency:** `pickTab(raw, role, isJointVenture)` signature matches its call site; `ProjectTabs` prop names (`summary`, `capital`, `jointVenture`, `inventory`, `materials`, `financials`, `isJointVenture`) match the values passed from `page.tsx` (`summaryTab`, `capitalTab`, `jointVentureTab`). The `jv` tab value is used consistently in `TabValue`, `pickTab`, `TabsTrigger`, and `TabsContent`.
