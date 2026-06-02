# Phase 11 — Void Purchases (Path B: Permanent Documentation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Codify "void is adhoc-only" as a permanent, documented constraint so future developers don't accidentally try to extend it without a real use case.

**Architecture:** Single comment added to the existing JSDoc on `voidTransaction` in `lib/transactions/repository.ts`. No runtime changes — no schema, action, UI, or test code changes needed. Typecheck and lint confirm nothing regressed.

**Tech Stack:** TypeScript, MongoDB native driver, Next.js 16 App Router

---

### Task 1: Add permanent-constraint note to `voidTransaction` JSDoc

**Files:**
- Modify: `lib/transactions/repository.ts:537-541`

- [ ] **Step 1: Open the file and locate the JSDoc**

The comment to update is at lines 537–541 of `lib/transactions/repository.ts`:

```ts
/**
 * Soft-void an ad-hoc transaction. Race-safe via conditional update on
 * category + voided + reversalOf $exists:false. Throws TransactionNotFoundError
 * if no row matches (covers: deleted, not adhoc, already voided, is a reversal).
 */
```

- [ ] **Step 2: Replace that JSDoc with the expanded version**

```ts
/**
 * Soft-void an ad-hoc transaction. Race-safe via conditional update on
 * category + voided + reversalOf $exists:false. Throws TransactionNotFoundError
 * if no row matches (covers: deleted, not adhoc, already voided, is a reversal).
 *
 * Void is permanently scoped to adhoc rows. Purchases are corrected via
 * reverseTransaction + andUnstock (Phase 7). This asymmetry is intentional —
 * no operator use case for purchase void has surfaced. Do not extend void to
 * purchases without first validating a real need.
 */
```

- [ ] **Step 3: Run typecheck and lint to confirm no regressions**

```bash
npm run typecheck
npm run lint
```

Expected: both exit 0 with no errors or warnings introduced by this change.

- [ ] **Step 4: Commit**

```bash
git add lib/transactions/repository.ts
git commit -m "docs(phase-11): mark void as adhoc-only permanent constraint"
```
