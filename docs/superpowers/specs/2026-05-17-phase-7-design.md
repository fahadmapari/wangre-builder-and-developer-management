# Phase 7 — Tech-debt cleanup, `andUnstock` on purchase reverse, Audit log (design)

**Date:** 2026-05-17
**Status:** Approved (brainstorm). Implementation plan pending.
**Depends on:** Phases 1–6. Phase 6 merged to local master (HEAD `906c294`).

## Goal

Three independent units shipped as Phase 7 ("Polish"), sharing one spec but implementable in any order (or in parallel):

1. **Phase 6 cleanup** — two small spec-vs-code drift fixes carried over from the Phase 6 handoff (dead `"not-original"` reason; non-defensive `fromDate` copy in two transfer-list functions). One previously-listed third item (MaterialMovement field-order swap) is dropped on inspection — the code already matches the precedent.
2. **`andUnstock` on purchase reverse** — opt-in checkbox on the Reverse dialog for `category: "purchase"` transactions. When checked, the same `withTransaction` session that writes the reversing entry also writes a reversing `materialMovements` row and decrements `projectMaterials.stockOnHand`, race-safely. Default unchecked → today's behavior preserved (financial-only reversal, for the "supplier issued credit while we kept the goods" case).
3. **Audit log** — new admin-only `/audit` page (filterable global feed) plus a per-row History `Sheet` on rich-history rows (Ledger, Materials movements, Money transfers, Material transfers). Backed by a new `lib/audit/repository.ts` that unions reads across `transactions`, `materialMovements`, `projects`, `units`, and `materials` (catalog) in application code — no new collection, no schema changes.

## Non-goals (explicitly deferred)

- **Edit-tracking for mutable entities.** Projects, units, and materials catalog have `createdBy` but no `updatedBy` / `lastUpdatedAt-with-actor`. Phase 7 ships the audit feed as **creates + voids + reversals only**. Edits to these entities remain anonymous. Adding `updatedBy` is a future-phase decision.
- **An event-sourced `auditEvents` collection.** Considered; rejected in favor of reconstruction from existing fields. The per-domain projection in `lib/audit/repository.ts` is a clean future migration boundary if volume ever demands it.
- **`andUnstock` on `voidTransaction`.** Today `voidTransaction` accepts only `category: "adhoc"` rows. Purchases use reverse, not void — extending void to purchases is its own design decision and out of scope for Phase 7.
- **CSV export, free-text search, pagination, drilldown sheets** on existing tables. Still deferred from Phase 5/6 non-goals. Phase 7 only adds pagination to the new `/audit` page (because audit volume grows fastest).
- **Floor-manager access to the audit log.** Admin-only surface. FM self-audit ("what did I do today") is a future decision.
- **Mobile-responsive audit UI** beyond the existing table primitives' baseline. Deferred to a separate UX-polish phase.
- **Automated test suite.** Manual T-tasks (Phase 3–6 precedent).
- **Audit retention / archival policy.** Audit is a derived view, not a separate store. Retention is whatever the source collections retain.

## Locked-in conventions reused

- **Server-side role enforcement** as the first executable line of every server action and protected page (`requireAdmin` throughout — every new Phase 7 surface is admin-only).
- **Multi-document writes** wrap in `client.startSession()` + `session.withTransaction()`. The `andUnstock` cascade extends the existing `reverseTransaction` transaction.
- **Append-only.** No row deleted. The `andUnstock` cascade writes a reversing `materialMovements` row (does not mutate the original) and updates `projectMaterials.stockOnHand` (the running-total doc, which is the only legitimate mutable surface).
- **`createdBy: ObjectId`** on every new row (already present on every collection the audit reads).
- **Server actions return `ActionResult<T>`** discriminated union. New `getEntityHistoryAction` follows the pattern.
- **Dialog state-reset key trick** on the (modified) Reverse dialog and the new History Sheet trigger.
- **Hybrid server/client tab pattern** for `/audit` (server page + server table + client filter form + client Sheet).
- **Aggregations involving reversals** use `$ifNull` / `$cond` — never `$eq ["$field", null]`. (The audit repo prefers application-level filters over Mongo aggregation, but any aggregation it does write follows this rule.)
- **`revalidatePath`** after `andUnstock` extends the existing reverse path with per-project material paths (since stock changed): `/projects/[id]/materials`, `/projects/[id]/financials`, `/financials`, `/audit` (new).

