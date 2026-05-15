# Phase 5 — Financials (design)

**Date:** 2026-05-15
**Status:** Approved (brainstorm). Implementation plan pending.
**Depends on:** Phases 1–4. All merged to local master (HEAD `1333057`).

## Goal

Light up the admin-only Financials tab on `/projects/[id]` with three filter-aware summary tiles (Revenue / Expenses / Net) and a full filtered ledger. Add a new admin-only top-level `/financials` route showing cross-project aggregates + per-project breakdown. Introduce **reversing entries** as the accounting-style correction mechanism for sale, purchase, and ad-hoc rows. Admin can also create ad-hoc income/expense entries directly from the tab.

Phase 5 is read-heavy: it surfaces Phase 3 sales and Phase 4 purchases that are already in the `transactions` collection. It writes only to `transactions` — never to `units`, `materials`, `projectMaterials`, or `materialMovements`.

## Non-goals (explicitly deferred)

- **Editing existing entries.** Append-only is absolute. Description typos require reversal + new entry.
- **CSV export** of the ledger or global view. Phase 7 polish.
- **Free-text search** on description / buyer / notes. Phase 7 polish.
- **Pagination / virtualization.** Phase 7 polish (if ledger volume warrants).
- **Drilldown sheet** (row click → detail panel). Phase 7 polish.
- **Atomic material-purchase correction.** Phase 5's Reverse on a purchase row writes only the financial reversal; it does NOT void the linked `materialMovements` row or decrement `projectMaterials.stockOnHand`. Real-world meaning: "the supplier credited us back ₹X," not "the purchase didn't happen." True material correction is a future cleanup phase.
- **Reversing a reversal row** or **voiding a reversal row.** Locked. A wrong reversal must be cleaned up manually via mongosh in Phase 5.
- **Reversing transfer rows** (`transfer_in` / `transfer_out`). Deferred to Phase 6, which needs to handle both sides of the pair atomically.
- **Audit trail beyond existing fields.** No revision history, no diff log.
- **Per-buyer reports** or sub-categorization beyond kind/category filters. Phase 7+.
- **Multi-currency.** INR hardcoded.
- **Email notifications** on void/reversal.
- **Approval workflow** for reversals. Single admin commits directly.

## Locked-in conventions reused

- Server-side role enforcement is the first executable line of every server action (`requireAdmin` throughout — entire Phase 5 surface is admin-only).
- Multi-document writes wrap in `client.startSession()` + `session.withTransaction()`. Phase 5's reversal is single-collection but uses `withTransaction` for the read-then-write atomicity (concurrent admins can't both reverse the same row).
- Append-only ledger. Rows never deleted.
- `createdBy: ObjectId` on every domain doc.
- Server actions return `ActionResult<T>` discriminated union.
- Currency hardcoded `"INR"`. Whole rupees on `transactions.amount`.
- Dialog state-reset key trick on every form dialog.
- Hybrid server/client tab pattern (Phase 3/4 precedent).

## Permission matrix

Entire Phase 5 surface is **admin only**.

| Action | admin | floor_manager |
|---|---|---|
| View Financials tab on `/projects/[id]` | yes | no (tab trigger already hidden) |
| Visit `/financials` top-level route | yes | no (redirect via `requireAdmin`) |
| Create ad-hoc income | yes | no |
| Create ad-hoc expense | yes | no |
| Void a transaction (adhoc only) | yes | no |
| Reverse a transaction (sale/purchase/adhoc) | yes | no |

No `unitPrice` / `amount` server-side stripping concerns — FMs never see this surface.

## Correction model — the two paths

Phase 3 locked in **soft-void**: setting `voided: true` on the original row, excluding from active aggregates. Phase 5 introduces a second correction path:

| Use case | Mechanism | Effect on aggregates | Effect on row |
|---|---|---|---|
| "I just clicked wrong" on an adhoc entry | **Soft-void** (`voided: true` on original) | Original excluded from active aggregates | Original strike-through when `voided=all` shown |
| "Three weeks ago we recorded wrong, need accounting correction" | **Reversing entry** (new row with `reversalOf: originalId`) | Both original and reversal stay in active aggregates; reversal subtracts in `computeTotals` | Original visible at its original date; reversal visible at today's date with reversal badge |

The two paths are **not interchangeable**. Soft-void rewrites history (the row vanishes from active sums); reversing entry preserves history (both rows visible, math nets to zero).

**Which rows can be soft-voided in Phase 5:**
- Ad-hoc rows only. Sale and purchase rows have their own paired-mutation flows for soft-void (sale via `unmarkUnitSold` from the Inventory tab; purchase has no Phase 4 soft-void — see Non-goals).

