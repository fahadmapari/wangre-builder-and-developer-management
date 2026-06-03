# Project Capital Ledger — Design Spec

**Date:** 2026-06-03
**Status:** Approved

## Overview

Add capital tracking to projects: an optional initial capital field at project creation, a ledger of subsequent capital injections, and a computed available-funds summary on the project detail page. Purchase spending is already captured in `transactions` and requires no changes.

---

## Data Model

### New collection: `capitalInjections`

```ts
{
  _id:        ObjectId
  projectId:  ObjectId   // ref: projects
  amount:     number     // positive integer, whole rupees (INR)
  notes?:     string     // optional, max 500 chars
  occurredAt: Date
  createdBy:  ObjectId
  createdAt:  Date
}
```

No new fields on `projects` or `transactions`. Available funds is always **computed on demand**:

```
availableFunds =
  SUM(capitalInjections.amount WHERE projectId = X)
  − SUM(transactions.amount WHERE projectId = X AND kind = "expense" AND voided != true)
```

Voided purchases are automatically excluded because they are already flagged `voided: true` in `transactions`.

---

## Section 1 — Project Creation Change

- Add an optional **Initial Capital** field to the create-project form (Basic section, after Notes).
- Accepts a positive whole rupee amount. Leaving it blank is valid — project is created with no capital record.
- Validation: optional, min ₹1, max ₹9,99,99,99,999, no decimals.
- When provided, a `capitalInjection` record is inserted **inside the existing MongoDB transaction** that creates the project and units (`createProjectWithUnits` in `lib/projects/repository.ts`). `occurredAt` is set to server time (not user-controlled at creation).
- Zod schema change: add `initialCapital?: number` to `CreateProjectInputSchema` in `lib/projects/schemas.ts`.

---

## Section 2 — Add Funds Flow

- New **"Add Funds"** button on the project detail page (admin-only).
- Opens a dialog with three fields:
  - **Amount** (required, positive whole rupees)
  - **Date** (required, defaults to today)
  - **Notes** (optional, max 500 chars — e.g., "Second tranche")
- Submits via a new server action `addCapital(projectId, input)` in `app/(authed)/projects/[id]/actions.ts`.
- Repository function `addCapitalInjection` in `lib/projects/repository.ts` inserts into `capitalInjections`.
- New Zod schema `AddCapitalInputSchema` in `lib/projects/schemas.ts`:
  - `projectId`: ObjectId string
  - `amount`: positive integer
  - `notes`: optional string, max 500 chars
  - `occurredAt`: date

### Capital Ledger Table

Displayed below the Add Funds button on the project detail page. Columns:

| Date | Amount | Notes |
|------|--------|-------|
| Reverse-chronological order | Formatted as ₹ with Indian comma notation | — if empty |

---

## Section 3 — Available Funds Display

A summary strip on the project detail page shows:

| Label | Value | Notes |
|-------|-------|-------|
| Total Capital | SUM of all injections | |
| Total Spent | SUM of non-voided expense transactions | |
| Available Funds | Total Capital − Total Spent | Red text if negative |

- Computed by a new repository function `getProjectFunds(projectId): { totalCapital, totalSpent, availableFunds }`.
- Uses two `$group` aggregations (one on `capitalInjections`, one on `transactions`).
- Loaded alongside existing project detail data (same page fetch).
- Project list cards do **not** show available funds.

---

## Files to Create / Modify

| File | Change |
|------|--------|
| `lib/projects/schemas.ts` | Add `initialCapital?` to `CreateProjectInputSchema`; add `AddCapitalInputSchema` |
| `lib/projects/repository.ts` | Extend `createProjectWithUnits` to insert initial injection; add `addCapitalInjection`; add `getProjectFunds` |
| `app/(authed)/projects/actions.ts` | Add `addCapital` server action |
| `app/(authed)/projects/new-project-dialog.tsx` | Add Initial Capital field to Basic section |
| `app/(authed)/projects/[id]/page.tsx` | Fetch funds data; render summary strip + ledger |
| `app/(authed)/projects/[id]/add-capital-dialog.tsx` | New dialog component |
| `lib/projects/schemas.ts` | Export `CapitalInjection` type (alongside existing types) |

---

## Out of Scope

- Capital tracking on project list cards.
- Budget forecasting or per-category spend breakdown.
- Currency support other than INR.
- Editing or deleting capital injection records.
