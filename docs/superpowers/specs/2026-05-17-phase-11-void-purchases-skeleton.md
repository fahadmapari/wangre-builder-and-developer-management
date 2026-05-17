# Phase 11 — Extend Void to Purchases + `andUnstock` on Void (skeleton)

**Date:** 2026-05-17
**Status:** **Skeleton — not yet brainstormed.** Open design decisions noted inline. Requires a brainstorm before any implementation plan.
**Depends on:** Phases 1–7. Phase 7 merged to local master (HEAD `c1b126b`).

## Goal

Round out the corrections-flow symmetry deferred from Phase 7. Today:

- **`voidTransaction`** at `lib/transactions/repository.ts:476` accepts ONLY `category: "adhoc"` rows. Purchases (and sales) cannot be voided — only reversed.
- **`andUnstock`** shipped in Phase 7 on the reverse path only. There's no equivalent on void because there's no void path for purchases.

This is an asymmetry that the Phase 7 spec acknowledged: "Today voidTransaction accepts only adhoc rows. Purchases use reverse, not void — extending void to purchases is its own design decision."

Phase 11 makes the decision. Either:

- **Path A:** Extend `voidTransaction` to accept purchases, with an `andUnstock` checkbox parallel to Phase 7's reverse flow. The two corrections paths (void and reverse) then have the same surface for purchases, differing only in semantics (void = "this never happened" vs reverse = "this happened but is being corrected later").
- **Path B:** Leave void scoped to adhoc forever. Acknowledge the asymmetry in CLAUDE.md, codify it as a permanent design constraint. Document that the "use reverse" rule is permanent.

The Phase 7 brainstorm chose Path B by default ("Drop andUnstock-on-void"). Phase 11 revisits this if real-world use surfaces a pain point.

## Non-goals (best-guess; confirm during brainstorm)

- Extending void to **sales**. Sales already have `unmarkUnitSold` which is the conceptual equivalent (un-do the sale completely, vs reverse which adds a correcting entry). Don't add a third path.
- Extending void to **transfers**. Transfers explicitly reject void (Phase 6) — they have their own reverseMoneyTransfer / reverseMaterialTransfer flows.
- Replacing reverse with void. Both remain — they have different accounting semantics.
- Time-bounded void ("can only void within 24h"). Out of scope.

## Key design decisions still TBD

### Whether to do this at all

1. **Real use case?** Has anyone hit the asymmetry in practice? If reverse-with-andUnstock from Phase 7 covers 95% of cases, Path B (do nothing, document) may be the right call. **Validate the use case before implementing.**

### If Path A (extend void)

2. **Void semantics for purchases.** Today voidTransaction sets `voided: true / voidedAt / voidedBy` on the row — the row stays in queries, just marked. For a purchase, this means: the transaction is voided, but does the linked materialMovement also get voided? Does stock get decremented?
   - Option: void = "this never happened" → cascade always (no checkbox; treat it as the full undo).
   - Option: void = financial-only by default, andUnstock opts into stock cascade (parallel to reverse).
3. **Symmetry with reverse-andUnstock.**
   - Reverse-andUnstock: inserts a reversing transaction + reversing movement + decrements stock conditionally.
   - Void-andUnstock: marks the original as voided + voids the movement + decrements stock conditionally.
   - Different mechanic (mark vs insert reversing row), same end state for the stock side.
4. **UX divergence.**
   - Today the Void dialog and Reverse dialog are separate components. If both surface andUnstock on purchases, do they share a checkbox component? Or stay independent?
5. **Race safety.**
   - Conditional `findOneAndUpdate({ stockOnHand: { $gte: qty } })` pattern still applies.
   - Same double-cascade guard (linked movement already voided?).
   - Reuses `InsufficientStockForReversalError`?
6. **`unmarkUnitSold` parallel.** Phase 3's unmarkUnitSold also "voids" a sale via flipping `unit.status` and voiding the sale transaction. If void of a purchase is "this never happened", is there a parallel "unmark purchase"? Probably overkill.

### If Path B (do nothing)

7. **Documentation.** Where does the "void is adhoc-only" rule live? CLAUDE.md? Inline in voidTransaction's docstring?
8. **Future ambiguity prevention.** Anything to do today to prevent future-me from "fixing" the asymmetry without realizing it was intentional?

## Rough scope estimate

**Path A: ~6-10 files.**

- Modified: `lib/transactions/schemas.ts` — `VoidTransactionInputSchema` gets `andUnstock?: boolean`.
- Modified: `lib/transactions/repository.ts:476` — extend `voidTransaction` to accept purchases + andUnstock cascade (mirrors Phase 7's `reverseTransaction` cascade).
- Modified: `app/(authed)/projects/[id]/financials/actions.ts` — `voidTransaction` action threads the field; error handling.
- Modified: `app/(authed)/projects/[id]/financials/void-confirm-dialog.tsx` — conditional checkbox like the Reverse dialog.
- Modified: `app/(authed)/projects/[id]/financials/row-actions-menu.tsx` — Void button now enabled for purchases (currently gated by category).
- Modified: page server component — prefetch `linkedMaterial` for void path too (or share with the reverse prefetch).

Comparable to Phase 7's andUnstock work (~7 files).

**Path B: 0-1 files.**

- Optional: `lib/transactions/repository.ts:476` — docstring update spelling out the "adhoc-only" permanent constraint.
- Optional: CLAUDE.md entry.

## Verification approach

If Path A — manual T-tasks mirroring Phase 7's T-stock series:
- Void a purchase WITHOUT andUnstock → financial-only void; stock unchanged; no new movement row.
- Void a purchase WITH andUnstock → financial void + movement void + stock decremented; atomic.
- Void with andUnstock when stock insufficient → friendly error; nothing changed.
- Double-void with andUnstock → AlreadyUnstockedError.
- Checkbox does NOT appear on sale / adhoc rows in the Void dialog.

## What's NOT decided

Everything above tagged "TBD". **Do not implement without brainstorming first.** The most important decision is the meta-decision: Path A vs Path B. **Don't start Path A's implementation just because it's larger and feels like "real work." Validate the use case first.** If nobody has actually hit the asymmetry in production, Path B is the right call and Phase 11 is a 10-minute docstring update.
