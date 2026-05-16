# Phase 6 — Inter-Project Transfers (design)

**Date:** 2026-05-16
**Status:** Approved (brainstorm). Implementation plan pending.
**Depends on:** Phases 1–5. Phase 5 merged to local master (HEAD `99ec085`).

## Goal

Add admin-only inter-project transfers in two distinct flows:

1. **Money transfer** — atomically write two paired `transactions` rows (one source `expense/transfer_out`, one destination `income/transfer_in`) inside one `withTransaction`.
2. **Material transfer** — atomically write two paired `materialMovements` rows plus two `projectMaterials.stockOnHand` adjustments (source decrement, destination upsert/increment) inside one `withTransaction`.

Both flows support **paired reversal** as a first-class operation: a single reversal action writes 2 (money) or 4 (material) correction rows + stock adjustments atomically, so corrections never require dropping to `mongosh`.

The user-facing surface is:
- Per-project triggers on the existing Financials tab (money) and Materials tab (material).
- New top-level admin route `/transfers` with two tabs (Money | Material), each listing transfers across all projects with a Reverse action on active originals.
- New "Transfers" link in the authed header nav (admin-only, alongside Phase 5 "Financials").

## Non-goals (explicitly deferred)

- **Partial reversal.** A reversal undoes the whole transfer. To reverse only part of ₹1,000, create a new transfer in the opposite direction. Consistent with Phase 5's whole-row reversing-entry principle.
- **Reversal of a reversal.** Reversal rows are immutable. Re-reversal blocked by the same is-original guard that protects against double-reversal. Future cleanup via `mongosh` if it bites.
- **Combined money+material transfer.** Two separate flows end-to-end (separate actions, forms, dialogs). The mental models, validation, side effects, and downstream aggregation impact all differ.
- **Cross-project material auto-create.** Catalog is global (Phase 4) — the material always exists by id. What's per-project is the `projectMaterials` row, which `createMaterialTransfer` upserts at the destination using the same pattern as `recordPurchase`. No "auto-create destination material" needed.
- **Editing existing transfer rows.** Append-only. To "edit" a transfer: reverse it, then create a new one with corrected fields.
- **Voiding individual transfer legs.** Transfers are not adhoc rows; Phase 5's `voidTransaction` already rejects non-adhoc categories. Reversal is the only correction path for transfers in Phase 6.
- **CSV export, free-text search, pagination, drilldown sheets** on `/transfers`. Phase 7 polish.
- **Floor manager involvement.** Both flows are admin-only. Cross-project ops are qualitatively different from per-project. If an FM needs to move stock between sites, they ping an admin.
- **Approval workflow** for transfers or reversals. Single admin commits directly.
- **Automated test suite.** Verification is via manual T-tasks (Phase 4/5 precedent). Phase 6 does not introduce automated testing infrastructure.

## Locked-in conventions reused

- **Server-side role enforcement** is the first executable line of every server action (`requireAdmin` throughout — entire Phase 6 surface is admin-only).
- **Multi-document writes** wrap in `client.startSession()` + `session.withTransaction()`. Phase 6 is the most transaction-heavy phase yet — paired ledger writes + paired material movements + two `projectMaterials` updates, all atomic.
- **Append-only ledger and movement log.** Rows never deleted. Corrections via reversal only.
- **`createdBy: ObjectId`** on every new row.
- **Server actions return `ActionResult<T>`** discriminated union: `{ ok: true; data: T } | { ok: false; error: string; field?: string }`. Errors logged server-side via `console.error` for unexpected exceptions; known typed errors translated to user-facing messages.
- **Currency hardcoded `"INR"`.** Whole rupees on `transactions.amount` (`Math.round`-ed at write).
- **Dialog state-reset key trick** on every form dialog: `<Dialog key={open ? "open-${id}" : "closed"} ... />`.
- **Hybrid server/client tab pattern** for `/transfers` (server components compose server tables + client dialogs/filters).
- **Aggregations involving reversals** use `$ifNull` `$cond` — never `$eq ["$field", null]` (Phase 5 commit `56d5894` — Mongo's `$eq` doesn't reliably match missing fields).
- **Conditional `findOneAndUpdate({stockOnHand: {$gte: qty}})`** for race-safe stock decrement. Same pattern as Phase 4's `logConsumption`.
- **`revalidatePath`** after every mutation that affects rendered server components.

