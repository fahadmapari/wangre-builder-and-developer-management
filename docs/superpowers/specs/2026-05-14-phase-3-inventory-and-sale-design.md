# Phase 3 — Inventory & Sale (design)

**Date:** 2026-05-14
**Status:** Approved (brainstorm). Implementation plan pending.
**Depends on:** Phase 1 (auth, Mongo client, server-side guards) and Phase 2 (projects, units) — both already merged to local master.

## Goal

Admins can mark a unit sold (atomically updating the `units` doc and inserting a linked `transactions` ledger row) and can unmark it (voiding the ledger row, restoring the unit). Both roles can view a filterable Inventory tab showing every unit's current state. The project detail header's `Sold` and `Revenue` tiles populate from live queries.

## Non-goals (explicitly deferred)

- Editing a non-voided sale's details (price/buyer/date). Use unmark + re-mark for v1.
- Editing inventory metadata (areaSqft, listed salePrice, per-unit notes). Phase 7 polish.
- Bulk operations on units.
- Per-buyer or per-period reports / CSV export. Phase 5+.
- Multi-currency (INR hardcoded).
- Materials tab and Financials tab — placeholders unchanged.

## Convention update

Phase 2 locked in "append-only ledger; transactions rows never edited or deleted." Phase 3 softens to:

> **Transactions rows are never deleted. Corrections happen via the `voided` flag, with `voidedAt` and `voidedBy` recorded. The original row is preserved.**

Phase 5's reversing-entry pattern remains for non-sale corrections (expense adjustments, transfer reposts).

## Data model

### `transactions` collection (new)

```ts
type TransactionKind = "income" | "expense"
type TransactionCategory =
  | "sale"
  | "purchase"
  | "transfer_in"
  | "transfer_out"
  | "adhoc"

type Transaction = {
  _id: ObjectId
  projectId: ObjectId
  unitId: ObjectId | null         // null reserved for Phase 5+ non-unit txns; Phase 3 always sets it
  kind: TransactionKind           // Phase 3 only writes "income"
  category: TransactionCategory   // Phase 3 only writes "sale"; full enum declared now
  amount: number                  // whole INR, > 0
  currency: "INR"                 // hardcoded for v1
  description: string             // auto-generated default, user-editable
  occurredAt: Date                // user-supplied sale date (may be backdated)
  buyerName?: string              // denormalized for sales — survives void
  notes?: string                  // optional sale context, 0–2000 chars
  voided?: boolean                // set on unmark-sold
  voidedAt?: Date
  voidedBy?: ObjectId
  createdBy: ObjectId
  createdAt: Date
}
```

Indexes:
- `{ projectId: 1, occurredAt: -1 }` — Phase 5 ledger ordering by date.
- `{ projectId: 1, kind: 1, voided: 1 }` — Revenue aggregate (`$match` covered, $sum efficient).
- `{ unitId: 1, voided: 1 }` — unmark-sold needs the active sale row for a unit.

### `units` collection — mutations only (no schema change)

Phase 2 pre-declared `salePrice`, `soldAt`, `soldPriceTotal`, `buyerName` as optional, so no migration needed.

- **Mark sold sets:** `status: "sold"`, `soldAt`, `soldPriceTotal`, `buyerName`, `updatedAt`.
- **Unmark sold clears:** `status: "available"`, `$unset` `soldAt`, `soldPriceTotal`, `buyerName`; set `updatedAt`.

`unit.salePrice` (the "listed price" from the Phase 2 schema) stays untouched by Phase 3 — Phase 2 left it 0 and no edit-unit UI exists yet. The actual sale price is recorded in `soldPriceTotal` and on the `transactions` row.

## Pages & routes

No new routes. Phase 3 swaps the Inventory tab placeholder for the real component and lights up the header tiles.

| Route | Change |
|---|---|
| `/projects/[id]` | Header tiles `Sold` and `Revenue` populate from live queries (no longer "—"). |
| `/projects/[id]` Inventory tab | Replace placeholder with filterable units table. |
| `/projects/[id]` Materials / Financials tabs | Unchanged placeholders. |

### Inventory tab — UI

Composition: the project detail `page.tsx` (server) reads the page's `searchParams`, renders the InventoryFilters (client) and InventoryTable (server) as siblings, and passes them as a `children` prop into the client `<ProjectTabs>` for the Inventory tab. This is the Next.js App Router pattern for server children inside client wrappers — the client component receives them as already-rendered React elements.

```tsx
// app/(authed)/projects/[id]/page.tsx (server)
const sp = await searchParams
<ProjectTabs
  role={user.role}
  inventory={
    <>
      <InventoryFilters />          {/* client */}
      <InventoryTable projectId={id} filters={parseFilters(sp)} role={user.role} />  {/* server */}
    </>
  }
/>
```

