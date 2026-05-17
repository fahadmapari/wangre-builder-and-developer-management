# Phase 9 — Pagination + Drilldown Sheets (skeleton)

**Date:** 2026-05-17
**Status:** **Skeleton — not yet brainstormed.** Open design decisions noted inline. Requires a brainstorm before any implementation plan.
**Depends on:** Phases 1–7. Phase 7 merged to local master (HEAD `c1b126b`).

## Goal

Prepare the app for real data volume by adding two related capabilities that have been deferred since Phase 5:

1. **Pagination / virtualization** on heavy tables. Today only `/audit` paginates; ledger and transfers tables fetch and render everything.
2. **Drilldown sheet** on table rows: click → side panel with full row detail, related rows (e.g. for a sale: the unit, the buyer, the linked materials usage), and quick links to deeper context.

Pairing them is intentional — when a table gets paginated, drilldown becomes the primary "see everything about this row" affordance.

## Non-goals (best-guess; confirm during brainstorm)

- Replacing the existing inline row actions (Reverse / Void / History) with drilldown-only navigation. Inline actions stay.
- Real-time / virtualized infinite scroll. Discrete pages (Prev / Next + page numbers) match the audit-log pattern and are easier to reason about.
- A unified "details sidebar" application shell. Per-table drilldown sheets are isolated; no global UI restructuring.
- Drilldown on the audit log itself (it's already a derived view; the History sheet already serves the per-row drilldown need).
- Server-side `count()` for total-pages on very large collections (count is slow at scale; consider "next page exists" approximation if relevant).

## Key design decisions still TBD

### Pagination

1. **Model.** Offset+limit (simple, supports page numbers, slow at scale) vs. cursor-based (scales, no jump-to-page). Audit uses offset+limit; consistency vs. preparing for scale.
2. **Volume threshold.** Pagination only kicks in past N rows? Or always-on (matches `/audit`)?
3. **Tables in scope.** Ledger (per-project + `/financials`), money transfers, material transfers, materials movements, inventory units list. All? Subset?
4. **Page size.** Match audit's 50, or per-surface (ledger maybe 100, transfers maybe 25)?
5. **URL-sync.** Yes (matches Phase 5/7 pattern). Confirm.
6. **Total-count rendering.** Audit shows "N events". Ledger could too — adds a `countDocuments()` call per page load. Acceptable?

### Drilldown sheet

1. **Which tables get a drilldown?** Ledger rows are the obvious candidate (lots of related context: unit, buyer, transfer peer, reversal pair, linked movement). Transfer rows (peer leg). Sale rows in inventory. Movements rows. All?
2. **Content per drilldown.**
   - Sale: unit, buyer, sale price, sold date, linked sale transaction, reversal status.
   - Purchase: linked materialMovement, project's current stock, supplier (if tracked).
   - Transfer: both legs, peer project, reversal pair.
   - Adhoc: just the row's fields + audit history.
   - Required: a place to put the History link (Phase 7 added History row actions; drilldown could subsume them).
3. **Shared component vs. per-surface.** Generic `<DrilldownSheet>` that takes `entityType` + `entityId` (parallels HistorySheet) vs. per-surface components.
4. **Data fetching.** Server action that returns the bundled detail object? Or RSC data-loading at the sheet level?
5. **Subsume History row action?** The Phase 7 History sheet could become a tab inside the drilldown sheet ("Details" / "History" / "Related"). Cleaner UX, but more refactor.
6. **Trigger.** Click anywhere on the row? Or a dedicated "Details →" button? Click-row is more discoverable but conflicts with row checkboxes / multi-select if those ever come.

### Cross-cutting

- **Should this be one phase or split?** Pagination is largely mechanical (signatures, URL plumbing). Drilldown is design-heavy (what to show, how to compose). Splitting may be saner. Re-litigate during brainstorm.

## Rough scope estimate

If both ship: **~10-15 files** (pagination only) or **~18-25 files** (with drilldown).

- Modified: every repository function being paginated (signature gains `page`/`pageSize` or `cursor`).
- Modified: every consuming page server component (URL parse, totals).
- Modified: each table component (Prev/Next controls).
- New: `<DrilldownSheet>` (or per-surface), data loaders.
- Modified: row click handlers / actions on each table.

## Verification approach

Manual T-tasks:
- Each paginated table renders correctly across page boundaries (no double-counted rows, no skipped rows).
- Total count matches sum of page rows.
- URL navigation: paging preserves filters (Phase 7 fix already in place).
- Drilldown shows complete, accurate detail for each entity type.
- Drilldown on a reversed sale shows the reversal pair.
- Performance: paginated query is bounded — `explain()` shows the right index covers the sort/filter.

## What's NOT decided

Everything above tagged "TBD". **Do not implement without brainstorming first.** The biggest open question is whether pagination and drilldown should be one phase or two — they don't actually depend on each other technically.