## Permission matrix

Entire Phase 6 surface is **admin only**.

| Action | admin | floor_manager |
|---|---|---|
| See "Transfers" nav link | yes | no (link hidden) |
| Visit `/transfers` top-level route | yes | no (redirect via `requireAdmin`) |
| See "Transfer money to another project" button on `/projects/[id]?tab=financials` | yes | no (button hidden; tab itself is admin-only per Phase 5) |
| See "Transfer to another project" action on materials rows | yes | no |
| Create money transfer | yes | no |
| Reverse money transfer | yes | no |
| Create material transfer | yes | no |
| Reverse material transfer | yes | no |

No `unitPrice` / `amount` server-side stripping concerns — FMs never see this surface.

## Pair-linkage data model

A transfer's two legs share a `transferGroupId: ObjectId`. When that transfer is reversed, the two reversal legs **also** share the same `transferGroupId` AND each carries a `reversalOf` pointer to its corresponding original leg.

Result: a reversed transfer is a 4-row group (2 originals + 2 reversals). Both originals lack `reversalOf`; both reversals have it. "Is this transfer reversed?" = "any row in the group has `reversalOf` set" — discoverable in one query.

Same encoding for money (in `transactions`) and for material (in `materialMovements`).

This is **not** a separate `transfers` parent collection. The transfer-level metadata (source, destination, amount/qty, who, when) is fully reconstructible by joining the two legs. No parent/row sync risk; on-pattern with Phase 5's `reversalOf`-as-just-a-field model.

## Data model

### `transactions` collection — schema additions

```ts
type Transaction = {
  // ... existing fields unchanged
  transferGroupId?: ObjectId   // NEW. Sparse. Set on both legs of a money transfer
                                // (and both legs of its reversal — same id).
}
```

New sparse index:
```js
db.collection("transactions").createIndex({ transferGroupId: 1 }, { sparse: true })
```

Category enum already includes `"transfer_in"` / `"transfer_out"` (declared up-front in Phase 3). No enum migration.

### `materialMovements` collection — schema additions

```ts
type MaterialMovement = {
  // ... existing fields unchanged
  transferGroupId?: ObjectId   // NEW. Sparse. Parallels transactions.transferGroupId.
  reversalOf?: ObjectId         // NEW. Sparse. Parallels Phase 5's transactions.reversalOf.
                                 // Set on each reversal leg pointing to its original leg.
}
```

New sparse indexes:
```js
db.collection("materialMovements").createIndex({ transferGroupId: 1 }, { sparse: true })
db.collection("materialMovements").createIndex({ reversalOf: 1 }, { sparse: true })
```

Category enum already includes `"transfer_in"` / `"transfer_out"` (declared up-front in Phase 4). No enum migration.

### `projectMaterials` collection — no schema change

Stock adjustments use existing `stockOnHand` field. Source decrement via conditional `findOneAndUpdate({stockOnHand: {$gte: qty}})`; destination upsert via `$inc` (same pattern as `recordPurchase`).

### `init-db.mjs` additions

```js
// Phase 6 — transfer pair linkage
await db.collection("transactions").createIndex({ transferGroupId: 1 }, { sparse: true })
await db.collection("materialMovements").createIndex({ transferGroupId: 1 }, { sparse: true })
await db.collection("materialMovements").createIndex({ reversalOf: 1 }, { sparse: true })
```

## Repository organization

Functions live in the existing domain repos because they touch the same collections. A thin `lib/transfers/` namespace holds shared Zod schemas and display types only.

### `lib/transfers/schemas.ts` (new)

Holds:
- `CreateMoneyTransferInputSchema`, `CreateMoneyTransferInput`
- `CreateMaterialTransferInputSchema`, `CreateMaterialTransferInput`
- `ReverseTransferInputSchema`, `ReverseTransferInput`
- `MoneyTransferRow` — display type used by `/transfers` Money tab
- `MaterialTransferRow` — display type used by `/transfers` Material tab

