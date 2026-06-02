# Phase 11 — Extend Void to Purchases (Path B: Permanent Documentation)

**Date:** 2026-06-02
**Status:** Approved design — ready for implementation plan
**Depends on:** Phases 1–10 merged to local master (HEAD `72ebc5f`)

## Decision

**Path B chosen.** No runtime code changes. Void remains permanently scoped to adhoc transactions only.

**Deciding factor:** No operator has ever hit the "can't void a purchase" limitation in practice. The reverse-with-andUnstock flow from Phase 7 covers every real correction need. Building Path A (extend void to purchases) without a real use case would be speculative complexity.

## What Phase 11 delivers

One targeted documentation write. No schema changes, no new server actions, no UI changes, no transactions.

### Inline comment on `voidTransaction` (lib/transactions/repository.ts)

Above the `voidTransaction` function (currently line 542), add a comment making the permanent constraint explicit:

```
// Void is permanently scoped to adhoc rows. Purchases use reverseTransaction
// + andUnstock (Phase 7). This asymmetry is intentional — no use case for
// purchase void has surfaced. Do not extend without validating a real need.
```

Note: there is no CLAUDE.md in this repo. The convention is captured here and in project memory.

## What does NOT change

- `lib/transactions/repository.ts` — `voidTransaction` body is unchanged
- `lib/transactions/schemas.ts` — `VoidTransactionInputSchema` unchanged
- `app/(authed)/projects/[id]/financials/void-confirm-dialog.tsx` — unchanged
- `app/(authed)/projects/[id]/financials/row-actions-menu.tsx` — `canVoid: ctx.category === "adhoc"` gate stays as-is
- No new error classes, no `andUnstock` cascade on the void path
- The skeleton spec at `docs/superpowers/specs/2026-05-17-phase-11-void-purchases-skeleton.md` is retained as a historical record of the decision

## Verification

No T-tasks. After the edit is committed:
- `voidTransaction` at `lib/transactions/repository.ts` has the comment
- `npm run typecheck` and `npm run lint` still pass (no runtime changes)

## Future

If an operator use case for purchase void surfaces, the skeleton spec's Path A section (design decisions 2–6) remains the starting point for that brainstorm. The constraint is documented as "intentional + revisable if a use case appears" — not "forbidden forever."