**Which rows can be reversed in Phase 5:**
- Sale rows (`category: "sale"`)
- Purchase rows (`category: "purchase"`)
- Ad-hoc rows (`category: "adhoc"`)
- Reversal rows are **immune** to reversal in Phase 5 (`reversalOf` set → no reverse).
- Voided rows are **immune** to reversal in Phase 5.
- Transfer rows are **immune** to reversal in Phase 5 (deferred to Phase 6).

## Data model

### `transactions` collection — schema additions

Two new fields. No migration required (both optional).

```ts
type Transaction = {
  _id: ObjectId
  projectId: ObjectId
  unitId: ObjectId | null
  kind: "income" | "expense"
  category: "sale" | "purchase" | "transfer_in" | "transfer_out" | "adhoc"
  amount: number              // whole INR, positive (reversals also positive)
  currency: "INR"
  description: string
  occurredAt: Date
  buyerName?: string
  notes?: string
  // Phase 3 soft-void (existing):
  voided?: boolean
  voidedAt?: Date
  voidedBy?: ObjectId
  // Phase 5 reversal linkage (NEW):
  reversalOf?: ObjectId       // FK to the original row this reverses
  createdBy: ObjectId
  createdAt: Date
}
```

**Conventions on reversal rows:**
- `reversalOf` is one-way (reversal → original). No back-pointer on the original.
- `amount` on the reversal row is the **same magnitude** as the original (positive integer rupees). The reversal nets via aggregation math, not via a sign flip on `amount`.
- `kind` on the reversal row **matches** the original (income → income, expense → expense). The reversal logically *subtracts* from its kind's running total.
- `category` on the reversal row **matches** the original. So filtering "category = sale" returns both the original sale and its reversal.
- `description` on the reversal row is auto-generated: `"Reversal of: ${original.description}"` (admin can append context via `notes`).
- `occurredAt` on the reversal row is **today** by default (user-overrideable in the confirm dialog if needed).
- `unitId` on the reversal row **matches** the original (preserves unit-linkage filtering).
- `buyerName` on the reversal row is **copied** from the original when present (preserves filtering by buyer in Phase 7's free-text search).

### New index

In `scripts/init-db.mjs`:

```js
await db.collection("transactions").createIndex(
  { reversalOf: 1 },
  { sparse: true }
)
```

Sparse keeps index tiny (only ~1% of rows are reversals expected). Used by display logic to show the "Reversal of X" badge and by Phase 5 invariant checks.

## Aggregation math

Both `computeTotals` (per-project) and `listCrossProjectTotals` (global) use the same kind-by-kind sum with reversal subtraction:

```
match: { projectId?, ...filters, voided: { $ne: true } unless includeVoided }
group by kind:
  total = sum( reversalOf == null ? amount : -amount )
=> revenue = group.income.total
=> expenses = group.expense.total
=> net = revenue - expenses
```

Reversals count negatively against their own kind. Net stays correct whether all reversals are kept or all are filtered out.

**Invariant** (mandatory T-final verification check):
- `revenue = sum(income, !voided, reversalOf null) − sum(income, !voided, reversalOf not null)` for the project + filter window.
- Symmetric for expenses.
- `net = revenue − expenses`.

When `voided=active` (default), voided rows are filtered out everywhere — ledger AND summary tiles. "What you see is what you sum" is the trust invariant.

## Pages, routes, components

### `/projects/[id]` Financials tab (existing route; new content)

Same hybrid pattern as Inventory (Phase 3) and Materials (Phase 4). Page fetches everything in `Promise.all` (admin only), passes a `financials` ReactNode prop into `<ProjectTabs>`.

**Modify:**
- `app/(authed)/projects/[id]/project-tabs.tsx` — add `financials?: ReactNode` prop. Admin gate already exists on `<TabsContent value="financials">`; the prop renders inside it (replacing the placeholder).
- `app/(authed)/projects/[id]/page.tsx` — for admin sessions, add `listLedger(projectObjectId, filters)` and `computeTotals(projectObjectId, filters)` to the existing `Promise.all`. Parse search params into `filters` first. Skip the fetches for FM (`role !== "admin"`) — they never see the tab.

**Create:**
- `app/(authed)/projects/[id]/financials/financials-view.tsx` (server) — composes 3 summary tiles + filter chips + ledger table.
- `app/(authed)/projects/[id]/financials/ledger-filters.tsx` (client) — URL-synced chips: date range (from/to `<Input type="date">`), kind chips (`income | expense | all`), category chips (`sale | purchase | adhoc | transfer_in | transfer_out | all`), voided toggle (`active | all`). Pattern mirrors `inventory-filters.tsx`.
- `app/(authed)/projects/[id]/financials/ledger-table.tsx` (server) — renders rows with the columns listed in the Ledger columns section below.
- `app/(authed)/projects/[id]/financials/row-actions-menu.tsx` (client) — DropdownMenu per row with Void / Reverse options, conditionally rendered.
- `app/(authed)/projects/[id]/financials/add-income-dialog.tsx` (client) — admin form, `kind: "income"` hardcoded, `category: "adhoc"`.
- `app/(authed)/projects/[id]/financials/add-expense-dialog.tsx` (client) — admin form, `kind: "expense"`, `category: "adhoc"`.
- `app/(authed)/projects/[id]/financials/reverse-confirm-dialog.tsx` (client) — AlertDialog with optional `occurredAt` date input + `notes` textarea. Calls `reverseTransaction`.
- `app/(authed)/projects/[id]/financials/void-confirm-dialog.tsx` (client) — AlertDialog. Calls `voidTransaction`.

### `/financials` admin route (new top-level)

**Create:**
- `app/(authed)/financials/page.tsx` (server) — `requireAdmin()` first line. Parses date range from search params (no kind/category filters in the global view). Calls `listCrossProjectTotals(filters)`. Renders 3 summary tiles + per-project breakdown table.
- `app/(authed)/financials/global-filters.tsx` (client) — date-range only.
- `app/(authed)/financials/per-project-table.tsx` (server) — table of `{ projectId, projectName, revenue, expenses, net }` rows. Each row links to that project's Financials tab.

### Navigation

**Modify:** `app/(authed)/layout.tsx` — add admin-only "Financials" link in the header nav, sibling to the existing admin-only "Catalog" link. FMs see neither.

### Ledger columns (per-project tab)

| Column | Source | Notes |
|---|---|---|
| Date | `occurredAt` | `toLocaleDateString()` |
| Kind | `kind` | Badge (income green / expense red); reversal rows ALSO show small "Reversal" sub-badge |
| Category | `category` | Badge |
| Amount | `amount` | Right-aligned `₹` formatted via `Intl.NumberFormat("en-IN")`. Reversal rows shown as `-₹X` in display only (DB stores positive). |
| Description | `description` | Already includes "Reversal of: ..." prefix for reversal rows |
| Buyer | `buyerName ?? ""` | Blank when not applicable |
| Linked entity | derived | For `category: "sale"`: looks up `unitId` → unit `number`; renders as compact label like "Apt 101" or "Parking P03". For other categories: blank. |
| Actions | row state | DropdownMenu with conditional buttons (see Row actions matrix) |

Voided rows: entire row rendered with `opacity-60 line-through`. Actions menu empty (no Void/Reverse on voided rows).

### Row actions matrix

| Row type | Void shown | Reverse shown |
|---|---|---|
| Adhoc, not voided, not a reversal | ✅ | ✅ |
| Sale, not voided, not a reversal | ❌ (use Inventory tab's Unmark) | ✅ |
| Purchase, not voided, not a reversal | ❌ (no Phase 4 soft-void exists) | ✅ |
| Transfer (any), not voided, not a reversal | ❌ | ❌ (Phase 6) |
| Any reversal row | ❌ | ❌ |
| Any voided row | ❌ | ❌ |

If no actions are shown the DropdownMenu trigger is hidden — no empty menu.

### URL search params

**Per-project tab:** `?from=YYYY-MM-DD&to=YYYY-MM-DD&kind=all|income|expense&category=all|sale|purchase|adhoc|transfer_in|transfer_out&voided=active|all`

**Defaults when omitted:**
- `from` = January 1 of the current year (server-side computed at request time; the server's local time zone — IST in practice — is fine because dates are date-only, not datetime).
- `to` = December 31 of the current year (same).
- `kind` = `all`
- `category` = `all`
- `voided` = `active`

**Global `/financials`:** `?from=YYYY-MM-DD&to=YYYY-MM-DD` only. Same defaults for from/to.

### shadcn primitive

Add `dropdown-menu` via `npx shadcn@latest add dropdown-menu` as an early task.

## Server actions

All in `app/(authed)/projects/[id]/financials/actions.ts`. All admin-only.

**`createAdhocIncome(input)`**
1. `requireAdmin()`
2. Zod-validate `{ projectId, amount (int, > 0), occurredAt, description, notes, buyerName? }`
3. `transactions.insertOne({ kind: "income", category: "adhoc", unitId: null, currency: "INR", ... })`
4. `revalidatePath` on `/projects/${projectId}` and `/financials`
5. Return `ActionResult<{ transactionId: string }>`

**`createAdhocExpense(input)`** — same as above with `kind: "expense"` and no `buyerName` field.

**`voidTransaction(input)`** — admin only soft-void.
1. `requireAdmin()`
2. Zod-validate `{ transactionId }`
3. Pre-read: confirm `category === "adhoc"` AND not already `voided` AND `reversalOf` is null.
4. Conditional `updateOne({ _id, voided: { $ne: true }, category: "adhoc", reversalOf: { $exists: false } }, { $set: { voided: true, voidedAt, voidedBy } })`. Race-safe.
5. `revalidatePath` on `/projects/${projectId}` and `/financials`

Sale rows: Phase 5 deliberately omits a Void action. Admin uses the Inventory tab's Unmark for the rare "wrong sale recorded" case. Purchase rows: Phase 4 didn't ship a void; Phase 5 doesn't add one (deferred — see Non-goals).

**`reverseTransaction(input)`** — admin only reversing entry.
1. `requireAdmin()`
2. Zod-validate `{ transactionId, occurredAt? (default: now), notes? }`
3. `client.startSession()` → `session.withTransaction(async () => { ... })`:
   - Re-read the original inside the transaction. If any precondition fails, throw `CannotReverseError(reason)` and let `withTransaction` abort:
     - Not found → `reason: "not-found"`
     - `voided === true` → `reason: "is-voided"`
     - `reversalOf` set → `reason: "is-reversal"`
     - `category` is `"transfer_in"` or `"transfer_out"` → `reason: "is-transfer"`
   - Insert reversal row: `{ projectId, unitId, kind, category, amount, currency: "INR", description: "Reversal of: ${original.description}", occurredAt, buyerName, notes: input.notes, reversalOf: original._id, createdBy, createdAt }`
4. The outer action catches `CannotReverseError` and returns the matching `ActionResult` error message (granular reason → friendly string).
5. `revalidatePath` on `/projects/${projectId}` and `/financials`
6. Return `ActionResult<{ reversalId: string }>`

### Errors

- `TransactionNotFoundError` — defense-in-depth
- `TransactionAlreadyVoidedError` — voiding an already-voided row
- `CannotReverseError(reason: "is-voided" | "is-reversal" | "is-transfer" | "not-found")` — granular reason so the action layer can surface a friendly message

## Repository helpers in `lib/transactions/repository.ts`

New exports alongside the existing `markUnitSold` / `unmarkUnitSold` / `sumProjectRevenue`:

**`listLedger(projectId, filters)`** — returns `Transaction[]`.

```ts
type LedgerFilters = {
  from: Date
  to: Date
  kind: "all" | "income" | "expense"
  category: "all" | "sale" | "purchase" | "adhoc" | "transfer_in" | "transfer_out"
  includeVoided: boolean
}
```

Mongo query:
```ts
{
  projectId,
  occurredAt: { $gte: from, $lte: to },
  ...(kind !== "all" ? { kind } : {}),
  ...(category !== "all" ? { category } : {}),
  ...(includeVoided ? {} : { voided: { $ne: true } }),
}
.sort({ occurredAt: -1, _id: -1 })
```

Index used: existing `{projectId: 1, occurredAt: -1}`.

**`computeTotals(projectId, filters)`** — returns `{ revenue, expenses, net }`. One aggregate; reversal subtraction inline:

```ts
{
  $match: { projectId, occurredAt: { $gte: from, $lte: to }, ...kindFilter, ...categoryFilter, ...(!includeVoided && { voided: { $ne: true } }) }
},
{
  $group: {
    _id: "$kind",
    total: {
      $sum: {
        $cond: [
          { $eq: ["$reversalOf", null] },
          "$amount",
          { $multiply: ["$amount", -1] }
        ]
      }
    }
  }
}
```

**`listCrossProjectTotals(filters)`** — for `/financials`. Aggregates across all projects, groups by `(projectId, kind)`, returns `{ overall: { revenue, expenses, net }, perProject: [{ projectId, projectName, revenue, expenses, net }] }`. Joins to `projects` to attach names.

**`voidTransaction(transactionId, userId)`** — single conditional `updateOne`. Throws `TransactionNotFoundError` on no-match.

**`reverseTransaction(transactionId, occurredAt, notes, userId)`** — `withTransaction`-wrapped read-then-insert. Returns the new reversal's `ObjectId`.

**`countActiveReversals(projectId)`** — used by the Section-4 invariant verification step. Optional helper.

## Atomic invariants and verification

For the Phase 5 manual T-final:

1. **`computeTotals` matches displayed ledger.** For a chosen filter window, sum of displayed `amount * (reversalOf ? -1 : 1)` per kind equals the value shown in the summary tile.
2. **Reversal idempotency under race.** Two admins click "Reverse" on the same row simultaneously. Both produce reversal rows (acceptable per the Phase 5 design — reversals are not unique-keyed). Document this as known: the second admin should see the new row appear after refresh and can void it (the reversal cannot itself be reversed). **Note for spec users:** the cleaner alternative would be to add a `lastReversedAt` field on the original to short-circuit double-reverse. Deferred unless this becomes a real problem.
3. **Soft-void smoke test.** Create an adhoc income, void it, confirm: `computeTotals` excludes it (default filter), ledger excludes it (default filter), toggling `voided=all` shows it with strike-through.
4. **Reversal smoke test.** Create an adhoc income of ₹10,000, reverse it. Confirm:
   - Two rows visible in the ledger
   - Both have `amount: 10000`
   - The reversal row has `reversalOf` set to the original's `_id`
   - Revenue tile shows ₹0 (10,000 − 10,000)
   - Filtering by `kind=income` shows both rows
5. **Sale-row Reverse end-to-end.** Make a sale (existing Phase 3 flow), then go to Financials tab and reverse it. Confirm: unit stays sold, ledger has both rows, revenue tile is ₹0 for that sale. (This is the "sale was correctly recorded but we owe the buyer a refund" path.)
6. **`/financials` cross-project view loads** for admin and shows per-project breakdown summing to the overall totals.
7. **FM redirect on `/financials`.** Floor manager visiting the route is redirected to `/`.
8. **`reverseTransaction` refuses** voided rows, reversal rows, and transfer rows (any future ones from Phase 6) with a clear error.

## Open seams for later phases

- **Phase 6 (Inter-project transfers).** `transfer_in` / `transfer_out` already in the enum. Phase 6 writes paired rows inside `withTransaction`. Phase 5's ledger filter handles them; Phase 5's reverse action explicitly refuses them.
- **Phase 7 (Polish).** CSV export of ledger and global view; free-text search; pagination; drilldown sheet; reversal-badge hyperlink jumping to the linked row; clickable "Reversal of #X" indicator.
- **Future material-purchase atomic correction.** A `reverseAndUnstock` action that voids the linked `materialMovements` row, decrements `projectMaterials.stockOnHand`, AND inserts the financial reversal — all in one `withTransaction`. Not Phase 5 scope.

## File map (Phase 5)

**Create:**
- `app/(authed)/projects/[id]/financials/financials-view.tsx`
- `app/(authed)/projects/[id]/financials/ledger-filters.tsx`
- `app/(authed)/projects/[id]/financials/ledger-table.tsx`
- `app/(authed)/projects/[id]/financials/row-actions-menu.tsx`
- `app/(authed)/projects/[id]/financials/add-income-dialog.tsx`
- `app/(authed)/projects/[id]/financials/add-expense-dialog.tsx`
- `app/(authed)/projects/[id]/financials/reverse-confirm-dialog.tsx`
- `app/(authed)/projects/[id]/financials/void-confirm-dialog.tsx`
- `app/(authed)/projects/[id]/financials/actions.ts`
- `app/(authed)/financials/page.tsx`
- `app/(authed)/financials/global-filters.tsx`
- `app/(authed)/financials/per-project-table.tsx`
- `components/ui/dropdown-menu.tsx` (via shadcn)

**Modify:**
- `lib/transactions/schemas.ts` — add `reversalOf?: ObjectId` field on `Transaction` type. New Zod schemas: `LedgerFiltersSchema`, `CreateAdhocIncomeInputSchema`, `CreateAdhocExpenseInputSchema`, `VoidTransactionInputSchema`, `ReverseTransactionInputSchema`.
- `lib/transactions/repository.ts` — add `listLedger`, `computeTotals`, `listCrossProjectTotals`, `voidTransaction`, `reverseTransaction`. New error classes.
- `app/(authed)/projects/[id]/project-tabs.tsx` — accept `financials?: ReactNode` prop. Render in `<TabsContent value="financials">` (replacing placeholder).
- `app/(authed)/projects/[id]/page.tsx` — for admin sessions only, add ledger + totals fetches to `Promise.all`. Pass `financials` prop.
- `app/(authed)/layout.tsx` — add admin-only "Financials" nav link.
- `scripts/init-db.mjs` — append `{ reversalOf: 1 }` sparse index for transactions.
