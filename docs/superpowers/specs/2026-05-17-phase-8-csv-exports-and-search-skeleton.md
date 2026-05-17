# Phase 8 — CSV Exports + Free-Text Search (skeleton)

**Date:** 2026-05-17
**Status:** **Skeleton — not yet brainstormed.** Open design decisions noted inline. A full brainstorm session is required before any implementation plan can be written. This document captures the rough shape so the phase is discoverable; it is **not** a binding design.
**Depends on:** Phases 1–7. Phase 7 merged to local master (HEAD `c1b126b`).

## Goal

Give admins two universally-useful data-access capabilities that have been deferred from Phases 5 / 6 / 7:

1. **CSV exports** of the surfaces admins use to reconcile and report (ledger, transfers, materials movements, audit log).
2. **Free-text search** across the descriptions / notes / buyer / actor fields of the same surfaces, so finding a specific record doesn't require scrolling.

Pairing them is intentional — both are "give me the data" features and they share UI affordances (header-level buttons on each table).

## Non-goals (best-guess; confirm during brainstorm)

- Excel / PDF / JSON export formats. CSV is the lingua franca; other formats can land later.
- Scheduled / emailed exports. Pull-only via a button click.
- Search across collections from a single global search box. Per-surface search (each table has its own input) is simpler and matches the existing tab-by-tab UX.
- Replacing the existing date-range / category filters with a search-only model. Search composes ON TOP of filters.
- Saved searches / search history.
- Fuzzy / typo-tolerant search.

## Key design decisions still TBD

These each require a real brainstorm answer; the answers determine architecture and scope:

### CSV exports
1. **Streaming vs. buffered.** For the ledger at small volumes a single in-memory CSV is fine. At larger volumes streaming via a Route Handler (`app/api/export/*/route.ts`) is necessary. Threshold?
2. **Which surfaces get exports?** Ledger (per-project + global `/financials` cross-project view), money transfers list, material transfers list, materials movements list, audit log. All? Or start with ledger + audit?
3. **Auth scope.** Admin-only? Or do FMs get exports of their per-project data too?
4. **Column set.** Match the visible table columns exactly, or expose more (e.g. raw ObjectIds, createdBy hex)? CSV consumers often want raw ids.
5. **Filename convention.** `ledger-{projectName}-{from}-{to}.csv` vs. timestamped vs. UUID? Localization of dates in filename?
6. **Trigger location.** A "Download CSV" button in each table's header? A `/exports` route that lists available exports? Both?
7. **Currency formatting.** `₹50,000` (display) or `50000` (raw)? CSV consumers usually want raw.
8. **Voided / reversed rows.** Include them with a flag column? Filter them out by default with a checkbox?

### Free-text search
1. **Mongo strategy.**
   - `$regex` — simple, no schema change, slow at scale.
   - `$text` index — fast, requires per-collection text index in `scripts/init-db.mjs`, single field weighting.
   - Atlas Search — most flexible, requires Atlas configuration (we already use Atlas), separate cost.
   Choosing here affects the index strategy and the Phase 8 init-db diff.
2. **Searched fields per surface.**
   - Ledger: `description`, `notes`, `buyerName`?
   - Transfers: `description`, `notes`?
   - Movements: `purpose`, `notes`?
   - Audit log: `summary`, `actorName`? (the audit log is derived; search would happen post-projection in `lib/audit/repository.ts`).
3. **Composition with existing filters.** Search adds to date-range / category filters via AND? Or pivots to a search-only mode? URL-syncing.
4. **UI affordance.** Inline search input in each table header? Cmd-K palette? Both?
5. **Minimum query length.** 2 chars? 3 chars? (Prevents accidental full-collection scans.)

### Cross-cutting
- **Should this be one phase or split?** CSV + search are independent enough that they could ship as Phase 8 (exports) and Phase 9 (search). The user originally bundled them in Phase 7's deferred list. Worth re-litigating during brainstorm.

## Rough scope estimate

If both ship together: **~12-18 files**.

- New: `lib/exports/csv.ts` (shared CSV-encoding helpers), `app/api/export/{ledger,transfers,movements,audit}/route.ts` (4 Route Handlers, auth-enforced).
- New: `lib/search/<per-surface>.ts` helpers OR inline `$text` queries per repo.
- Modified: each table's header (4 surfaces × 2 buttons), the per-surface repository functions to accept a search filter, `scripts/init-db.mjs` for the new indexes, `app/(authed)/audit/page.tsx` to add search.
- Plus the audit log: `lib/audit/repository.ts` extended to filter by search.

Comparable to Phase 6's scope (20 files).

## Verification approach

Manual T-tasks per project convention. Key cases:
- CSV export of every supported surface produces valid CSV (open in Excel, check encoding for `₹`).
- Filtered export honors the active filters (date range, project, etc.).
- Search returns expected matches; respects index for performance (`explain()` shows index hit).
- Search composes with date filters correctly.
- Auth: FM can't hit admin-only export endpoints.

## What's NOT decided

Everything above tagged "TBD" — including whether CSV and search should even be one phase. **Do not start an implementation plan from this skeleton without first running the brainstorming skill to settle the decisions.**