Input shapes:

```ts
CreateMoneyTransferInputSchema = z.object({
  sourceProjectId: z.string().min(1),
  destProjectId:   z.string().min(1),
  amount:          z.coerce.number().int().min(1).max(100_000_000),
  occurredAt:      z.coerce.date(),
  description:     z.string().trim().min(1).max(500),
  notes:           z.string().max(2000).optional().default(""),
})

CreateMaterialTransferInputSchema = z.object({
  sourceProjectId: z.string().min(1),
  destProjectId:   z.string().min(1),
  materialId:      z.string().min(1),
  qty:             z.coerce.number().positive().max(1_000_000),
  occurredAt:      z.coerce.date(),
  notes:           z.string().max(2000).optional().default(""),
})

ReverseTransferInputSchema = z.object({
  transferGroupId: z.string().min(1),
  occurredAt:      z.coerce.date().optional(),
  notes:           z.string().max(2000).optional().default(""),
})
```

Display row shapes:

```ts
type MoneyTransferRow = {
  transferGroupId: string
  occurredAt: Date
  sourceProjectId: string
  sourceProjectName: string
  destProjectId: string
  destProjectName: string
  amount: number                 // positive; the original amount
  description: string            // taken from source leg
  status: "active" | "reversed"  // "reversed" if any leg in the group has reversalOf set
  reversedAt: Date | null        // earliest reversal-leg createdAt, or null
  createdBy: string              // userId hex
  createdByName: string | null   // resolved at query time
}

type MaterialTransferRow = {
  transferGroupId: string
  occurredAt: Date
  sourceProjectId: string
  sourceProjectName: string
  destProjectId: string
  destProjectName: string
  materialId: string
  materialName: string
  materialUnit: MaterialUnit
  materialUnitOther?: string
  qty: number
  status: "active" | "reversed"
  reversedAt: Date | null
  createdBy: string
  createdByName: string | null
}
```

### `lib/transactions/repository.ts` (extend)

Add three functions and three error classes (new errors documented in the Error model section below).

```ts
async function createMoneyTransfer(
  input: {
    sourceProjectId: ObjectId
    destProjectId: ObjectId
    amount: number
    occurredAt: Date
    description: string
    notes: string
    sourceProjectName: string  // resolved by action layer for description denormalization
    destProjectName: string
  },
  userId: string
): Promise<{ transferGroupId: ObjectId; sourceTxId: ObjectId; destTxId: ObjectId }>

async function reverseMoneyTransfer(
  transferGroupId: ObjectId,
  override: { occurredAt?: Date; notes?: string },
  userId: string
): Promise<{ sourceRevId: ObjectId; destRevId: ObjectId }>

async function listMoneyTransfers(
  range: { from: Date; to: Date }
): Promise<MoneyTransferRow[]>
```

`computeTotals` and `listCrossProjectTotals` are extended (not replaced) to additionally return `transfersIn` and `transfersOut` per project, plus the overall sums. Implementation: a parallel `$group` filtered to `category: {$in: ["transfer_in", "transfer_out"]}`, summed with the same `$ifNull` `$cond` reversal-netting pattern.

```ts
type FinancialTotals = {
  revenue: number      // unchanged. INCLUDES transfer_in rows (Phase 5 semantics preserved).
  expenses: number     // unchanged. INCLUDES transfer_out rows.
  net: number          // unchanged. revenue - expenses.
  transfersIn: number  // NEW. Subset of revenue — sum of transfer_in rows over the same window.
  transfersOut: number // NEW. Subset of expenses — sum of transfer_out rows over the same window.
}
```

UI consumes the new fields to render the subtitle when non-zero (see UI section).

### `lib/materials/repository.ts` (extend)

Add three functions and one error class.

