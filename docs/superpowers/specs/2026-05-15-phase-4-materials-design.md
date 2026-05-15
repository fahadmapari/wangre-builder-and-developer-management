# Phase 4 — Materials (design)

**Date:** 2026-05-15
**Status:** Approved (brainstorm). Implementation plan pending.
**Depends on:** Phase 1 (auth, Mongo client, server-side guards), Phase 2 (projects), Phase 3 (transactions ledger). All merged to local master.

## Goal

Track construction-material purchases and consumption per project. Admins record purchases (writes an expense row to the existing `transactions` ledger); both admins and floor managers log consumption and returns against per-project stock counters. A global materials catalog is managed by admins, with floor managers able to add (not edit) new entries in-context.

This is the first phase that writes `kind: "expense"` rows to the `transactions` ledger.

## Non-goals (explicitly deferred)

- Movement-level void / undo. Corrections in Phase 4 are compensating consumption/return rows. Real reversing-entry mechanism arrives in Phase 5.
- Cross-project warehouse view (`/materials` top-level aggregate). Phase 7 polish.
- CSV export of movement history. Phase 7 polish.
- Low-stock alerts, reorder thresholds, restock recommendations.
- Material archive / soft-delete on the catalog (rename works for now).
- Bulk operations (no bulk catalog import, no bulk consumption logging).
- Unit conversions across materials (each catalog entry has one unit; purchases and consumption are in that unit).
- Construction-phases entity for consumption attribution. Free-text `purpose` only.
- Photos / attachments on movements.
- URL-synced filters on the materials table. Phase 7 polish.
- Materials count header tile on project detail.
- Materials count or stock-value figures on the admin dashboard / `/projects` list.

## Locked-in conventions reused from Phase 3

- Server-side role enforcement is the first executable line of every server action (`requireAuth` / `requireAdmin`).
- Multi-document writes wrap in `client.startSession()` + `session.withTransaction()`; the session is threaded into every write inside.
- Append-only with soft-void. Rows are never deleted. Corrections happen via `voided` flag (when Phase 5 lands) or via compensating rows.
- `createdBy: ObjectId` on every domain doc; sourced from `(await requireAuth()).id` converted via `new ObjectId(userId)`.
- Server actions return `ActionResult<T>` discriminated union: `{ ok: true; data: T } | { ok: false; error: string; field?: string }`. Auth / role failures redirect (via `requireX`) rather than returning a result.
- Currency hardcoded as `"INR"`. Whole rupees on `transactions.amount` (Phase 3 enforced `int()`; Phase 4 honors it by rounding `qty × unitPrice` server-side).
- Dialog state-reset key trick (`<Dialog key={open ? "open-${id}" : "closed"} />`) for any new form dialog.

## Permission matrix

| Action | admin | floor_manager |
|---|---|---|
| View global catalog (without prices) | yes | yes |
| View global catalog with `unitPrice` column | yes | no (server-side stripped) |
| Add new material to catalog | yes | yes (no `unitPrice` field on FM form) |
| Edit existing catalog entry (name, unit, price, notes) | yes | no |
| Visit `/catalog` admin page | yes | no (redirect) |
| View project Materials tab | yes | yes |
| View per-project stock-on-hand | yes | yes |
| Record purchase (writes `transactions` expense row) | yes | no |
| Log consumption | yes | yes |
| Log return | yes | yes |
| View movement history (with `amount` column) | yes | no (`amount` stripped) |
| View movement history (qty + purpose only) | yes | yes |

`unitPrice` and `amount` are stripped server-side before serialization for floor-manager sessions — UI hiding is convenience only.

## Data model

### `materials` collection (new — global catalog)

```ts
type MaterialUnit =
  | "bag" | "kg" | "ton" | "m3" | "m2" | "m"
  | "liter" | "piece" | "sheet" | "box" | "roll"
  | "other"

type Material = {
  _id: ObjectId
  name: string                 // trimmed; not enforced unique (case-insensitive index for browse)
  unit: MaterialUnit
  unitOther?: string           // populated when unit === "other"; the display label
  unitPrice: number | null     // INR per unit; decimals allowed; null when FM-created and admin hasn't priced
  notes?: string               // 0–2000 chars
  createdBy: ObjectId
  createdAt: Date
  updatedAt: Date
}
```