## Permission matrix

Entire Phase 7 surface is **admin only**.

| Action | admin | floor_manager |
|---|---|---|
| See "Audit" nav link | yes | no (link hidden) |
| Visit `/audit` top-level route | yes | no (redirect via `requireAdmin`) |
| See History button on Ledger/Movements/Transfers rows | yes | no (conditionally rendered) |
| Call `getEntityHistoryAction` | yes | no (`requireAdmin` first line) |
| See "Also undo stock" checkbox on purchase Reverse dialog | yes | no (Financials tab is admin-only per Phase 5) |
| Trigger `andUnstock` cascade | yes | no |

## Component 1 — Phase 6 cleanup

### 1a. Remove dead `"not-original"` reason

Confirmed dead: `CannotReverseTransferError("not-original")` is never thrown anywhere in the codebase — only `"is-voided"` is. Per the Phase 6 handoff analysis, the `transferGroupId`-shared-by-originals-and-reversals encoding combined with the `AlreadyReversedError` `$in`-guard makes the `"not-original"` path unreachable.

**Changes:**

- `lib/transactions/repository.ts:945` — narrow the union: `export type CannotReverseTransferReason = "is-voided"`. (Kept as a union for extension; the alternative of dropping the field entirely is rejected to preserve the error class shape.)
- `app/(authed)/transfers/actions.ts:151-157` and the parallel block at lines 302-308 — collapse the ternary; only the `is-voided` message remains. Each becomes a single-line message assignment.

### 1b. Defensive copy `fromDate`

Both transfer-list functions copy `range.to` defensively (`new Date(range.to); setHours(23,59,59,999)`) but leave `fromDate` as a bare alias of `range.from`. Cosmetic asymmetry, no current bug, but fix it for parity.

**Changes:**

- `lib/transactions/repository.ts:800` — `const fromDate = new Date(range.from)`.
- `lib/materials/repository.ts:778` — `const fromDate = new Date(range.from)`.

### 1c. MaterialMovement field-order swap — DROPPED

The Phase 6 handoff listed this as a cleanup item, but inspection shows the code already matches the precedent: both `Transaction` (lines 135-136) and `MaterialMovement` (lines 175-176) have `reversalOf` before `transferGroupId`. The spec text at Phase 6 spec line 99-100 listed them in the opposite order — that's spec-text drift, not code drift. No change.

## Component 2 — `andUnstock` on purchase reverse

### 2a. Schema change

Extend `ReverseTransactionInputSchema` at `lib/transactions/schemas.ts:109-114`:

```ts
export const ReverseTransactionInputSchema = z.object({
  transactionId: z.string().min(1, "Missing transaction"),
  occurredAt: z.coerce.date().optional(),
  notes: z.string().max(2000).optional().default(""),
  andUnstock: z.boolean().optional().default(false),  // NEW
})
```

### 2b. Repository — extend `reverseTransaction`

`lib/transactions/repository.ts:518` — accept `andUnstock: boolean` (default `false`) in the `override` parameter. The existing transactional flow (find original → validate → insert reversing row) is unchanged. When `andUnstock === true` AND `original.category === "purchase"`, append the following steps inside the same `withTransaction` session, **after** the transaction reversal insert:

