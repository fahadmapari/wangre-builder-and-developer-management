# Joint Venture Project & Units — Design Spec

**Date:** 2026-06-04
**Status:** Approved

---

## Overview

Add Joint Venture (JV) support to the developer management back-office tool. A project can be flagged as a JV project, and individual apartments within it can be flagged as JV units. JV unit sales are excluded from the project's P&L (revenue belongs entirely to the JV partner). JV units remain fully trackable in the inventory (they can still be marked as sold with buyer and price recorded).

---

## Data Model

### `Project` — new field

```ts
isJointVenture?: boolean   // defaults to false/undefined (falsy)
```

Added to: `lib/projects/schemas.ts` `Project` type and Zod `CreateProjectSchema` + `UpdateProjectSchema`.

### `Unit` — new field

```ts
isJointVentureUnit?: boolean   // defaults to false/undefined (falsy)
```

Only meaningful when `type === "apartment"` and the parent project has `isJointVenture: true`. Ignored on parking units. Added to: `lib/projects/schemas.ts` `Unit` type and Zod `EditUnitSchema`.

No MongoDB migration needed — existing documents without the field are treated as falsy.

---

## Financial Logic

### Current formula
`getProjectFunds` = capital injections + gross income (transactions) − expenses (transactions)

### New formula
`getProjectFunds` = capital injections + gross income − **JV income** − expenses

**JV income** is computed by querying the `units` collection directly (no transaction schema changes):
```
SUM(soldPriceTotal) WHERE projectId = X AND isJointVentureUnit = true AND status = "sold"
```

This subtraction happens inside `getProjectFunds` in `lib/projects/repository.ts`.

### New function: `getProjectJVStats(projectId)`

Returns:
```ts
{
  totalJVUnits: number      // apartments with isJointVentureUnit: true
  soldJVUnits: number       // subset that are sold
  jvRevenue: number         // sum of soldPriceTotal for sold JV units
}
```

Used both by `getProjectFunds` (for the exclusion) and by the project detail page (for the summary card).

---

## UI Changes

### 1. New Project Dialog (`app/(authed)/projects/new-project-dialog.tsx`)

- Add `isJointVenture` checkbox below the Status field.
- Label: **"Is Joint Venture?"**
- Helper text: "JV unit sales will be excluded from project financials."

### 2. Edit Project Dialog (`app/(authed)/projects/[id]/edit-project-dialog.tsx`)

- Add `isJointVenture` toggle as a prominent field — same visual weight as Name / Location / Status.
- Not buried in advanced options.

### 3. Edit Unit Dialog (`app/(authed)/projects/[id]/inventory/edit-unit-dialog.tsx`)

- The dialog receives a new `isJointVentureProject: boolean` prop (passed down from the server component that already has the project).
- If `isJointVentureProject === true` AND `unit.type === "apartment"`: show checkbox **"Mark as Joint Venture Unit"**.
- Hidden entirely for non-JV projects and for parking units.

### 4. Inventory Table (`app/(authed)/projects/[id]/inventory/unit-row.tsx`)

- JV units show a small **"JV"** badge next to the unit number.
- Badge style: distinct color (indigo/purple) to differentiate from the green/red Available/Sold status badge.

### 5. Project Detail Page (`app/(authed)/projects/[id]/page.tsx`)

- If `project.isJointVenture === true`, render a JV summary card below the existing financials section.
- Shows:
  - **JV Units:** `{soldJVUnits} sold / {totalJVUnits} total`
  - **JV Revenue (excluded from P&L):** `₹{jvRevenue}`

---

## Files to Create or Modify

| File | Change |
|------|--------|
| `lib/projects/schemas.ts` | Add `isJointVenture` to `Project`, `isJointVentureUnit` to `Unit`, update Zod schemas |
| `lib/projects/repository.ts` | Update `getProjectFunds` to subtract JV income; add `getProjectJVStats` |
| `app/(authed)/projects/actions.ts` | Pass `isJointVenture` through `createProject` and `updateProject` |
| `app/(authed)/projects/new-project-dialog.tsx` | Add `isJointVenture` checkbox |
| `app/(authed)/projects/[id]/edit-project-dialog.tsx` | Add `isJointVenture` toggle |
| `app/(authed)/projects/[id]/page.tsx` | Pass `isJointVenture` prop to edit-unit dialog; render JV summary card |
| `app/(authed)/projects/[id]/inventory/actions.ts` | Pass `isJointVentureUnit` through `editUnit` |
| `app/(authed)/projects/[id]/inventory/edit-unit-dialog.tsx` | Add `isJointVentureProject` prop and conditional JV unit checkbox |
| `app/(authed)/projects/[id]/inventory/unit-row.tsx` | Add "JV" badge for JV units |

---

## Constraints & Edge Cases

- Toggling `isJointVenture` off on a project does not automatically clear `isJointVentureUnit` on existing units — the flag is preserved but has no financial effect while the project is non-JV.
- Parking units cannot be flagged as JV units (checkbox not shown for them).
- `getProjectFunds` P&L exclusion is based on `soldPriceTotal` on the unit record, consistent with how income transactions are created in `markUnitSoldRepo`.