Indexes:
- `{ name: 1 }` with case-insensitive collation `{ locale: "en", strength: 2 }` — browse / search by name.

Notes:
- No `projectId`; this is a global table.
- `unitPrice` allows decimals (e.g., ₹47.50/kg). The `transactions.amount` written by `recordPurchase` is rounded to whole rupees to preserve the Phase 3 invariant.
- Name uniqueness is *not* enforced at the index level; the catalog form warns on near-duplicates in a follow-up phase. Phase 4 accepts that two rows with similar names can coexist.

### `projectMaterials` collection (new — per-project stock counter)

```ts
type ProjectMaterial = {
  _id: ObjectId
  projectId: ObjectId
  materialId: ObjectId
  stockOnHand: number          // decimals allowed (m³, kg); non-negative under all Phase 4 flows
                               // (consumption uses conditional update; returns only increment; no
                               // void path until Phase 5)
  createdAt: Date
  updatedAt: Date
}
```

Indexes:
- `{ projectId: 1, materialId: 1 }` **unique** — the natural key; supports upserts.
- `{ projectId: 1 }` — Materials tab list query.

Notes:
- Lifecycle: lazily upserted by `recordPurchase` and `logReturn` on first movement for a (projectId, materialId) pair. No standalone "track this material for this project" action.
- No `createdBy` — this is a derived cache, not a user-authored domain entity. Authorship lives on each `materialMovements` row.
- Invariant: `projectMaterials.stockOnHand` equals `sum(materialMovements.qty where kind="in" and voided !== true) - sum(materialMovements.qty where kind="out" and voided !== true)` for that `(projectId, materialId)`. Phase 4 has no void path, so the right-hand side simplifies to plain sums; the equality must hold once void lands in Phase 5.

### `materialMovements` collection (new — append-only event log)

```ts
type MovementKind = "in" | "out"
type MovementCategory =
  | "purchase"     // in. Phase 4 writes.
  | "return"       // in. Phase 4 writes.
  | "consumption"  // out. Phase 4 writes.
  | "transfer_in"  // in. Phase 6 writes.
  | "transfer_out" // out. Phase 6 writes.

type MaterialMovement = {
  _id: ObjectId
  projectId: ObjectId
  materialId: ObjectId
  kind: MovementKind
  category: MovementCategory
  qty: number                    // always positive; decimals allowed
  unitPriceAtMovement?: number   // purchase only; immutable historical record (decimals allowed)
  amount?: number                // purchase only; whole INR, == round(qty * unitPriceAtMovement)
  purpose?: string               // required for consumption; optional for return; absent for purchase
  notes?: string                 // 0–2000 chars
  transactionId?: ObjectId | null // FK to transactions row; populated for purchase only
  voided?: boolean               // Phase 5 territory; declared upfront
  voidedAt?: Date
  voidedBy?: ObjectId
  occurredAt: Date               // user-supplied event date (may be backdated)
  createdBy: ObjectId
  createdAt: Date
}
```

Indexes:
- `{ projectId: 1, materialId: 1, occurredAt: -1 }` — movement-sheet drilldown, time-range scans.
- `{ projectId: 1, kind: 1, voided: 1 }` — aggregate by in/out for stock reconciliation.
- `{ transactionId: 1 }` sparse — orphan check + Phase 5 ledger join.

Full `category` enum is declared upfront so Phase 6 (transfers) needs no migration. Phase 3 used the same pattern.

### `transactions` collection — reuse without schema change

Phase 4 is the first writer of `kind: "expense"` rows. Schema already supports it (Phase 3 declared the full kind + category enum). Purchase rows set:

- `kind: "expense"`
- `category: "purchase"`
- `unitId: null` (Phase 3 reserved this for non-unit transactions; Phase 4 uses it)
- `amount: round(qty × unitPriceAtMovement)` — whole INR, preserves the Phase 3 `int()` invariant
- `description: "Purchase: ${material.name}"` (auto-generated; user-editable in the form)
- `notes: input.notes` (passthrough)
- `occurredAt: input.occurredAt`
- `projectId`, `createdBy`, `currency: "INR"`, `createdAt`