1. **Find the linked movement.** `movements.findOne({ transactionId: original._id }, { session })`. If not found (defensive — `recordPurchase` always inserts both): throw `LinkedMovementNotFoundError("No materialMovement linked to this purchase")`.
2. **Double-cascade guard.** If the linked movement is already voided OR has any reversal pointing at it (`movements.findOne({ reversalOf: linkedMovement._id }, { session })`): throw `AlreadyUnstockedError("Stock side has already been undone for this purchase.")`. The transaction-level `AlreadyReversedError` catches double-reverse on the financial side; this catches the case where someone partially undid the stock via mongosh.
3. **Conditional stock decrement.** `projectMaterials.findOneAndUpdate({ projectId: original.projectId, materialId: linkedMovement.materialId, stockOnHand: { $gte: linkedMovement.qty } }, { $inc: { stockOnHand: -linkedMovement.qty } }, { session })`. If `matchedCount === 0`: re-read `projectMaterials` to fetch the actual `available` value (outside the conditional), then throw the existing `InsufficientStockForReversalError(available, projectId, projectName)` defined at `lib/materials/repository.ts:752` (introduced by Phase 6 for transfer-reversal; same semantics — stock too low to reverse). Reused as-is; no new class. The `withTransaction` aborts on throw, so no partial state.
4. **Insert reversing movement row.** Same projectId/materialId/createdBy/createdAt. `kind: "out"`, `category: "purchase"`, `qty: linkedMovement.qty`, `reversalOf: linkedMovement._id`. Description denormalized: `"Reversal — Purchase: {materialName}"`. (Material name re-read from `materials` catalog inside the same session to avoid trusting a denormalized field that may be stale.) Mirrors Phase 6's "reversal reuses original category with opposite kind" convention.

The function's return type becomes `Promise<{ reversalId: ObjectId; movementReversalId?: ObjectId }>` — the optional second id only present when cascade ran.

### 2c. Action layer

The existing reverse action at `app/(authed)/projects/[id]/financials/actions.ts` (verified during exploration). First line stays `await requireAdmin()`. Pass `input.andUnstock` through to the repo. Catch branches add:

- `LinkedMovementNotFoundError` → `"Cannot undo stock: no material movement linked to this purchase."`
- `AlreadyUnstockedError` → `"Cannot undo stock: it has already been undone for this purchase."`
- `InsufficientStockForReversalError` → `"Cannot undo stock: {projectName} only has {available} {unit} of {materialName} remaining, but the purchase was {qty}."`

`revalidatePath` calls extend to include `/projects/[id]/materials`, `/financials`, and `/audit` (so the audit feed shows the new events fresh).

### 2d. Dialog UI

`app/(authed)/projects/[id]/financials/reverse-confirm-dialog.tsx` — receive a `category` prop. When `category === "purchase"`, render a checkbox `Also undo the stock side (decrements {projectName}'s {materialName} by {qty} {unit})` with helper text `"Use when the materials were returned or never received. Leave unchecked if the supplier issued a credit while you kept the goods."` Default unchecked. State-reset key trick respected.

For sale / adhoc rows the checkbox is not rendered (condition omitted). No new dialog file.

## Component 3 — Audit log

### 3a. Event shape

A single normalized type lives at `lib/audit/schemas.ts`:

```ts
export type AuditAction = "created" | "voided" | "reversed"
export type AuditEntityType = "transaction" | "movement" | "project" | "unit" | "material"

export type AuditEvent = {
  id: string                       // synthetic: `${entityType}:${entityId}:${action}`
  occurredAt: Date                 // primary sort key
  actorId: ObjectId
  actorName: string                // denormalized at query time
  actorRole: "admin" | "floor_manager"
  action: AuditAction
  entityType: AuditEntityType
  entityId: ObjectId
  projectId?: ObjectId             // absent for materials catalog
  projectName?: string             // denormalized at query time
  summary: string                  // human-readable
  refUrl?: string                  // optional deep-link to context page
}

export type AuditFilters = {
  from: Date
  to: Date
  actorId?: ObjectId
  action?: AuditAction
  entityType?: AuditEntityType
  projectId?: ObjectId
  page: number                     // 1-based
  pageSize: number                 // default 50
}
```

### 3b. Event generation rules

Each source row emits at most two events. Reversal rows count as a `reversed` event on themselves, not as a synthetic event on the original — this avoids double-counting.

