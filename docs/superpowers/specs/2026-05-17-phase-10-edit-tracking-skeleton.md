# Phase 10 — Edit Tracking (updatedBy fields) (skeleton)

**Date:** 2026-05-17
**Status:** **Skeleton — not yet brainstormed.** Open design decisions noted inline. Requires a brainstorm before any implementation plan.
**Depends on:** Phases 1–7. Phase 7 merged to local master (HEAD `c1b126b`).

## Goal

Close a known gap from Phase 7's audit-log design: mutable entities (`projects`, `units`, `materials` catalog, `projectMaterials`) currently have `createdBy` but no `updatedBy` / `lastUpdatedBy` field. So edits like "renamed Skyline Towers", "changed Unit 304's sale price", "updated the cement unit price in the catalog" are anonymous in the audit log. The Phase 7 spec explicitly deferred this with "Edits to projects/units/materials remain anonymous. Adding updatedBy is a future-phase decision."

This phase adds `lastUpdatedBy: ObjectId` + `lastUpdatedAt: Date` to the relevant entities, wires every mutation site to populate them, and extends the audit log to emit `updated` events.

## Non-goals (best-guess; confirm during brainstorm)

- A full event-sourced audit collection. Stays with the read-from-existing-fields pattern from Phase 7.
- Backfill of historical edits — those events remain anonymous forever (no data to recover the editor's identity).
- Field-level diff tracking ("price changed from ₹50L to ₹55L"). The new `updated` event only records "who edited what entity when", not what changed.
- Edit history on append-only entities (transactions, materialMovements). These don't have updates — corrections go through reverse/void.

## Key design decisions still TBD

1. **Entities in scope.**
   - `projects` (notes, totals, status) — yes.
   - `units` (sale price, area, notes, sold/unsold state) — yes? Note that `markUnitSold` already creates a transaction audit event; `unmarkUnitSold` does too. So tracking unit edits adds genuine signal only for non-sale fields.
   - `materials` catalog (name, unit, unitPrice, notes) — yes.
   - `projectMaterials.stockOnHand` — NO. This is a derived running total, mutated by every movement; tracking "who last touched stockOnHand" is misleading.
   - Other denormalized / cached state? (Phase 5 totals were on-the-fly; no others.)

2. **Schema migration.** Adding optional fields is non-breaking. But existing docs have no value — they look "never updated". How to display that in the audit log? Skip the event entirely if both fields are absent? Show "Updated (creator unknown)"?

3. **Event semantics.** Does every PUT/PATCH-like mutation emit ONE `updated` event? Or only if specific fields changed (e.g., suppress if only `notes` changed because notes aren't load-bearing)?

4. **Summary content.** "Updated project: Skyline Towers" — generic. Or per-entity-type richer summaries? The latter requires more code per entity.

5. **Filter / display in audit.**
   - Add `"updated"` to `AuditAction` enum.
   - `<AuditTable>` and filter form get a new action variant.
   - `summarize*` helpers in `lib/audit/repository.ts` extended.
   - `fetchProjectEvents` / `fetchUnitEvents` / `fetchMaterialEvents` extended to also query `$or: [{createdAt}, {lastUpdatedAt}]`.

6. **Per-row History sheet.** Should `listEntityHistory` also surface "last updated by X at T"? Trivial to add once the fields exist.

7. **Atomicity.** Every mutation that updates these entities must update `lastUpdatedBy` + `lastUpdatedAt` in the same write. Should be a single `$set` on `findOneAndUpdate`. Risk: forget to update — easy to miss in code review. Helper? Convention?

8. **Concurrent edits.** If two admins edit the same project simultaneously, last-writer-wins (current behavior). Lock / optimistic concurrency? Probably out of scope.

## Rough scope estimate

**~10-15 files.**

- Modified: `lib/projects/schemas.ts` (Project, Unit types), `lib/materials/schemas.ts` (Material type) — add `lastUpdatedBy?: ObjectId`, `lastUpdatedAt?: Date`. Note: `updatedAt` already exists on most types; this is `lastUpdatedBy` specifically.
- Modified: every action that mutates these entities — populate the fields. Need to enumerate (probably 4-8 actions across `app/(authed)/projects/`, `app/(authed)/catalog/`, `app/(authed)/projects/[id]/inventory/`, etc.).
- Modified: `lib/audit/schemas.ts` — add `"updated"` to `AuditAction` enum.
- Modified: `lib/audit/repository.ts` — extend project/unit/material fetchers to emit `updated` events.
- Modified: `app/(authed)/audit/audit-filters.tsx` — add Updated option to Action select.
- Modified: `app/(authed)/audit/audit-table.tsx` — handle new action variant.
- Possibly: `scripts/init-db.mjs` — no new indexes likely needed unless filtering by `lastUpdatedBy` becomes hot.

## Verification approach

Manual T-tasks:
- Edit each in-scope entity as one user → audit log shows the right `updated` event with correct actor.
- Edit same entity as a different user → audit log shows two events.
- Pre-Phase-10 entity that was never updated still appears with only its `created` event (no fake `updated`).
- `lastUpdatedBy` / `lastUpdatedAt` correctly atomic with the mutation (kill server mid-flow → no partial state).
- `listEntityHistory` on an edited entity shows the lifecycle (created + 1..N updated).

## What's NOT decided

Everything above tagged "TBD". **Do not implement without brainstorming first.** The biggest open question is the enumeration of mutation sites — Phase 10 will fail silently if any are missed (the entity will look un-edited in the audit log forever).