```ts
async function createMaterialTransfer(
  input: {
    sourceProjectId: ObjectId
    destProjectId: ObjectId
    materialId: ObjectId
    qty: number
    occurredAt: Date
    notes: string
    sourceProjectName: string
    destProjectName: string
    materialName: string
  },
  userId: string
): Promise<{
  transferGroupId: ObjectId
  sourceMovId: ObjectId
  destMovId: ObjectId
  sourceRemainingStock: number
}>

async function reverseMaterialTransfer(
  transferGroupId: ObjectId,
  override: { occurredAt?: Date; notes?: string },
  userId: string
): Promise<{ sourceRevId: ObjectId; destRevId: ObjectId }>

async function listMaterialTransfers(
  range: { from: Date; to: Date }
): Promise<MaterialTransferRow[]>
```

## Server actions

`app/(authed)/transfers/actions.ts` exports four actions. All start with `await requireAdmin()` as the first executable line, all return `ActionResult<T>`, all `revalidatePath` after success.

| Action | Body sketch | Revalidates |
|---|---|---|
| `createMoneyTransferAction(input)` | Zod parse → same-project guard → resolve project names → call `createMoneyTransfer` → translate errors | `/transfers`, `/projects/{src}` (financials tab), `/projects/{dest}` (financials tab), `/financials` |
| `reverseMoneyTransferAction(input)` | Zod parse → call `reverseMoneyTransfer` → translate errors | same set |
| `createMaterialTransferAction(input)` | Zod parse → same-project guard → resolve project + material names → call `createMaterialTransfer` → translate errors | `/transfers`, `/projects/{src}` (materials tab), `/projects/{dest}` (materials tab) |
| `reverseMaterialTransferAction(input)` | Zod parse → call `reverseMaterialTransfer` → translate errors | same set |

**Same-project guard** is a pre-session check at the action layer: `if (input.sourceProjectId === input.destProjectId) return { ok: false, error: "Source and destination must be different projects.", field: "destProjectId" }`. Cheap; never reaches the repository.

**Description denormalization** — auto-generated at write time and embedded in the row:

| Row | Description format |
|---|---|
| Money source leg | `"Transfer to {DestProjectName}: {user description}"` |
| Money dest leg | `"Transfer from {SourceProjectName}: {user description}"` |
| Material source leg | `"Transfer to {DestProjectName}: {qty} {unit} {materialName}"` |
| Material dest leg | `"Transfer from {SourceProjectName}: {qty} {unit} {materialName}"` |
| Reversal legs (any) | `"Reversal — {original description}"` |

If a project or material is renamed later, historical rows keep the old name. Same precedent as Phase 4's `"Purchase: {materialName}"`.

## UI surfaces

### Per-project triggers

**`/projects/[id]?tab=financials`** (admin only — tab itself is admin-only per Phase 5)
- New button on the Financials tab toolbar: **"Transfer money to another project"**, alongside Phase 5's `Add ad-hoc income/expense`.
- Click → `MoneyTransferDialog` with `lockedSource={projectId}` pre-bound.
- Fields: destination project (select, source project excluded), amount, date, description, notes.
- Submit → `createMoneyTransferAction` → toast `"Transferred ₹X to {DestProject}"` → close → tab revalidates.

**`/projects/[id]?tab=materials`** (admin only)
- New row action on each material row: **"Transfer to another project"**, alongside Phase 4's `Log consumption` / `Log return`.
- Click → `MaterialTransferDialog` with `lockedSource={projectId}` and `lockedMaterial={materialId}` pre-bound.
- Fields: destination project (select, source excluded), qty, date, notes.
- Submit → `createMaterialTransferAction` → toast `"Transferred {qty} {unit} {materialName} to {DestProject}. {remainingStock} {unit} remaining."` → close → tab revalidates.

Per-project triggers are the create path only — no listing on these tabs. Transfer rows surface in Phase 5's Financials ledger (money) and Phase 4's Movements drawer (material) via existing mechanisms.

### Top-level `/transfers` page

Route: `app/(authed)/transfers/page.tsx`, guarded by `requireAdmin()`.

Two tabs (per brainstorm decision Q6 = B):