| Source collection | Emitted events |
|---|---|
| `transactions` (any row, void or not, reversal or not) | One **created**-or-**reversed** event from the row's `createdAt`/`createdBy`. `action = "reversed"` iff `reversalOf` is set; else `"created"`. **Plus** one **voided** event from `voidedAt`/`voidedBy` if `voidedAt` is set. |
| `materialMovements` | Same rules as `transactions`. |
| `projects`, `units`, `materials` (catalog) | One **created** event from `createdAt`/`createdBy`. No void or reversal fields on these collections; no further events. |

Implied row counts:
- Plain unaffected entity → 1 event.
- Voided adhoc → 2 events (created + voided).
- Reversed sale → 2 events (sale's `created` + reversal row's `reversed`).
- Voided then reversed (edge case) → 3 events spread across both rows.

Summary generation lives in the audit repo, one helper per `entityType`. Examples: `"Created Purchase: Cement ₹50,000 (Project A)"`, `"Voided adhoc expense ₹2,400 — petty cash"`, `"Reversed Sale of Unit 304 — Buyer: J. Smith"`, `"Created project: Skyline Towers"`.

### 3c. Repository — `lib/audit/repository.ts`

Two exported functions:

```ts
export async function listAuditEvents(
  filters: AuditFilters
): Promise<{ events: AuditEvent[]; total: number }>

export async function listEntityHistory(
  entityType: AuditEntityType,
  entityId: ObjectId
): Promise<AuditEvent[]>
```

**`listAuditEvents` implementation (Approach A — application-level union):**

1. **Translate filters per collection.** Date range maps to `createdAt` (for created/reversed events) AND `voidedAt` (for voided events) — both via `$or` per collection so a single query catches rows whose create OR void falls in range. Project filter maps to `projectId` where applicable; skipped for `materials` catalog. Entity-type filter selects which collections are queried at all.
2. **Parallel queries.** `Promise.all` over up to five collection queries (in-scope only).
3. **Project to events.** For each fetched row, run the rules above; push 0..2 events into a flat array.
4. **Apply post-projection filters.** `actorId` and `action` filters are easier to apply post-projection (cleaner code than pushing into per-collection queries). Date range stays in the query for cheaper reads.
5. **Sort + total.** Sort by `occurredAt` desc. `total = events.length` (pre-pagination).
6. **Bulk denormalize actor and project names.** Collect unique `actorId`s and `projectId`s; one `users.find({ _id: { $in: ids } })` and one `projects.find({ _id: { $in: ids } })`; attach `actorName`/`actorRole`/`projectName` onto each event.
7. **Paginate.** Slice `events.slice((page-1)*pageSize, page*pageSize)`.

At expected data volumes (handfuls of thousands of rows total, per the project context), end-to-end query time is dominated by the bulk user/project lookups, not the application-side merge.

**`listEntityHistory(entityType, entityId)`:** scoped variant.

- `transaction` or `movement`: fetch the row itself; fetch any other row in the same collection with `reversalOf = entityId`; if the row has a `transferGroupId`, additionally fetch the rest of the group (so the Sheet shows the full transfer lifecycle from any leg). Generate events from all fetched rows. Sort + denormalize as above.
- `project`/`unit`/`material`: fetch the single row; emit one `created` event.

No filters parameter. No pagination — histories are bounded small.

### 3d. Global feed UI — `/audit` (admin-only)

- `app/(authed)/audit/page.tsx` — server component. First line `await requireAdmin()`. Reads filters from search params (URL-synced, matches Phase 5 pattern). Calls `listAuditEvents`. Composes `<AuditFilters>` (client) + `<AuditTable>` (server) + pagination controls.
- `app/(authed)/audit/audit-filters.tsx` — client component. Inputs: date range, user dropdown (populated via prop from server), action select (created/voided/reversed/all), entity type select (transaction/movement/project/unit/material/all), project dropdown (populated via prop). Submits by `router.push` with updated search params — no server action.
- `app/(authed)/audit/audit-table.tsx` — server component. Columns: Timestamp · Actor (name + role badge) · Action (badge) · Entity (type icon + brief) · Summary · Project · `[View →]` deep-link button if `refUrl` is present.
- `app/(authed)/layout.tsx` — admin-only "Audit" nav link, after "Transfers".

### 3e. Per-row History Sheet