- **Server component** at `app/(authed)/projects/[id]/inventory/inventory-table.tsx`. Reads units filtered by selected type/status. Default (no params) → `type=apartment, status=available`.
- **Client wrapper** at `app/(authed)/projects/[id]/inventory/inventory-filters.tsx` holds the filter chips (`Type: Apartment | Parking | All`, `Status: Available | Sold | All`). Reads current state via `useSearchParams()`. Changing a chip calls `router.replace("?type=...&status=...")`; the page (server) re-renders with new data.
- **Sort:** `floor` asc, then `number` asc. Single Mongo query: `units.find({projectId, ...filters}).sort({floor:1, number:1})`. (Apartments are 3-digit per Phase 2's 100s convention, so lex-sort on `number` is equivalent within a floor; explicit floor-asc keeps it robust if numbering grows.)
- **Table columns:**
  - Number (`101`, `P001`)
  - Type (apartment / parking)
  - Floor
  - Status badge (available / sold)
  - Buyer (sold rows only)
  - Sold price (sold rows only) — Indian formatting via `Intl.NumberFormat("en-IN")`
  - Sold date (sold rows only)
  - Action (admin only): `[Mark sold]` if available, `[Unmark]` if sold
- **Empty filter result:** "No units match these filters."
- **Floor manager view:** Action column is omitted entirely (column dropped, not just buttons hidden).

### Header tiles

Project detail page (server component) parallel-fetches three reads:

```ts
const [project, soldCount, revenue] = await Promise.all([
  getProject(id),
  countSoldUnits(id),
  sumProjectRevenue(id),
])
```

- `countSoldUnits(projectId)` → `units.countDocuments({ projectId, status: "sold" })`.
- `sumProjectRevenue(projectId)` → `transactions.aggregate([{$match:{projectId, kind:"income", voided:{$ne:true}}}, {$group:{_id:null, total:{$sum:"$amount"}}}])`. Returns 0 if no rows.

Tile rendering:
- **Sold** — `{soldCount} / {totalUnits + totalParkings}`
- **Revenue** — `₹{revenue.toLocaleString("en-IN")}`

Both roles see both tiles. The "no money for FM" convention applies to the Financials tab (full ledger), not to summary tiles.

## Mark-sold flow

1. Admin clicks `[Mark sold]` on an available unit row → dialog opens, scoped to that unit.
2. **Dialog fields:**
   - Read-only header: e.g. `Apartment 301` / `Parking P004`.
   - `salePrice` — required integer INR, `> 0`, `≤ 100_000_000` (₹10 crore cap, Zod-validated; sanity guard not a hard business rule).
   - `buyerName` — required, trimmed, 1–200 chars.
   - `saleDate` — defaults today, editable, any date (no future-block; backdated registrations are normal in Indian real estate).
   - `description` — auto-populated as `Sale of Apartment 301 to {buyerName}` on buyer-name blur; user can edit.
   - `notes` — optional, 0–2000 chars.
3. Submit → server action `markUnitSold(input)`:
   - `await requireAdmin()` first.
   - Zod validation. On failure, return `{ ok: false, error, field }`.
   - **Defense-in-depth pre-check** (outside the transaction): `findOne({_id: unitId, projectId})` — confirms unit exists and belongs to claimed project. Reject if missing.
   - `client.startSession()` + `session.withTransaction`:
     - **Conditional update** (atomic claim): `units.updateOne({_id, status: "available"}, {$set: {status: "sold", soldAt, soldPriceTotal, buyerName, updatedAt}}, {session})`. If `matchedCount === 0`, throw an in-transaction error → automatic abort. Blocks double-click and concurrent-admin races.
     - `transactions.insertOne({...}, {session})` with `kind: "income"`, `category: "sale"`, `amount: salePrice`, `unitId`, `buyerName`, `occurredAt: saleDate`, `description`, `notes`, `createdBy`, `createdAt`.
   - `revalidatePath("/projects/[id]")` on success.
   - Return `{ ok: true, data: { transactionId } }`.
4. Dialog closes on success, table re-renders, row flips to sold state with `[Unmark]` button.
5. **Dialog remount fix carried over from Phase 2:** `<MarkSoldDialog key={open ? "open-" + unitId : "closed"} ... />` so internal `useState` resets cleanly each open.

## Unmark-sold flow

1. Admin clicks `[Unmark]` on a sold row → confirm dialog (`AlertDialog`, single OK/Cancel — no typed-name check, per brainstorm).
2. Confirms → server action `unmarkUnitSold(unitId)`:
   - `await requireAdmin()` first.
   - `client.startSession()` + `session.withTransaction`:
     - Conditional update: `units.updateOne({_id, status: "sold"}, {$set: {status: "available", updatedAt}, $unset: {soldAt: "", soldPriceTotal: "", buyerName: ""}}, {session})`. If `matchedCount === 0` → abort.
     - Soft-void the active sale transaction for this unit: `transactions.updateOne({unitId, kind: "income", category: "sale", voided: {$ne: true}}, {$set: {voided: true, voidedAt: now, voidedBy: userId}}, {session})`. **If `matchedCount === 0`, log a warning but do NOT abort** — the unit's state is the source of truth for inventory; missing ledger row is a data-integrity issue surfaced in logs but should not block recovery. Edge case: someone deleted the ledger row in `mongosh`.
   - `revalidatePath("/projects/[id]")` on success.

## Components & files

### Create

- `app/(authed)/projects/[id]/inventory/inventory-table.tsx` — server component, reads filtered units, renders table.
- `app/(authed)/projects/[id]/inventory/inventory-filters.tsx` — client component, filter chips with URL sync.
- `app/(authed)/projects/[id]/inventory/mark-sold-dialog.tsx` — client form for marking sold.
- `app/(authed)/projects/[id]/inventory/unmark-confirm-dialog.tsx` — client AlertDialog.
- `app/(authed)/projects/[id]/inventory/actions.ts` — `markUnitSold`, `unmarkUnitSold` server actions.
- `lib/transactions/schemas.ts` — Zod for `MarkUnitSoldInputSchema`, `Transaction` type, kind/category enums.
- `lib/transactions/repository.ts` — `markUnitSold(input, userId)`, `unmarkUnitSold(unitId, userId)`, `sumProjectRevenue(projectId)`.
- `lib/projects/repository.ts` — add `countSoldUnits(projectId)`, `listUnitsForProject(projectId, filters)`.

### Modify

- `app/(authed)/projects/[id]/page.tsx` — parallel-fetch project + soldCount + revenue, render real tile values.
- `app/(authed)/projects/[id]/project-tabs.tsx` — add an `inventory?: ReactNode` prop; render `{inventory}` inside the Inventory `<TabsContent>` instead of the placeholder. Materials and Financials placeholders unchanged.
- `scripts/init-db.mjs` — add three `transactions` indexes (idempotent `createIndex` calls).

### Add via `npx shadcn@latest add`

- `alert-dialog` (for unmark confirm).

No toast component is introduced in Phase 3. Errors surface inline in dialogs; success paths rely on `revalidatePath` to refresh the table. A toast/sonner dependency can be added in Phase 7 if non-blocking feedback becomes important.

## Role enforcement

| Action | Admin | Floor manager |
|---|---|---|
| View Inventory tab | ✓ | ✓ |
| See Action column / `[Mark sold]` / `[Unmark]` buttons | ✓ | hidden (column omitted) |
| Submit `markUnitSold` action | ✓ (`requireAdmin`) | rejected by server guard |
| Submit `unmarkUnitSold` action | ✓ (`requireAdmin`) | rejected by server guard |
| See `Sold` / `Revenue` header tiles | ✓ | ✓ |
| See sold-row columns (buyer, sold price, sold date) | ✓ | ✓ |

**Server-side enforcement is the source of truth.** Every server action and protected page starts with `await requireAuth()` or `await requireAdmin()` as its first executable line.

## Error handling

`ActionResult<T>` discriminated union (same as Phase 2):

```ts
type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: string }
```

- **Zod failure on mark-sold:** `{ ok: false, error: <first issue's message>, field: <path> }`. Dialog highlights the offending input.
- **Unit not found / wrong project:** `{ ok: false, error: "Unit not found. Refresh the page." }`. Dialog stays open with that inline message; user dismisses and reloads.
- **Race lost (`matchedCount === 0` on conditional `units.updateOne`):** transaction aborts → caller returns `{ ok: false, error: "Unit is no longer available — someone else may have just sold it. Refresh and try again." }`. Dialog stays open with that message.
- **Transaction failure (Mongo, network, etc.):** `{ ok: false, error: "Could not record sale. Please try again." }`. Detailed error logged via `console.error("markUnitSold failed", err)`. Never leak driver internals to the client.
- **Auth/role failure:** `requireAdmin()` redirects, never returns. Happens before any user input is processed.
- **Unmark with missing active ledger row:** action returns `{ ok: true }` (unit was successfully restored). Server-side `console.warn("unmarkUnitSold: no active ledger row for unit", unitId)` for audit.

## Verification (manual, like Phases 1–2)

1. **`db:init` idempotency:** `npm run db:init` adds three new `transactions` indexes; re-run logs "already exists" or equivalent for each.
2. **Admin: mark sold happy path:**
   - Open `/projects/<id>` → Inventory tab → defaults to Apartments + Available.
   - Click `[Mark sold]` on `Apt 101` → dialog opens.
   - Submit `salePrice=5000000, buyerName=Ramesh Kumar, saleDate=today, description=auto, notes=blank`.
   - Dialog closes; row 101 shows Sold, Buyer=Ramesh Kumar, Sold price=₹50,00,000, Sold date=today, button=`[Unmark]`.
   - Switch filter to Status=Sold → only 101 shows.
   - Header tile: **Sold** `1 / 16`, **Revenue** `₹50,00,000`.
3. **`mongosh` checks after step 2:**
   - `db.units.findOne({projectId, number: "101"})` → `status:"sold"`, `soldPriceTotal:5000000`, `buyerName:"Ramesh Kumar"`, `soldAt` set.
   - `db.transactions.find({unitId})` returns one row: `kind:"income"`, `category:"sale"`, `amount:5000000`, `buyerName:"Ramesh Kumar"`, `voided` absent.
4. **Validation errors:** Sale price 0 → inline error, dialog open, no writes. Empty buyer name → inline error, dialog open, no writes.
5. **Atomicity smoke test:** temporarily `throw new Error("synthetic")` between the `units.updateOne` and `transactions.insertOne` inside `markUnitSold`. Attempt to mark Apt 102. Confirm `db.units.findOne({number:"102"}).status === "available"` and no transactions row inserted. Remove throw.
6. **Race smoke test:** open the mark-sold dialog for Apt 103. In `mongosh`, run `db.units.updateOne({projectId, number:"103"}, {$set:{status:"sold"}})`. Submit the dialog. Should return the "Unit is no longer available..." message, no transactions row inserted.
7. **Unmark happy path:**
   - Click `[Unmark]` on the sold Apt 101 → confirm → row flips to Available, buyer/price/date columns blank.
   - `mongosh`: `db.units.findOne({number:"101"})` shows `status:"available"`, no `soldAt`/`soldPriceTotal`/`buyerName` fields.
   - `mongosh`: `db.transactions.findOne({unitId})` shows `voided:true`, `voidedAt`, `voidedBy` populated. Original row preserved.
   - Header tile: **Sold** `0 / 16`, **Revenue** `₹0`.
8. **Re-mark after unmark:** mark Apt 101 sold again at a different price. `mongosh` shows two transactions for the unit: one voided, one active. `sumProjectRevenue` includes only the active one.
9. **Floor manager flow:**
   - Sign in as a non-admin. Open `/projects/<id>`.
   - Inventory tab visible; Action column absent; sold rows show buyer/price/date.
   - Header tiles visible.
   - No `[Mark sold]` / `[Unmark]` buttons anywhere.
10. **Direct action call as FM:** in DevTools, invoke the `markUnitSold` server action with valid payload. Should redirect or error — never succeed.

## Open risks / things to watch

1. **Server component inside client Tabs.** First time this pattern appears in the repo. Verify hot-reload behaves and that re-rendering on URL filter change doesn't flicker. Fallback (if problems): split the Inventory tab into its own route segment with server-driven tabs; defer to Phase 7.
2. **Race on simultaneous mark-sold for the same unit.** Solved by the conditional `updateOne({_id, status: "available"})` inside the transaction. Smoke-tested in verification step 6.
3. **Indian number formatting.** `Intl.NumberFormat("en-IN")` produces `50,00,000` (lakhs) not `5,000,000`. Verify behavior in Node 22 runtime; fallback is a manual format helper if locale data missing.
4. **Aggregate cost on revenue tile.** Trivial today (<100 rows per project). If a project ever has 10k+ transactions, consider a rollup field on the project doc; not blocking for v1.
5. **`transactions.voided` sparse semantics.** The compound index `{projectId, kind, voided}` covers `{voided: {$ne: true}}` queries correctly — Mongo treats missing as a value during indexing. Verified pattern; document in the index file.
6. **Backdated `occurredAt` and revenue.** Revenue tile sums all non-voided income regardless of `occurredAt`. Phase 5 will likely want a date-range filter; the index `{projectId, occurredAt: -1}` is pre-positioned for that.
7. **Mongo Atlas transaction warm-up.** Carries over from Phase 2 — first transaction after a long idle period may take ~200ms. Not a correctness issue.

## What Phase 3 leaves for Phase 4

- Materials tab still placeholder.
- Financials tab still placeholder (Phase 5 will read from `transactions` collection — schema and indexes are already in place).
- No editing of unit listing fields (`areaSqft`, listed `salePrice`, per-unit notes).
- No per-buyer or per-period reports.
- No CSV export.
- The "non-unit transaction" code path (`unitId: null`) is reserved in the schema but never exercised by Phase 3 — Phase 5's ad-hoc income/expense flows will activate it.