**Money tab** (`money-transfers-table.tsx`)
| Date | Source → Dest | Amount | Description | Status | Created by | Actions |
|---|---|---|---|---|---|---|
| 2026-05-14 | Sunset → Marina | ₹50,000 | Working capital top-up | Active | btechy4 | Reverse |
| 2026-05-12 | Marina → Sunset | ₹20,000 | Vendor advance | Reversed (2026-05-13) | btechy4 | — |
| 2026-05-13 | Sunset → Marina | ₹20,000 | Reversal — Vendor advance | Reversal of [2026-05-12] | btechy4 | — |

**Material tab** (`material-transfers-table.tsx`)
| Date | Source → Dest | Material | Qty | Status | Created by | Actions |
|---|---|---|---|---|---|---|
| 2026-05-15 | Sunset → Marina | Cement (bag) | 50 | Active | btechy4 | Reverse |

Both tabs share:
- Date-range filter (default: `startOfYear()` to today, matching Phase 5's `/financials` and per-project Financials tab).
- Status column shows: `Active` / `Reversed (on YYYY-MM-DD)` / `Reversal of [original date]`.
- `Reverse` action shown only on active originals. Reversal rows and already-reversed originals show no action.
- Empty state: `"No transfers in this date range."`

**Reversal dialog** (`reverse-transfer-dialog.tsx`, shared by money + material)
- Shows both legs of the original transfer side-by-side for confirmation.
- Optional `occurredAt` (defaults to today) and `notes` fields.
- Submit → `reverseMoneyTransferAction` or `reverseMaterialTransferAction` → toast → close → page revalidates.

### Financials tab (Phase 5) — modifications

**Tile subtitle.** When `transfersIn > 0`, Revenue tile shows subtitle `(incl. ₹X,XXX transfers in)`. When `transfersOut > 0`, Expenses tile shows subtitle `(incl. ₹X,XXX transfers out)`. Hidden when zero.

**Ledger row badge.** Transfer rows in the existing ledger table get a small badge next to the description: `↔ {OtherProjectName}`. Resolved at server-component render time via a batch project-name lookup (the server component reads all distinct other-project ids from the page's transfer rows, queries `projects` once, builds a map). Reversal rows of transfers get both the existing `Reversal of` badge AND the `↔` badge.

### Global `/financials` page (Phase 5) — modifications

**Overall tiles** get the same `transfersIn` / `transfersOut` subtitle pattern as per-project tiles.

**Per-project table** rows show the transfer subtitle in their Revenue and Expenses cells (same pattern, smaller text).

### Header nav

`app/(authed)/layout.tsx` — add admin-only **"Transfers"** link, alongside Phase 5's "Financials" and Phase 4's "Catalog".

## Reversal flow & race safety

### Money transfer reversal

Inside one `session.withTransaction`:

1. **Find both legs** by `transferGroupId`: `txns.find({ transferGroupId: G }, { session })`. Expect exactly 2 rows. Otherwise: throw `TransferNotFoundError`.
2. **Sanity checks** on both legs: neither has `reversalOf` set; neither has `voided: true`. Otherwise: `CannotReverseTransferError("not-original")` or `("is-voided")`.
3. **Already-reversed guard.** Query: `txns.findOne({ reversalOf: { $in: [leg1._id, leg2._id] } }, { session })`. If any match: `AlreadyReversedError`. The `withTransaction` wrapping makes this serializable — concurrent reversers race, the loser sees the winner's just-inserted rows and aborts.
4. **Insert two reversal rows:**
   - Same `transferGroupId: G`
   - `reversalOf: <corresponding original leg _id>`
   - Swapped `kind` / `category`: source's `expense/transfer_out` → reversal `income/transfer_in`; dest's `income/transfer_in` → reversal `expense/transfer_out`.
   - `amount` = original amount (positive; aggregation's `$ifNull` `$cond` handles the sign).
   - `occurredAt` = override or `new Date()`.
   - `description` = `"Reversal — {original.description}"`.
   - `createdBy: ObjectId(userId)`, `createdAt: now`.

### Material transfer reversal

Inside one `session.withTransaction`:

1. **Find both legs** by `transferGroupId` in `materialMovements`. Not-2-rows / not-original / is-voided / already-reversed guards as above.
2. **Reverse the stock side:**
   - **Source project** (originally lost stock): unconditional `$inc` of `projectMaterials.stockOnHand` by `qty` via upsert (same as `logReturn`). Stock can only grow → never fails.
   - **Destination project** (originally gained stock): conditional `findOneAndUpdate({stockOnHand: {$gte: qty}})` (same as `logConsumption`). If it fails: throw `InsufficientStockForReversalError(available, destProjectId, destProjectName)` so the action surfaces `"Cannot reverse: {DestProjectName} only has {available} {unit} remaining, but the transfer was {qty}."`
3. **Insert two reversal `materialMovements` rows:** same `transferGroupId: G`, `reversalOf: <original leg _id>`, swapped kind/category, same qty, `description` = reversal pattern, `createdBy`, `createdAt`.
4. **No ledger writes.** Material movements are not cash events (Phase 4 precedent).

### Create-time race safety

- **Money transfer:** no race. Fresh `transferGroupId` ObjectId per call; both inserts atomic via `withTransaction`.
- **Material transfer:** source decrement uses Phase 4's conditional `findOneAndUpdate({stockOnHand: {$gte: qty}})`. Loser throws `InsufficientStockError(available)` (same error class as `logConsumption`). Destination upsert is unconditional `$inc`.
- **Same-project guard:** pre-session check at action layer. Cheap; never reaches the data layer.

### Concurrent reversal race

If admin B and admin C try to reverse the same transfer at the same time:
1. B's `withTransaction` reads both legs (no `reversalOf` matches yet), inserts two reversals, commits.
2. C's `withTransaction` reads both legs, queries `reversalOf: $in [...]`, sees B's just-inserted rows, throws `AlreadyReversedError`. Replica-set snapshot read concern ensures C sees B's commit.

This is the guarantee Phase 5's `reverseTransaction` lacks (where two racers can both succeed and produce duplicate reversals). Cost: one extra read per reversal. Acceptable for the heavier transfer-reversal operation.

### Voided-leg semantics (defense-in-depth)

A transfer's legs cannot be soft-voided in the current codebase — Phase 5's `voidTransaction` rejects non-adhoc categories, and material movements have no void action exposed. The `is-voided` guard in the reversal flow is defense-in-depth in case future code paths change.

### Reversal of a reversal

Not supported. Reversal rows carry `reversalOf` → the is-original guard in step 2 of both flows treats them as not-original and rejects. If a user needs to "undo the undo," they create a new transfer in the original direction.

## Phase 5 totals interaction

Phase 6 does not change Phase 5's existing `computeTotals` and `listCrossProjectTotals` math. Transfer rows already flow through automatically: `transfer_in` (kind: income) adds to Revenue, `transfer_out` (kind: expense) adds to Expenses. Reversals net via the existing `$ifNull` `$cond` pattern. Cross-project totals stay accurate (one project's `transfer_in` cancels another's `transfer_out`).

**The meaning problem:** per-project, "Revenue" now conflates operational income from sales with capital received from another project. Resolved per brainstorm decision Q5 = A: keep tile labels and Revenue/Expenses math unchanged, but extend `FinancialTotals` with `transfersIn` / `transfersOut` and render a subtitle when non-zero (`Revenue ₹10,00,000 (incl. ₹3,00,000 transfers in)`).

Implementation: the existing per-kind `$group` stays; add a parallel `$group` filtered to transfer categories, summed with the same `$ifNull` `$cond` netting. The parallel group can be a second pipeline stage in the same aggregate via `$facet`, or two separate aggregations — implementation plan decides.

## Error model

All errors are typed classes thrown from the repository layer; the action layer catches and translates to `ActionResult<T>`.

### New error classes

| Class | Thrown by | Reason |
|---|---|---|
| `TransferNotFoundError` | `reverse{Money,Material}Transfer` | `transferGroupId` doesn't match exactly 2 rows |
| `CannotReverseTransferError(reason)` | `reverse{Money,Material}Transfer` | `reason: "not-original" \| "is-voided"` — legs found are not valid reversal targets |
| `AlreadyReversedError` | `reverse{Money,Material}Transfer` | `reversalOf: $in [legIds]` query returned a row |
| `InsufficientStockForReversalError(available, projectId, projectName)` | `reverseMaterialTransfer` | Destination project's stock has dropped below `qty` since the original transfer |

Lives in `lib/transactions/repository.ts` and `lib/materials/repository.ts` respectively. Shared types live in `lib/transfers/schemas.ts` — implementation may co-locate or re-export.

### Reused error classes

- **`InsufficientStockError(available)`** — Phase 4. Thrown by `createMaterialTransfer` when source stock < `qty`. Same message pattern as `logConsumption`.

### Action-layer translation pattern

```ts
try {
  const result = await reverseMaterialTransfer(...)
  revalidatePath(...)
  return { ok: true, data: result }
} catch (e) {
  if (e instanceof InsufficientStockForReversalError) {
    return {
      ok: false,
      error: `Cannot reverse: ${e.projectName} only has ${e.available} remaining.`,
      field: "transferGroupId",
    }
  }
  if (e instanceof AlreadyReversedError) {
    return { ok: false, error: "This transfer has already been reversed." }
  }
  if (e instanceof CannotReverseTransferError) {
    const msg = e.reason === "is-voided"
      ? "A leg of this transfer is voided; cannot reverse."
      : "Only original transfers can be reversed (this row is itself a reversal)."
    return { ok: false, error: msg }
  }
  if (e instanceof TransferNotFoundError) {
    return { ok: false, error: "Transfer not found." }
  }
  console.error("Unexpected reverseMaterialTransfer error", e)
  return { ok: false, error: "Something went wrong. Please try again." }
}
```

Same shape for `createMaterialTransferAction` (handles `InsufficientStockError`), `createMoneyTransferAction` (no domain-specific errors beyond `SameProjectTransferError` handled pre-session), and `reverseMoneyTransferAction` (same set minus stock errors).

### Zod validation

First line of defense in each server action. Rejects: invalid ObjectIds, non-positive amounts/qtys, missing required fields, excessive description/notes length. Zod errors translated to `{ ok: false, error: zodError.message, field: zodError.path[0] }`.

### Server-side logging

Every caught exception that isn't a known typed error gets `console.error` with the full error before returning the generic message. Matches Phase 5 convention.

## Verification plan

No automated test suite is being added. Verification is via manual T-tasks executed in the app + spot-checks in `mongosh`. Implementation plan (next step) will enumerate the concrete T-task scripts. The verification surface implied by this design:

### Money transfer T-tasks
- **T-money-1** — Create transfer A→B for ₹50,000. Both project Financials tabs reflect immediately. `/transfers` Money tab shows the row with both project names.
- **T-money-2** — Source's Revenue/Expenses tile shows `(incl. ₹50,000 transfers out)` subtitle. Destination's shows the matching transfers-in subtitle. `/financials` cross-project overall totals unchanged from pre-transfer (the two legs net).
- **T-money-3** — Reverse the transfer from `/transfers`. Both projects return to pre-transfer state. 4-row group exists in `transactions` (mongosh check on `transferGroupId`).
- **T-money-4** — Concurrent reversal: two browser tabs racing the same transfer. Second attempt sees `AlreadyReversedError` message.
- **T-money-5** — Same-project guard: A→A rejected by form (destination excludes source) and by server-action (defense-in-depth — direct curl test).

### Material transfer T-tasks
- **T-mat-1** — Create material transfer A→B for 50 bags. Source `projectMaterials.stockOnHand` decremented; destination's incremented (or upserted if first transfer of this material to dest). Both project Materials tabs reflect.
- **T-mat-2** — Insufficient stock: try to transfer 100 bags when source has 50. Rejected with `InsufficientStockError` message naming `available`.
- **T-mat-3** — Reverse the material transfer. Source stock restored; destination stock decremented. 4-row group in `materialMovements`.
- **T-mat-4** — Material reversal blocked by consumed stock: transfer 50 bags A→B, log consumption of all 50 at B, attempt reversal. Rejected with `InsufficientStockForReversalError` naming dest project + available qty.
- **T-mat-5** — Concurrent material reversal race: one succeeds, one sees `AlreadyReversedError`.

### Display T-tasks
- **T-disp-1** — Ledger row badge `↔ {OtherProject}` appears on transfer rows in Phase 5 Financials tab.
- **T-disp-2** — Reversal of a transfer shows both `Reversal of` and `↔` badges.
- **T-disp-3** — Tile subtitle: hidden when `transfersIn`/`transfersOut` = 0, shown with formatted amount otherwise. Both per-project tiles and `/financials` overall tiles.

### Auth T-tasks
- **T-auth-1** — FM session: no "Transfers" nav link. `/transfers` direct navigation redirects via `requireAdmin()`. Per-project triggers (Financials toolbar button, Materials row action) not rendered.
- **T-auth-2** — FM session attempting to invoke server actions directly (curl with FM session cookie, or forged form post) returns auth-fail.

### Build/lint gates
- `pnpm tsc --noEmit` passes with zero new errors.
- `pnpm lint` passes with zero new errors.

## File layout

### New files (8)

```
lib/transfers/
  schemas.ts                              Zod input schemas + display types

app/(authed)/transfers/
  page.tsx                                requireAdmin, tabs container
  actions.ts                              4 server actions
  money-transfer-dialog.tsx               client; accepts optional lockedSource
  material-transfer-dialog.tsx            client; accepts lockedSource + lockedMaterial
  reverse-transfer-dialog.tsx             client; shared between money + material
  money-transfers-table.tsx               server; consumes listMoneyTransfers
  material-transfers-table.tsx            server; consumes listMaterialTransfers
```

(Date-range filter component: reuse Phase 5's if generic enough; otherwise add a 9th file. Implementation plan decides.)

### Modified files (9)

```
lib/transactions/schemas.ts        + transferGroupId on Transaction
lib/transactions/repository.ts     + createMoneyTransfer, reverseMoneyTransfer,
                                     listMoneyTransfers; extend computeTotals +
                                     listCrossProjectTotals to return transfersIn/Out;
                                     + TransferNotFoundError, AlreadyReversedError,
                                       CannotReverseTransferError

lib/materials/schemas.ts           + transferGroupId, reversalOf on MaterialMovement
lib/materials/repository.ts        + createMaterialTransfer, reverseMaterialTransfer,
                                     listMaterialTransfers;
                                     + InsufficientStockForReversalError

scripts/init-db.mjs                + 3 sparse indexes

app/(authed)/layout.tsx            + admin-only "Transfers" nav link

app/(authed)/projects/[id]/financials/
  (toolbar component)              + "Transfer money to another project" button
  ledger-table.tsx                 + ↔ {OtherProject} badge on transfer rows
  (tiles component)                + transfersIn/Out subtitle

app/(authed)/projects/[id]/materials/
  (per-row action component)       + "Transfer to another project" action

app/(authed)/financials/
  per-project-table.tsx            + transfersIn/Out subtitle on cells
  (overall tiles component)        + transfersIn/Out subtitle
```

Exact filenames for the Phase 5 toolbar/ledger-table/tiles components and the Phase 4 per-row-action component will be confirmed during the writing-plans step (each is read before prescribing edits).

### Files NOT changed
- Auth/middleware files (`proxy.ts`, `lib/auth/*`).
- `lib/db/client.ts`.
- Phase 5's `voidTransaction` / `reverseTransaction` (they already reject transfer categories correctly).
- Phase 4's `logConsumption` / `logReturn` / `recordPurchase` (transfers use parallel code paths, not modifications to these).

## Surface size summary

- 3 schema field additions (1 to `transactions`, 2 to `materialMovements`).
- 3 new sparse indexes.
- 6 new repository functions (3 per domain repo).
- 4 new server actions.
- 4 new error classes.
- 1 modified aggregation surface (Phase 5's `FinancialTotals` gains `transfersIn`/`transfersOut`).
- 8 new files, 9 modified files.
- 1 new top-level route + nav link.
- 2 per-project trigger additions.
- 1 ledger badge + 2 tile subtitles (per-project + global).

Smaller surface than Phase 5 — Phase 6 reuses Phase 5's tile/ledger/dialog infrastructure heavily.