- `app/(authed)/components/history-sheet.tsx` — client component using shadcn `Sheet` (slide-in panel from the right). Props: `entityType: AuditEntityType`, `entityId: string`, `triggerLabel?: string`, `kind?: "transfer-money" | "transfer-material"` (so the trigger correctly threads `transferGroupId` lookup for transfer rows — both legs share a group, so any leg's id suffices).
- On open, calls `getEntityHistoryAction(entityType, entityId)` (new server action at `app/(authed)/audit/actions.ts`). First line `await requireAdmin()`. Proxies to `listEntityHistory` and returns `ActionResult<AuditEvent[]>`.
- Renders a vertical timeline: each event shows actor (name + role badge) + relative time (with tooltip showing absolute) + action badge + summary. Empty state: `"No history found."` (shouldn't appear for a non-deleted row).

**Trigger surfaces — added as admin-only conditional row actions:**

- `app/(authed)/projects/[id]/financials/ledger-table.tsx` — straightforward Sheet trigger.
- `app/(authed)/projects/[id]/materials/movements-sheet.tsx` — **already a Sheet itself.** A nested Sheet here is awkward; the History trigger from movement rows opens a **Dialog** (not a Sheet) when invoked from inside an existing Sheet. The history Dialog reuses the same `getEntityHistoryAction` and renders the same timeline; only the chrome differs. The `<HistorySheet>` component exposes a `<HistoryDialog>` sibling export sharing one body component (so the timeline rendering isn't duplicated).
- `app/(authed)/transfers/money-transfers-table.tsx` — straightforward Sheet trigger.
- `app/(authed)/transfers/material-transfers-table.tsx` — straightforward Sheet trigger.

Note: shadcn `Dialog` is already in use across the codebase; `Sheet` is the only primitive that may need `npx shadcn add sheet` as the first implementation step.

### 3f. Auth enforcement summary

- `/audit` page: `await requireAdmin()` at top.
- `getEntityHistoryAction`: `await requireAdmin()` first line.
- History Sheet trigger buttons: conditionally rendered when `session.user.role === "admin"`. UI hiding is convenience only.
- FM hitting `/audit` directly: redirected via existing `requireAdmin` helper.

## Files added/modified

**New (8 files):**

- `lib/audit/schemas.ts`
- `lib/audit/repository.ts`
- `app/(authed)/audit/page.tsx`
- `app/(authed)/audit/audit-filters.tsx`
- `app/(authed)/audit/audit-table.tsx`
- `app/(authed)/audit/actions.ts` (just `getEntityHistoryAction`)
- `app/(authed)/components/history-sheet.tsx` (exports both `<HistorySheet>` and `<HistoryDialog>` sharing one body component — see Component 3e for why the Dialog sibling exists)
- `components/ui/sheet.tsx` (via `npx shadcn add sheet`, if not already present)

**Modified (~8 files):**

- `lib/transactions/schemas.ts` — `andUnstock` on `ReverseTransactionInputSchema`.
- `lib/transactions/repository.ts` — `reverseTransaction` cascade; narrow `CannotReverseTransferReason`; `fromDate` defensive copy in `listMoneyTransfers`; new error classes `LinkedMovementNotFoundError` and `AlreadyUnstockedError`. The third needed error (`InsufficientStockForReversalError`) already exists in `lib/materials/repository.ts:752` from Phase 6 — import and reuse it; the transactions repo imports the materials repo's `InsufficientStockForReversalError` (mirrors how `lib/materials/repository.ts` already imports `CannotReverseTransferError` from the transactions repo, so cross-domain imports are an established pattern).
- `lib/materials/repository.ts` — `fromDate` defensive copy in `listMaterialTransfers`.
- `app/(authed)/projects/[id]/financials/actions.ts` — thread `andUnstock`; new error catches; extended `revalidatePath`.
- `app/(authed)/projects/[id]/financials/reverse-confirm-dialog.tsx` — conditional `andUnstock` checkbox.
- `app/(authed)/transfers/actions.ts` — collapse `CannotReverseTransferError` ternary at lines 151-157 and 302-308.
- `app/(authed)/layout.tsx` — Audit nav link.
- `app/(authed)/projects/[id]/financials/ledger-table.tsx`, the materials movements table file, `app/(authed)/transfers/money-transfers-table.tsx`, `app/(authed)/transfers/material-transfers-table.tsx` — History row actions.

## Build sequence (suggested)

The three components are independent; any order works. Recommended sequence to minimize merge friction:

1. **Component 1 (cleanup) first.** Trivial, no risk, gets the type narrowing in early so subsequent components don't trip on it.
2. **Component 2 (`andUnstock`) next.** Self-contained per file; new error classes don't conflict with Component 3.
3. **Component 3 (audit log) last.** Largest, touches the most surfaces, easiest to review against a clean baseline. The History Sheet additions to ledger/movements/transfer tables can be one commit per surface for reviewability.

Each component lands as its own commit (or small commit series). All three together → one Phase 7 merge to local master, parallel to prior phases. Do not push to `origin/master` without explicit user instruction (per project rule).

## Testing — manual T-tasks

Following the project's manual T-task pattern (Phase 3–6 precedent). No automated tests introduced.

### Component 1 — cleanup

- **T-cleanup-1.** Type-check clean after narrowing `CannotReverseTransferReason`. `npx tsc --noEmit`.
- **T-cleanup-2.** Reverse a money transfer whose leg is voided (set up via mongosh) → error message still surfaces "A leg of this transfer is voided; cannot reverse."
- **T-cleanup-3.** Date-range filter on `/transfers` still returns expected rows after `fromDate` defensive copy.

### Component 2 — `andUnstock`

- **T-stock-1.** Reverse a purchase WITHOUT `andUnstock` → only `transactions` changes; `projectMaterials.stockOnHand` unchanged; no new `materialMovements` inserted. (Today's behavior.)
- **T-stock-2.** Reverse a purchase WITH `andUnstock` → (a) reversing transaction inserted; (b) reversing `materialMovements` inserted with `reversalOf` set; (c) `projectMaterials.stockOnHand` decreased by qty; (d) atomicity — kill server mid-flow → Atlas shows no partial state.
- **T-stock-3.** Reverse a purchase WITH `andUnstock` after stock has been consumed below qty → `InsufficientStockForReversalError` surfaces friendly message; transaction reversal does NOT happen.
- **T-stock-4.** Two reversal attempts on the same purchase with `andUnstock` → second surfaces `AlreadyReversedError` or `AlreadyUnstockedError`.
- **T-stock-5.** Checkbox does NOT appear on Reverse dialog for sale / adhoc rows.

### Component 3 — audit log

- **T-audit-1.** Admin visits `/audit` → renders with default filters (current month); events sorted newest-first.
- **T-audit-2.** Floor manager visits `/audit` → redirected via `requireAdmin`.
- **T-audit-3.** Each filter narrows correctly; combinations work (AND).
- **T-audit-4.** Voided adhoc transaction → 2 rows (created + voided). Reversed sale → 2 rows (sale created + reversal reversed). Plain entity → 1 row.
- **T-audit-5.** Actor name and role badge correct.
- **T-audit-6.** Pagination works; total count matches sum across pages.
- **T-audit-7.** History Sheet opens from a Ledger row → shows that row's lifecycle. Closes cleanly.
- **T-audit-8.** History Sheet on a money transfer row shows BOTH legs' events (via `transferGroupId`) and the reversal pair if reversed.

### Cross-cutting

- **T-cross-1.** Each existing surface (per-project tabs, `/financials`, `/transfers`, `/materials`, new `/audit`) → no regressions; `andUnstock` checkbox conditional rendering correct; History buttons admin-only.
- **T-cross-2.** `npm run lint && npx tsc --noEmit` clean.

### Acceptance

Phase 7 ships when all T-cleanup-, T-stock-, T-audit-, T-cross- tasks pass AND no regressions detected on Phase 3/4/5/6 surfaces. Outstanding Phase 6 T25 manual verification should ideally be run alongside Phase 7 T-cross-1 as part of the same browser pass.