The `materialMovements.transactionId` FK closes the loop. Voiding the transactions row in a future correction must also void the linked movement row (out of scope for Phase 4; spec for Phase 5).

## Server actions

### `app/(authed)/catalog/actions.ts`

**`createMaterial(input)`** — both roles.
- `requireAuth()`.
- Zod-validate `{ name, unit, unitOther?, unitPrice? (admin only), notes? }`. For FM submissions, `unitPrice` is stripped before validation (defense-in-depth — the FM form doesn't send it).
- Single `insertOne` into `materials`. No Mongo transaction needed.
- Returns `ActionResult<{ materialId: string }>`.

**`updateMaterial(input)`** — admin only.
- `requireAdmin()`.
- Zod-validate partial of name / unit / unitOther / unitPrice / notes.
- **Unit-change guard:** if the patch changes `unit` or `unitOther`, verify no `materialMovements` exist for this `materialId` before applying — otherwise historical qty values silently change meaning (a movement of `qty: 10` stored when unit was "bag" would now read as "kg"). Server returns `{ ok: false, error: "Cannot change unit after movements exist" }` if the guard trips. Name / unitPrice / notes are always editable.
- Single `updateOne` with `$set` and `updatedAt: new Date()`. No Mongo transaction needed (the guard check + update don't need atomicity across collections; a race is benign — worst case, admin gets a stale "no movements" read and the update goes through just as the first movement is inserted, which is rare and self-correcting on next refresh).

There is no `deleteMaterial` in Phase 4.

### `app/(authed)/projects/[id]/materials/actions.ts`

**`recordPurchase(input)`** — admin only. **Atomic two-collection write + ledger.**

1. `requireAdmin()`.
2. Zod-validate `{ projectId, materialId, qty (>0), unitPriceAtMovement (>0), occurredAt, notes? }`.
3. Compute `amount = Math.round(qty * unitPriceAtMovement)`. (Standard half-away-from-zero rounding via `Math.round`.)
4. `client.startSession()` → `session.withTransaction(async () => { ... })`:
   - `projectMaterials.updateOne({ projectId, materialId }, { $inc: { stockOnHand: qty }, $set: { updatedAt: now }, $setOnInsert: { projectId, materialId, createdAt: now } }, { session, upsert: true })`.
   - Insert one `transactions` row (per the schema above). Capture `insertedId` → `transactionId`.
   - Insert one `materialMovements` row with `transactionId` populated, `kind: "in"`, `category: "purchase"`.
5. `endSession()` in finally. `revalidatePath("/projects/${projectId}")`.

**`logConsumption(input)`** — both roles. **Race-safe atomic decrement.**

1. `requireAuth()`. (Phase 4's first action that is *not* gated to admin.)
2. Zod-validate `{ projectId, materialId, qty (>0), purpose (required, 1–500 chars), occurredAt, notes? }`.
3. `withTransaction`:
   - `findOneAndUpdate({ projectId, materialId, stockOnHand: { $gte: qty } }, { $inc: { stockOnHand: -qty }, $set: { updatedAt: now } }, { session, returnDocument: "after" })`.
   - If the conditional update did not match (no `projectMaterials` row at all, or stock < qty), throw `InsufficientStockError(currentStock)`. The transaction aborts; no movement row is written.
   - Insert one `materialMovements` row, `kind: "out"`, `category: "consumption"`, with `purpose` populated. No `transactionId`, no `amount`.
4. `revalidatePath` on success.

**`logReturn(input)`** — both roles. **Atomic increment, no ledger.**

1. `requireAuth()`.
2. Zod-validate `{ projectId, materialId, qty (>0), purpose? (optional), occurredAt, notes? }`.
3. `withTransaction`:
   - Upsert `projectMaterials` row with `$inc: { stockOnHand: qty }`. The upsert tolerates returns recorded before any matching purchase row (real-world data is messy — pre-existing site stock, returns from other projects, late data entry). The audit trail in `materialMovements` is the source of truth.
   - Insert one `materialMovements` row, `kind: "in"`, `category: "return"`. No `transactionId`, no `amount`.
4. `revalidatePath` on success.

### Movement-level void — **declared but not implemented**

Schema reserves `voided` / `voidedAt` / `voidedBy` on `materialMovements`. No Phase 4 server action writes them. Corrections happen via compensating return/consumption rows with a `notes` field explaining the correction. Phase 5 introduces reversing entries as the proper correction mechanism for both Phase 3 sales and Phase 4 purchases.

### Errors

- `InsufficientStockError(currentStock: number)` — distinct class, mirrors Phase 3's `UnitNotAvailableError`. Server action returns `{ ok: false, error: "Only ${currentStock} ${unit} available" }`.
- `MaterialNotFoundError`, `ProjectNotFoundError` — defense-in-depth; happy path can't hit them because the form only offers valid options.

## Pages, routes, components

### `/projects/[id]` Materials tab (existing route; new content)

Same hybrid pattern as Phase 3's Inventory tab. Page renders a server materials table + client action triggers as siblings, passed as `materials` ReactNode prop into `<ProjectTabs>`.

**Modify:**
- `app/(authed)/projects/[id]/project-tabs.tsx` — replace Materials `<Placeholder>` with a `materials?: ReactNode` prop following the existing `inventory` precedent.
- `app/(authed)/projects/[id]/page.tsx` — fetch the per-project materials list (`projectMaterials` joined to `materials`) inside the existing `Promise.all`. Pass into `<ProjectTabs materials={...} />`.

**Create:**
- `app/(authed)/projects/[id]/materials/materials-table.tsx` (server) — joins `projectMaterials` to `materials` for this project. Columns:
  - Both roles: Material name · Unit · Stock-on-hand · Last movement at
  - Admin only: + Total spent (sum of non-voided purchase `amount` for this project + material)
  - Both roles: Actions cell — "Record purchase" (admin only), "Log consumption", "Log return", "History"
- `app/(authed)/projects/[id]/materials/record-purchase-dialog.tsx` (client, admin-only — server action also gates).
- `app/(authed)/projects/[id]/materials/log-consumption-dialog.tsx` (client, both roles).
- `app/(authed)/projects/[id]/materials/log-return-dialog.tsx` (client, both roles).
- `app/(authed)/projects/[id]/materials/add-material-dialog.tsx` (client, both roles) — FM form omits the `unitPrice` field. Two separate component shells share the underlying Zod schema (no role-prop branching in the JSX).
- `app/(authed)/projects/[id]/materials/movements-sheet.tsx` (client) — Sheet primitive (shadcn) opens on a row's "History" action. Lists this project's `materialMovements` for the selected material, newest first. Admin sees `amount` column; FM does not.

All dialogs use the `<Dialog key={open ? "open-${materialId}" : "closed"} />` reset trick.

### `/catalog` (new top-level route, admin-only)

**Create:**
- `app/(authed)/catalog/page.tsx` (server) — `requireAdmin()` first line. Renders the catalog table.
- `app/(authed)/catalog/catalog-table.tsx` (server) — columns: Name · Unit · Unit price · Notes · Created · Updated. Row click opens edit dialog.
- `app/(authed)/catalog/new-material-dialog.tsx` (client) — admin form (name, unit + optional unitOther, unitPrice, notes).
- `app/(authed)/catalog/edit-material-dialog.tsx` (client) — pre-filled patch form.

Floor managers hitting `/catalog` are redirected by `requireAdmin()` (server-side enforcement; Auth.js role already on session).

### Navigation

Admin-only "Catalog" link added to the authed layout's nav. FM sessions don't render the link. The route still server-enforces via `requireAdmin()`; link visibility is a convenience.

## Indexes — `scripts/init-db.mjs`

Append the following Phase 4 block:

```js
// Phase 4 — materials catalog (global)
await db.collection("materials").createIndex(
  { name: 1 },
  { collation: { locale: "en", strength: 2 } }
)

// Phase 4 — per-project stock counter
await db.collection("projectMaterials").createIndex(
  { projectId: 1, materialId: 1 },
  { unique: true }
)
await db.collection("projectMaterials").createIndex({ projectId: 1 })

// Phase 4 — movement event log
await db.collection("materialMovements").createIndex(
  { projectId: 1, materialId: 1, occurredAt: -1 }
)
await db.collection("materialMovements").createIndex(
  { projectId: 1, kind: 1, voided: 1 }
)
await db.collection("materialMovements").createIndex(
  { transactionId: 1 },
  { sparse: true }
)
```

## Atomic invariants and verification

For the Phase 4 manual verification step (analogous to Phase 3's T12):

1. **Stock counter equals the movement sum.** For a chosen (projectId, materialId), `db.projectMaterials.findOne({...}).stockOnHand` equals `sum(in.qty) - sum(out.qty)` aggregated from `materialMovements`. (Phase 4 has no void; once Phase 5 lands, the aggregate filters `voided !== true`.)
2. **Every purchase movement has a linked transaction.** `db.materialMovements.find({ category: "purchase", transactionId: null }).count() === 0`. Symmetric: every `transactions` row with `category: "purchase"` has at least one `materialMovements` row pointing back (Phase 4 writes a 1:1 pair).
3. **Insufficient-stock smoke test.** With `stockOnHand: 10`, two terminals submit consumption of 8 each via the action. Exactly one succeeds with `InsufficientStockError` returned to the loser. Counter ends at `2`, not `-6`.
4. **Atomicity smoke test on `recordPurchase`.** Inject a throw between the `projectMaterials` upsert and the `transactions` insert; confirm no row appears in either collection and the counter doesn't change. Remove the throw afterward.
5. **`/catalog` access guard.** FM browser hits `/catalog` directly → redirected to `/projects` (not 404, not 403 page). Confirms `requireAdmin` is the boundary.

## Open seams for later phases

- **Phase 5 (Financials).** Purchase rows already in `transactions` with `kind: "expense"`. Phase 5 ledger reads them directly. Reversing entries become the universal correction mechanism — Phase 5 will likely add a `voidMovement` admin action that wraps Phase 5's reversing-entry logic so material corrections and ledger corrections stay in sync.
- **Phase 6 (Inter-project transfers).** `MovementCategory` already includes `transfer_in` / `transfer_out`. Phase 6 writes paired movements (source `transfer_out` + destination `transfer_in`) plus matching `projectMaterials` decrements/increments inside a single `withTransaction`. The destination project's `projectMaterials` row is upserted if missing.
- **Phase 7 (Polish).** URL-synced filters on materials table, CSV export of movement history, low-stock badges on the project tile, the deferred `/materials` top-level warehouse view aggregating stock across projects.

## File map (Phase 4)

**Create:**
- `lib/materials/schemas.ts` — Zod schemas + domain types (Material, ProjectMaterial, MaterialMovement, the action input schemas).
- `lib/materials/repository.ts` — `createMaterial`, `updateMaterial`, `recordPurchase`, `logConsumption`, `logReturn`, read helpers (`listCatalog`, `listProjectMaterials`, `listMovementsForMaterial`), `InsufficientStockError`.
- `app/(authed)/catalog/page.tsx`, `catalog-table.tsx`, `new-material-dialog.tsx`, `edit-material-dialog.tsx`, `actions.ts`.
- `app/(authed)/projects/[id]/materials/materials-table.tsx`, `record-purchase-dialog.tsx`, `log-consumption-dialog.tsx`, `log-return-dialog.tsx`, `add-material-dialog.tsx`, `movements-sheet.tsx`, `actions.ts`.

**Modify:**
- `app/(authed)/projects/[id]/page.tsx` — add materials fetch to the `Promise.all`; pass `materials` prop.
- `app/(authed)/projects/[id]/project-tabs.tsx` — accept `materials?: ReactNode`; render in Materials tab content.
- `app/(authed)/layout.tsx` (or wherever the authed nav lives) — add admin-only "Catalog" link.
- `scripts/init-db.mjs` — append the Phase 4 index block.
- `components/ui/sheet.tsx` — `npx shadcn@latest add sheet` if not already present (for the movement drilldown).
