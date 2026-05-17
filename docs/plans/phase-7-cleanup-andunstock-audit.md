# Phase 7 — Cleanup, `andUnstock`, Audit Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-05-17-phase-7-design.md`](../superpowers/specs/2026-05-17-phase-7-design.md) (committed in `a3e6d26`).

**Goal:** Ship three independent units under one Phase 7 umbrella: (1) Phase 6 cleanup (dead `"not-original"` reason, non-defensive `fromDate` copy); (2) opt-in `andUnstock` cascade on purchase reverse (race-safe stock decrement inside the existing `withTransaction`); (3) admin-only audit log — `/audit` global filterable feed + per-row `<HistorySheet>` (and `<HistoryDialog>` sibling for nested-sheet contexts).

**Architecture:** Cleanup is local edits to three files. `andUnstock` extends `reverseTransaction` with an optional cascade that finds the linked `materialMovements` row, conditionally decrements `projectMaterials.stockOnHand`, and inserts a reversing movement row — all inside the existing session. Audit log uses Approach A (application-level union): per-collection reads in parallel via `Promise.all`, JS projection into a normalized `AuditEvent` shape, bulk-denormalize actor/project names, sort + paginate. No new collections; no schema changes outside transactions.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript, native `mongodb` driver with transactions (Atlas replica set at `wangredev`), Zod, Tailwind v4 + shadcn/ui radix-nova. **shadcn `Sheet` is already installed** (`components/ui/sheet.tsx` present) — no new shadcn primitives needed.

**Branch:** Cut `feat/phase-7-audit-and-polish` from local `master` (currently `a3e6d26`, the spec commit). Do **not** push to origin until the user explicitly asks.

**Verification approach:** No automated test suite (Phase 3–6 precedent). After each code-change task, run `npm run typecheck` (fast) and commit. UI tasks are visually verified by running the dev server; backend tasks are smoke-tested via the browser or `mongosh`. Concrete T-tasks executed in batch at Task 19.

**Package manager:** `npm` (per `package-lock.json`).

---

## File Structure

**Create:**
- `lib/audit/schemas.ts` — `AuditEvent`, `AuditFilters`, `AuditAction`, `AuditEntityType` types.
- `lib/audit/repository.ts` — `listAuditEvents`, `listEntityHistory`, plus per-collection projection helpers and denormalization helpers.
- `app/(authed)/audit/page.tsx` — admin-only server component, composes filters + table + pagination.
- `app/(authed)/audit/audit-filters.tsx` — client component, URL-synced filter form.
- `app/(authed)/audit/audit-table.tsx` — server component table.
- `app/(authed)/audit/actions.ts` — `getEntityHistoryAction` only (filters use URL, not actions).
- `app/(authed)/components/history-sheet.tsx` — exports `<HistorySheet>` (Sheet chrome) and `<HistoryDialog>` (Dialog chrome) sharing one body component.

**Modify:**
- `lib/transactions/schemas.ts` — add `andUnstock` to `ReverseTransactionInputSchema`.
- `lib/transactions/repository.ts` — extend `reverseTransaction` with optional `andUnstock` cascade; narrow `CannotReverseTransferReason` to `"is-voided"`; defensive copy `fromDate` in `listMoneyTransfers`; add `LinkedMovementNotFoundError`, `AlreadyUnstockedError` classes; re-export `InsufficientStockForReversalError` (or have callers import directly from `lib/materials/repository.ts`).
- `lib/materials/repository.ts` — defensive copy `fromDate` in `listMaterialTransfers`.
- `app/(authed)/transfers/actions.ts` — collapse the `CannotReverseTransferError` ternaries at lines 151-157 and 302-308 (single message remains).
- `app/(authed)/projects/[id]/financials/actions.ts` — thread `andUnstock` through `reverseTransaction` action; add new error catches; extend `revalidatePath` for `/projects/[id]/materials`, `/financials`, `/audit`.
- `app/(authed)/projects/[id]/financials/reverse-confirm-dialog.tsx` — accept new props (`category`, `linkedMaterial`); render conditional checkbox when category is `"purchase"`.
- `app/(authed)/projects/[id]/financials/ledger-table.tsx` — pass new props through to the reverse dialog; add admin-only History row action triggering `<HistorySheet>`.
- `app/(authed)/projects/[id]/materials/movements-sheet.tsx` — add admin-only History row action triggering `<HistoryDialog>` (Dialog variant, since this surface is itself a Sheet).
- `app/(authed)/transfers/money-transfers-table.tsx` — add admin-only History row action triggering `<HistorySheet>`.
- `app/(authed)/transfers/material-transfers-table.tsx` — add admin-only History row action triggering `<HistorySheet>`.
- `app/(authed)/layout.tsx` — add admin-only "Audit" nav link after "Transfers".

**Add via `npx shadcn@latest add`:** none.

---

## Task 1 — Cut the feature branch

**Files:** none.

- [ ] **Step 1: Verify clean state on `master`**

```bash
git status
git log --oneline -3
```

Expected: working tree clean. HEAD should be `a3e6d26` (the Phase 7 design-doc commit).

- [ ] **Step 2: Cut the branch**

```bash
git checkout -b feat/phase-7-audit-and-polish
```

Expected: `Switched to a new branch 'feat/phase-7-audit-and-polish'`.

- [ ] **Step 3: No commit yet.**

Subsequent tasks commit onto the branch. Do not push to origin.

---

## Task 2 — Cleanup: narrow `CannotReverseTransferReason` and collapse transfer-action ternaries

**Files:**
- Modify: `lib/transactions/repository.ts:945`
- Modify: `app/(authed)/transfers/actions.ts:151-157` and `302-308`

- [ ] **Step 1: Narrow the union type**

Open `lib/transactions/repository.ts`. At line 945:

```ts
export type CannotReverseTransferReason = "is-voided"
```

(Was: `"not-original" | "is-voided"`. Kept as a single-value union so future reasons can be added without restoring the field — see Spec §1a.)

- [ ] **Step 2: Collapse the ternary in `reverseMoneyTransferAction`**

Open `app/(authed)/transfers/actions.ts`. Replace the block at lines 151-157:

```ts
    if (err instanceof CannotReverseTransferError) {
      return {
        ok: false,
        error: "A leg of this transfer is voided; cannot reverse.",
      }
    }
```

(The previous version used a ternary checking `err.reason === "is-voided"` with a "not-original" fallback message. With the union narrowed to a single value, the ternary is dead.)

- [ ] **Step 3: Collapse the parallel ternary in `reverseMaterialTransferAction`**

Same file, the parallel block at lines 302-308 (line numbers may shift after Step 2). Apply the same replacement.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors. (If the project lints these files, also: `npm run lint`.)

- [ ] **Step 5: Commit**

```bash
git add lib/transactions/repository.ts "app/(authed)/transfers/actions.ts"
git commit -m "refactor(transfers): remove dead 'not-original' reason from CannotReverseTransferError

The transferGroupId-shared-by-originals-and-reversals encoding combined with
the AlreadyReversedError \$in-guard makes the 'not-original' code path
unreachable. Narrow the union to 'is-voided' and collapse the dead branches
in both reverse-transfer actions."
```

---

## Task 3 — Cleanup: defensive `fromDate` copies in two repos

**Files:**
- Modify: `lib/transactions/repository.ts:800`
- Modify: `lib/materials/repository.ts:778`

- [ ] **Step 1: Defensive copy in `listMoneyTransfers`**

Open `lib/transactions/repository.ts`. At line 800:

```ts
  const fromDate = new Date(range.from)
```

(Was: `const fromDate = range.from`. The next line copies `range.to` defensively via `endOfDay(range.to)`; this restores parity so callers can never see mutation surprise.)

- [ ] **Step 2: Defensive copy in `listMaterialTransfers`**

Open `lib/materials/repository.ts`. At line 778:

```ts
  const fromDate = new Date(range.from)
```

(Was: `const fromDate = range.from`.)

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add lib/transactions/repository.ts lib/materials/repository.ts
git commit -m "fix(transfers): defensive copy fromDate in transfer-list functions

toDate was already copied via endOfDay()/new Date(); fromDate was a bare
alias of range.from. No current bug, but the asymmetry would bite the first
time a caller mutates the input range. Restore parity."
```

---

## Task 4 — `andUnstock`: schema field

**Files:**
- Modify: `lib/transactions/schemas.ts:109-114`

- [ ] **Step 1: Extend `ReverseTransactionInputSchema`**

Open `lib/transactions/schemas.ts`. Replace the schema at lines 109-114:

```ts
export const ReverseTransactionInputSchema = z.object({
  transactionId: z.string().min(1, "Missing transaction"),
  occurredAt: z.coerce.date().optional(),
  notes: z.string().max(2000).optional().default(""),
  andUnstock: z.boolean().optional().default(false),
})
export type ReverseTransactionInput = z.infer<typeof ReverseTransactionInputSchema>
```

(The type export at line 114 already exists and is unchanged.)

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors. The new optional field with a default is backward compatible — all existing call sites that don't pass `andUnstock` still parse correctly.

- [ ] **Step 3: Commit**

```bash
git add lib/transactions/schemas.ts
git commit -m "feat(financials): add andUnstock field to ReverseTransactionInputSchema

Opt-in flag (default false) for purchase-reverse to cascade into the stock
side. Behavior wiring lands in subsequent tasks; this commit is type-only."
```

---

## Task 5 — `andUnstock`: cascade implementation in `reverseTransaction`

**Files:**
- Modify: `lib/transactions/repository.ts:518-576` (the existing `reverseTransaction` function)
- Modify: `lib/transactions/repository.ts` near the existing error classes (top-of-file or bottom — match style) — add two new error classes
- Modify: `lib/transactions/repository.ts` imports — pull in `MaterialMovement` and `Material` types, the `materials` collection, and `InsufficientStockForReversalError`

- [ ] **Step 1: Add imports at top of `lib/transactions/repository.ts`**

Find the existing import block at the top of the file. Add (or extend, if already partially imported):

```ts
import type { MaterialMovement, Material } from "@/lib/materials/schemas"
import { InsufficientStockForReversalError } from "@/lib/materials/repository"
```

If the import block already has lines from `@/lib/materials/schemas`, merge instead of duplicating. The `InsufficientStockForReversalError` import is new — it's defined at `lib/materials/repository.ts:752`. This creates a cross-domain import that mirrors the existing pattern of `lib/materials/repository.ts` importing `CannotReverseTransferError` from this file (`lib/materials/repository.ts:6`).

- [ ] **Step 2: Add new error classes**

Find the error-class section of `lib/transactions/repository.ts` (near the existing `CannotReverseError`, `TransactionNotFoundError`, etc. — around lines 900-955). Append:

```ts
export class LinkedMovementNotFoundError extends Error {
  constructor() {
    super("No materialMovement linked to this purchase")
    this.name = "LinkedMovementNotFoundError"
  }
}

export class AlreadyUnstockedError extends Error {
  constructor() {
    super("Stock side has already been undone for this purchase.")
    this.name = "AlreadyUnstockedError"
  }
}
```

- [ ] **Step 3: Extend the `reverseTransaction` function signature and body**

Replace the entire `reverseTransaction` function (lines 518-576) with the version below. Diff vs current: the `override` parameter gains `andUnstock?: boolean`; the return type gains `movementReversalId?: ObjectId`; after the existing reversal insert, a new conditional `if (andUnstock && original.category === "purchase")` block runs the four-step cascade.

```ts
export async function reverseTransaction(
  transactionId: ObjectId,
  override: { occurredAt?: Date; notes?: string; andUnstock?: boolean },
  userId: string
): Promise<{ reversalId: ObjectId; movementReversalId?: ObjectId }> {
  const createdBy = new ObjectId(userId)
  const session = client.startSession()
  try {
    let reversalId!: ObjectId
    let movementReversalId: ObjectId | undefined
    await session.withTransaction(async () => {
      const db = getDb()
      const coll = db.collection<Transaction>("transactions")
      const insertColl = db.collection<Omit<Transaction, "_id">>("transactions")

      const original = await coll.findOne(
        { _id: transactionId },
        { session }
      )
      if (!original) {
        throw new CannotReverseError("not-found")
      }
      if (original.voided === true) {
        throw new CannotReverseError("is-voided")
      }
      if (original.reversalOf) {
        throw new CannotReverseError("is-reversal")
      }
      if (
        original.category === "transfer_in" ||
        original.category === "transfer_out"
      ) {
        throw new CannotReverseError("is-transfer")
      }

      const now = new Date()
      const occurredAt = override.occurredAt ?? now
      const reversalDoc: Omit<Transaction, "_id"> = {
        projectId: original.projectId,
        unitId: original.unitId,
        kind: original.kind,
        category: original.category,
        amount: original.amount,
        currency: "INR",
        description: `Reversal of: ${original.description}`,
        occurredAt,
        buyerName: original.buyerName,
        notes: override.notes || undefined,
        reversalOf: original._id,
        createdBy,
        createdAt: now,
      }
      const res = await insertColl.insertOne(reversalDoc, { session })
      reversalId = res.insertedId

      // andUnstock cascade — only for category="purchase".
      // Atomic with the financial reversal above (same session).
      if (override.andUnstock && original.category === "purchase") {
        const movs = db.collection<MaterialMovement>("materialMovements")
        const movsInsert =
          db.collection<Omit<MaterialMovement, "_id">>("materialMovements")
        const pms = db.collection<{
          projectId: ObjectId
          materialId: ObjectId
          stockOnHand: number
          updatedAt: Date
        }>("projectMaterials")
        const materialsColl = db.collection<Material>("materials")

        // 1. Find the linked purchase movement
        const linked = await movs.findOne(
          { transactionId: original._id, category: "purchase" },
          { session }
        )
        if (!linked) {
          throw new LinkedMovementNotFoundError()
        }

        // 2. Double-cascade guard
        if (linked.voided === true) {
          throw new AlreadyUnstockedError()
        }
        const existingMovReversal = await movs.findOne(
          { reversalOf: linked._id },
          { session }
        )
        if (existingMovReversal) {
          throw new AlreadyUnstockedError()
        }

        // 3. Conditional stock decrement
        const decRes = await pms.findOneAndUpdate(
          {
            projectId: original.projectId,
            materialId: linked.materialId,
            stockOnHand: { $gte: linked.qty },
          },
          {
            $inc: { stockOnHand: -linked.qty },
            $set: { updatedAt: now },
          },
          { session, returnDocument: "after" }
        )
        if (!decRes) {
          // Read the actual available value to surface in the error
          const pm = await pms.findOne(
            { projectId: original.projectId, materialId: linked.materialId },
            { session }
          )
          const available = pm?.stockOnHand ?? 0
          const proj = await db
            .collection<{ name: string }>("projects")
            .findOne(
              { _id: original.projectId },
              { session, projection: { name: 1 } }
            )
          throw new InsufficientStockForReversalError(
            available,
            original.projectId,
            proj?.name ?? "(unknown project)"
          )
        }

        // 4. Insert reversing movement row
        const material = await materialsColl.findOne(
          { _id: linked.materialId },
          { session, projection: { name: 1 } }
        )
        const materialName = material?.name ?? "(unknown material)"
        const movDoc: Omit<MaterialMovement, "_id"> = {
          projectId: original.projectId,
          materialId: linked.materialId,
          kind: "out",
          category: "purchase",
          qty: linked.qty,
          unitPriceAtMovement: linked.unitPriceAtMovement,
          amount: linked.amount,
          notes: override.notes || undefined,
          transactionId: reversalId,
          reversalOf: linked._id,
          occurredAt,
          createdBy,
          createdAt: now,
        }
        // Note: the reversing movement reuses the original category ("purchase")
        // with kind="out" — mirrors Phase 6's "reversal reuses original
        // category with opposite kind" convention. Description denormalized
        // with the material name read fresh from the catalog inside the
        // session (so a rename after the original purchase shows the current
        // name on the reversal row).
        const desc = `Reversal — Purchase: ${materialName}`
        const movRes = await movsInsert.insertOne(
          { ...movDoc, ...({ description: desc } as object) } as Omit<
            MaterialMovement,
            "_id"
          >,
          { session }
        )
        movementReversalId = movRes.insertedId
      }
    })
    return { reversalId, movementReversalId }
  } finally {
    await session.endSession()
  }
}
```

Note on the `description` insert at the bottom: `MaterialMovement` doesn't currently have a `description` field in the schema (verified — it has `purpose` and `notes`). Check the existing `recordPurchase` at `lib/materials/repository.ts:222-237` for how purchases denormalize the material name. If purchases use `notes` for "Purchase: {materialName}", mirror that pattern instead of inventing a `description` field:

- [ ] **Step 3a: Verify how purchases denormalize the material name**

```bash
sed -n '260,300p' lib/materials/repository.ts
```

Look for where `recordPurchase` stores the material name. Adjust the reversing-movement insert in Step 3 to match the same field. If `recordPurchase` uses `notes`, replace the `description: desc` line with `notes: (override.notes || undefined) ?? desc` and remove the `as object` cast / spread workaround. If `recordPurchase` uses `purpose`, swap accordingly. If neither (the catalog name is reconstructed at read time), the reversing movement does not need a denormalized field at all and step 3 simplifies — drop the `material` lookup and the `desc` line entirely.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors. If errors surface, they're most likely from the description/notes/purpose field mismatch — apply the Step 3a fix.

- [ ] **Step 5: Commit**

```bash
git add lib/transactions/repository.ts
git commit -m "feat(financials): andUnstock cascade in reverseTransaction

When override.andUnstock is true AND original.category is 'purchase':
inside the same withTransaction session, find the linked materialMovement,
guard against double-cascade (voided or already-reversed), conditionally
decrement projectMaterials.stockOnHand with the same race-safety pattern
as Phase 4 logConsumption, and insert a reversing 'out' movement with
reversalOf pointing at the linked row.

New error classes: LinkedMovementNotFoundError, AlreadyUnstockedError.
Reuses InsufficientStockForReversalError from lib/materials/repository.ts
(Phase 6 transfer-reversal class — same semantics)."
```

---

## Task 6 — `andUnstock`: thread through the action layer

**Files:**
- Modify: `app/(authed)/projects/[id]/financials/actions.ts:177-226` (the `reverseTransaction` action) and imports at the top of the file

- [ ] **Step 1: Update imports to include the new error classes**

At the top of `app/(authed)/projects/[id]/financials/actions.ts`, extend the import block from `@/lib/transactions/repository`:

```ts
import {
  voidTransaction as voidTransactionRepo,
  reverseTransaction as reverseTransactionRepo,
  TransactionNotFoundError,
  CannotReverseError,
  LinkedMovementNotFoundError,
  AlreadyUnstockedError,
} from "@/lib/transactions/repository"
import { InsufficientStockForReversalError } from "@/lib/materials/repository"
```

- [ ] **Step 2: Replace the `reverseTransaction` action body**

Replace lines 177-226 with:

```ts
export async function reverseTransaction(
  raw: unknown
): Promise<ActionResult<{ reversalId: string; movementReversalId?: string }>> {
  const user = await requireAdmin()
  const parsed = ReverseTransactionInputSchema.safeParse(raw)
  if (!parsed.success) {
    const fe = fieldError(parsed)
    return { ok: false, error: fe.error, field: fe.field }
  }

  const { transactionId, occurredAt, notes, andUnstock } = parsed.data
  if (!ObjectId.isValid(transactionId)) {
    return { ok: false, error: "Invalid transaction id." }
  }

  // Look up projectId for revalidate (the original carries it).
  const db = getDb()
  const existing = await db
    .collection<Transaction>("transactions")
    .findOne(
      { _id: new ObjectId(transactionId) },
      { projection: { projectId: 1 } }
    )
  if (!existing) return { ok: false, error: "Transaction not found." }

  try {
    const { reversalId, movementReversalId } = await reverseTransactionRepo(
      new ObjectId(transactionId),
      { occurredAt, notes, andUnstock },
      user.id
    )
    const projectId = existing.projectId.toHexString()
    revalidatePath(`/projects/${projectId}`)
    revalidatePath(`/projects/${projectId}/materials`)
    revalidatePath("/financials")
    revalidatePath("/audit")
    return {
      ok: true,
      data: {
        reversalId: reversalId.toHexString(),
        movementReversalId: movementReversalId?.toHexString(),
      },
    }
  } catch (err) {
    if (err instanceof CannotReverseError) {
      return {
        ok: false,
        error:
          CANNOT_REVERSE_MESSAGES[err.reason] ??
          "Cannot reverse this transaction.",
      }
    }
    if (err instanceof LinkedMovementNotFoundError) {
      return {
        ok: false,
        error: "Cannot undo stock: no material movement linked to this purchase.",
      }
    }
    if (err instanceof AlreadyUnstockedError) {
      return {
        ok: false,
        error:
          "Cannot undo stock: it has already been undone for this purchase.",
      }
    }
    if (err instanceof InsufficientStockForReversalError) {
      return {
        ok: false,
        error: `Cannot undo stock: ${err.projectName} only has ${err.available} of this material remaining, but the purchase was more. Reverse without 'undo stock' if you want to reverse only the financial side.`,
      }
    }
    console.error("reverseTransaction failed", err)
    return {
      ok: false,
      error: "Could not reverse transaction. Please try again.",
    }
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(authed)/projects/[id]/financials/actions.ts"
git commit -m "feat(financials): thread andUnstock through reverseTransaction action

Parses the new schema field, passes it to the repo, surfaces three new
error classes with user-friendly messages, and extends revalidatePath to
cover the project's materials page, /financials, and /audit (since stock
and audit events change when the cascade runs)."
```

---

## Task 7 — `andUnstock`: conditional checkbox in the Reverse dialog

**Files:**
- Modify: `app/(authed)/projects/[id]/financials/reverse-confirm-dialog.tsx`

- [ ] **Step 1: Extend props and state**

Replace the entire `reverse-confirm-dialog.tsx` file with:

```tsx
"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { reverseTransaction } from "./actions"

function isoDateToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export type ReverseConfirmDialogProps = {
  open: boolean
  onOpenChange: (next: boolean) => void
  transactionId: string
  description: string
  amount: number
  kind: "income" | "expense"
  category: "sale" | "purchase" | "adhoc" | "transfer_in" | "transfer_out"
  // Only meaningful when category === "purchase". Used in the checkbox helper
  // text so the admin sees exactly what will be decremented.
  linkedMaterial?: { name: string; unit: string; qty: number; projectName: string }
}

export function ReverseConfirmDialog({
  open,
  onOpenChange,
  transactionId,
  description,
  amount,
  kind,
  category,
  linkedMaterial,
}: ReverseConfirmDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [occurredAt, setOccurredAt] = useState<string>(isoDateToday())
  const [notes, setNotes] = useState<string>("")
  const [andUnstock, setAndUnstock] = useState<boolean>(false)

  const showStockCheckbox = category === "purchase" && !!linkedMaterial

  function confirm() {
    setErrorMsg(null)
    startTransition(async () => {
      const result = await reverseTransaction({
        transactionId,
        occurredAt,
        notes,
        andUnstock: showStockCheckbox ? andUnstock : false,
      })
      if (!result.ok) {
        setErrorMsg(result.error)
        return
      }
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reverse this entry?</AlertDialogTitle>
          <AlertDialogDescription>
            {description} (₹{amount.toLocaleString("en-IN")} {kind})
            <br />
            <br />
            A new reversal row will be inserted on the ledger at the date below.
            Both the original and the reversal stay active &mdash; aggregates
            net to zero. Use this for accounting corrections of older entries.
            For &ldquo;just clicked wrong&rdquo; mistakes, use Void instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reverseDate">Reversal date</Label>
            <Input
              id="reverseDate"
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reverseNotes">Notes (optional)</Label>
            <Textarea
              id="reverseNotes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isPending}
              placeholder="Why is this being reversed?"
            />
          </div>
          {showStockCheckbox && linkedMaterial ? (
            <div className="flex items-start gap-2 rounded border border-border bg-muted/50 p-3">
              <input
                id="andUnstock"
                type="checkbox"
                className="mt-1"
                checked={andUnstock}
                onChange={(e) => setAndUnstock(e.target.checked)}
                disabled={isPending}
              />
              <div className="flex flex-col gap-1 text-sm">
                <Label htmlFor="andUnstock" className="font-medium">
                  Also undo the stock side (decrements {linkedMaterial.projectName}
                  &rsquo;s {linkedMaterial.name} by {linkedMaterial.qty}{" "}
                  {linkedMaterial.unit})
                </Label>
                <p className="text-xs text-muted-foreground">
                  Use when the materials were returned or never received. Leave
                  unchecked if the supplier issued a credit while you kept the
                  goods.
                </p>
              </div>
            </div>
          ) : null}
        </div>
        {errorMsg ? (
          <p className="text-sm text-destructive" role="alert">
            {errorMsg}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              confirm()
            }}
            disabled={isPending}
          >
            {isPending ? "Reversing…" : "Reverse"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

- [ ] **Step 2: Update the dialog's call site to pass `category` and (where available) `linkedMaterial`**

The dialog is opened from `ledger-table.tsx` (see Phase 5 plan for the exact call site). Locate the `<ReverseConfirmDialog ... />` render and add the two new props.

For `category`: the ledger row already carries the transaction's category; pass it directly.

For `linkedMaterial`: this requires a join from the transaction row to the linked `materialMovement` and onward to the `materials` catalog row for unit/name, plus the project name for the helper text. Two options:

  - **Option A (simpler, deferred):** Pass `linkedMaterial={undefined}` for now. The checkbox won't render even on purchase rows. Land this in a follow-up commit that adds the join in the server component that renders `<LedgerTable>` (the per-project financials page).
  - **Option B (full):** In the page server component that renders `<LedgerTable>`, pre-fetch a `Map<transactionId, { name, unit, qty, projectName }>` for all purchase rows on the current page by joining `materialMovements` (where `transactionId` is in the set and `category="purchase"`), then `materials` for name/unit. Pass the map down to `<LedgerTable>` and look up per row when rendering the dialog. Adds ~20 lines to the page.

This plan task takes **Option A** to keep this commit dialog-focused. Option B lands in Task 7b (next task).

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors. The `category` prop is now required — any call site that omits it will surface a type error. Update those call sites to pass the row's category. (Search: `<ReverseConfirmDialog`.)

- [ ] **Step 4: Commit**

```bash
git add "app/(authed)/projects/[id]/financials/reverse-confirm-dialog.tsx" "app/(authed)/projects/[id]/financials/ledger-table.tsx"
git commit -m "feat(financials): conditional 'Also undo stock' checkbox in Reverse dialog

Adds category and linkedMaterial props. When category is 'purchase' and
linkedMaterial is provided, renders a checkbox alongside helper text
explaining when to use it. Default unchecked — today's behavior preserved.

linkedMaterial prefetch is deferred to the next task; this commit only
wires up the conditional render."
```

---

## Task 7b — `andUnstock`: prefetch `linkedMaterial` for the ledger

**Files:**
- Modify: `app/(authed)/projects/[id]/financials/page.tsx` (or wherever the per-project financials server page renders `<LedgerTable>`)
- Modify: `app/(authed)/projects/[id]/financials/ledger-table.tsx` (signature: accept the prefetched map; thread to dialog)

- [ ] **Step 1: Locate the page server component**

```bash
grep -rn "LedgerTable" "app/(authed)/projects/" --include="*.tsx"
```

The page that consumes `<LedgerTable>` is most likely `app/(authed)/projects/[id]/financials/page.tsx`. Note its current data-fetch pattern (`listLedger`, etc.) — the prefetch will piggyback on the same `getDb()` instance.

- [ ] **Step 2: Add the prefetch helper in the page**

Inside the page server component, after the ledger rows are fetched, add:

```ts
import type { MaterialMovement } from "@/lib/materials/schemas"
import type { Material } from "@/lib/materials/schemas"

// Build a Map<transactionId, { name, unit, qty, projectName }> for purchase
// rows on the current page, so the Reverse dialog can pre-fill the helper
// text. Non-purchase rows have no entry; the dialog hides the checkbox.
async function loadLinkedMaterials(
  rows: { _id: ObjectId; category: string }[],
  projectName: string
): Promise<Map<string, { name: string; unit: string; qty: number; projectName: string }>> {
  const purchaseIds = rows
    .filter((r) => r.category === "purchase")
    .map((r) => r.id)
  if (purchaseIds.length === 0) return new Map()
  const db = getDb()
  const movs = await db
    .collection<MaterialMovement>("materialMovements")
    .find(
      { transactionId: { $in: purchaseIds }, category: "purchase" },
      { projection: { transactionId: 1, materialId: 1, qty: 1 } }
    )
    .toArray()
  const materialIds = [...new Set(movs.map((m) => m.materialId.toHexString()))].map(
    (s) => new ObjectId(s)
  )
  const materials = await db
    .collection<Material>("materials")
    .find(
      { _id: { $in: materialIds } },
      { projection: { name: 1, unit: 1, unitOther: 1 } }
    )
    .toArray()
  const matById = new Map(materials.map((m) => [m.id.toHexString(), m]))
  const out = new Map<string, { name: string; unit: string; qty: number; projectName: string }>()
  for (const mov of movs) {
    if (!mov.transactionId) continue
    const mat = matById.get(mov.materialId.toHexString())
    if (!mat) continue
    out.set(mov.transactionId.toHexString(), {
      name: mat.name,
      unit: mat.unit === "other" ? mat.unitOther ?? "unit" : mat.unit,
      qty: mov.qty,
      projectName,
    })
  }
  return out
}
```

Note `r._id` access — adapt to whatever the page's ledger rows look like (they may use `_id.toHexString()` already or have `id: string` field; mirror).

Wire the function: call it after the ledger fetch, pass result down as a prop.

- [ ] **Step 3: Accept the prop in `<LedgerTable>` and thread to dialog**

In `app/(authed)/projects/[id]/financials/ledger-table.tsx`, extend the component's props with `linkedMaterials?: Map<string, { name: string; unit: string; qty: number; projectName: string }>`, default `new Map()`. At the dialog render call site:

```tsx
<ReverseConfirmDialog
  ...existing props...
  category={row.category}
  linkedMaterial={linkedMaterials.get(row._id.toHexString())}
/>
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(authed)/projects/[id]/financials/page.tsx" "app/(authed)/projects/[id]/financials/ledger-table.tsx"
git commit -m "feat(financials): prefetch linkedMaterial for purchase rows in ledger

Pre-loads a per-page Map<transactionId, {name, unit, qty, projectName}> so
the Reverse dialog's 'Also undo stock' checkbox can show exact what-will-
happen text without an extra round trip on click."
```

---

## Task 8 — Audit: `lib/audit/schemas.ts`

**Files:**
- Create: `lib/audit/schemas.ts`

- [ ] **Step 1: Create the file**

```ts
import { z } from "zod"
import type { ObjectId } from "mongodb"

export const AuditActionSchema = z.enum(["created", "voided", "reversed"])
export type AuditAction = z.infer<typeof AuditActionSchema>

export const AuditEntityTypeSchema = z.enum([
  "transaction",
  "movement",
  "project",
  "unit",
  "material",
])
export type AuditEntityType = z.infer<typeof AuditEntityTypeSchema>

// Parsed filter shape consumed by the repository. `from`/`to` are inclusive
// date-only bounds; the repository expands `to` to end-of-day on the query side.
export type AuditFilters = {
  from: Date
  to: Date
  actorId?: ObjectId
  action?: AuditAction
  entityType?: AuditEntityType
  projectId?: ObjectId
  page: number     // 1-based
  pageSize: number // default 50
}

export type AuditEvent = {
  id: string                       // synthetic: `${entityType}:${entityId}:${action}`
  occurredAt: Date                 // sort key
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
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add lib/audit/schemas.ts
git commit -m "feat(audit): add AuditEvent, AuditFilters, AuditAction, AuditEntityType

Pure types — no behavior. Consumed by the audit repository and UI in
subsequent commits."
```

---

## Task 9 — Audit: `listAuditEvents` in `lib/audit/repository.ts`

**Files:**
- Create: `lib/audit/repository.ts`

- [ ] **Step 1: Create the file with `listAuditEvents` and per-collection helpers**

```ts
import { ObjectId } from "mongodb"
import { getDb } from "@/lib/db/client"
import type {
  AuditEvent,
  AuditFilters,
  AuditAction,
  AuditEntityType,
} from "./schemas"

// ──────────────────────────────────────────────────────────────────────────
// Per-collection projection helpers. Each returns an array of AuditEvents
// in their "raw" shape — actorName/projectName are filled in later by the
// bulk denormalization step in listAuditEvents.
// ──────────────────────────────────────────────────────────────────────────

type RawEvent = Omit<AuditEvent, "actorName" | "actorRole" | "projectName">

function endOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(23, 59, 59, 999)
  return out
}

function inRange(d: Date | undefined, from: Date, to: Date): boolean {
  if (!d) return false
  return d >= from && d <= to
}

async function fetchTransactionEvents(filters: AuditFilters): Promise<RawEvent[]> {
  const db = getDb()
  const to = endOfDay(filters.to)
  const baseQuery: Record<string, unknown> = {
    $or: [
      { createdAt: { $gte: filters.from, $lte: to } },
      { voidedAt: { $gte: filters.from, $lte: to } },
    ],
  }
  if (filters.projectId) baseQuery.projectId = filters.projectId
  const rows = await db
    .collection<{
      _id: ObjectId
      projectId: ObjectId
      category: string
      kind: string
      amount: number
      description: string
      reversalOf?: ObjectId
      voided?: boolean
      voidedAt?: Date
      voidedBy?: ObjectId
      createdBy: ObjectId
      createdAt: Date
    }>("transactions")
    .find(baseQuery)
    .toArray()
  const out: RawEvent[] = []
  for (const r of rows) {
    // Created or reversed event (one or the other, from createdAt)
    if (inRange(r.createdAt, filters.from, to)) {
      const action: AuditAction = r.reversalOf ? "reversed" : "created"
      out.push({
        id: `transaction:${r._id.toHexString()}:${action}`,
        occurredAt: r.createdAt,
        actorId: r.createdBy,
        action,
        entityType: "transaction",
        entityId: r._id,
        projectId: r.projectId,
        summary: summarizeTransaction(r, action),
        refUrl: `/projects/${r.projectId.toHexString()}/financials`,
      })
    }
    // Voided event (independent, from voidedAt)
    if (r.voidedAt && r.voidedBy && inRange(r.voidedAt, filters.from, to)) {
      out.push({
        id: `transaction:${r._id.toHexString()}:voided`,
        occurredAt: r.voidedAt,
        actorId: r.voidedBy,
        action: "voided",
        entityType: "transaction",
        entityId: r._id,
        projectId: r.projectId,
        summary: `Voided ${r.kind} (₹${r.amount.toLocaleString("en-IN")}): ${r.description}`,
        refUrl: `/projects/${r.projectId.toHexString()}/financials`,
      })
    }
  }
  return out
}

function summarizeTransaction(
  r: {
    category: string
    kind: string
    amount: number
    description: string
  },
  action: AuditAction
): string {
  const amount = `₹${r.amount.toLocaleString("en-IN")}`
  const verb = action === "created" ? "Created" : "Reversed"
  return `${verb} ${r.category} (${amount}): ${r.description}`
}

async function fetchMovementEvents(filters: AuditFilters): Promise<RawEvent[]> {
  const db = getDb()
  const to = endOfDay(filters.to)
  const baseQuery: Record<string, unknown> = {
    $or: [
      { createdAt: { $gte: filters.from, $lte: to } },
      { voidedAt: { $gte: filters.from, $lte: to } },
    ],
  }
  if (filters.projectId) baseQuery.projectId = filters.projectId
  const rows = await db
    .collection<{
      _id: ObjectId
      projectId: ObjectId
      materialId: ObjectId
      category: string
      kind: string
      qty: number
      reversalOf?: ObjectId
      voided?: boolean
      voidedAt?: Date
      voidedBy?: ObjectId
      createdBy: ObjectId
      createdAt: Date
    }>("materialMovements")
    .find(baseQuery)
    .toArray()
  const out: RawEvent[] = []
  for (const r of rows) {
    if (inRange(r.createdAt, filters.from, to)) {
      const action: AuditAction = r.reversalOf ? "reversed" : "created"
      out.push({
        id: `movement:${r._id.toHexString()}:${action}`,
        occurredAt: r.createdAt,
        actorId: r.createdBy,
        action,
        entityType: "movement",
        entityId: r._id,
        projectId: r.projectId,
        summary: `${action === "created" ? "Created" : "Reversed"} ${r.category} (${r.qty}, ${r.kind})`,
        refUrl: `/projects/${r.projectId.toHexString()}/materials`,
      })
    }
    if (r.voidedAt && r.voidedBy && inRange(r.voidedAt, filters.from, to)) {
      out.push({
        id: `movement:${r._id.toHexString()}:voided`,
        occurredAt: r.voidedAt,
        actorId: r.voidedBy,
        action: "voided",
        entityType: "movement",
        entityId: r._id,
        projectId: r.projectId,
        summary: `Voided ${r.category} (${r.qty}, ${r.kind})`,
        refUrl: `/projects/${r.projectId.toHexString()}/materials`,
      })
    }
  }
  return out
}

async function fetchProjectEvents(filters: AuditFilters): Promise<RawEvent[]> {
  const db = getDb()
  const to = endOfDay(filters.to)
  const baseQuery: Record<string, unknown> = {
    createdAt: { $gte: filters.from, $lte: to },
  }
  if (filters.projectId) baseQuery._id = filters.projectId
  const rows = await db
    .collection<{
      _id: ObjectId
      name: string
      createdBy: ObjectId
      createdAt: Date
    }>("projects")
    .find(baseQuery)
    .toArray()
  return rows.map((r) => ({
    id: `project:${r._id.toHexString()}:created`,
    occurredAt: r.createdAt,
    actorId: r.createdBy,
    action: "created" as AuditAction,
    entityType: "project" as AuditEntityType,
    entityId: r._id,
    projectId: r._id,
    summary: `Created project: ${r.name}`,
    refUrl: `/projects/${r._id.toHexString()}`,
  }))
}

async function fetchUnitEvents(filters: AuditFilters): Promise<RawEvent[]> {
  const db = getDb()
  const to = endOfDay(filters.to)
  const baseQuery: Record<string, unknown> = {
    createdAt: { $gte: filters.from, $lte: to },
  }
  if (filters.projectId) baseQuery.projectId = filters.projectId
  const rows = await db
    .collection<{
      _id: ObjectId
      projectId: ObjectId
      type: string
      number: string
      createdBy: ObjectId
      createdAt: Date
    }>("units")
    .find(baseQuery)
    .toArray()
  return rows.map((r) => ({
    id: `unit:${r._id.toHexString()}:created`,
    occurredAt: r.createdAt,
    actorId: r.createdBy,
    action: "created" as AuditAction,
    entityType: "unit" as AuditEntityType,
    entityId: r._id,
    projectId: r.projectId,
    summary: `Created ${r.type}: ${r.number}`,
    refUrl: `/projects/${r.projectId.toHexString()}`,
  }))
}

async function fetchMaterialEvents(filters: AuditFilters): Promise<RawEvent[]> {
  const db = getDb()
  const to = endOfDay(filters.to)
  // Materials catalog has no projectId. If the user filtered by project, no
  // materials catalog events match — return [].
  if (filters.projectId) return []
  const rows = await db
    .collection<{
      _id: ObjectId
      name: string
      createdBy: ObjectId
      createdAt: Date
    }>("materials")
    .find({ createdAt: { $gte: filters.from, $lte: to } })
    .toArray()
  return rows.map((r) => ({
    id: `material:${r._id.toHexString()}:created`,
    occurredAt: r.createdAt,
    actorId: r.createdBy,
    action: "created" as AuditAction,
    entityType: "material" as AuditEntityType,
    entityId: r._id,
    summary: `Added material to catalog: ${r.name}`,
  }))
}

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

export async function listAuditEvents(
  filters: AuditFilters
): Promise<{ events: AuditEvent[]; total: number }> {
  // Decide which collections are in scope based on entityType filter.
  const fetchers: Array<Promise<RawEvent[]>> = []
  const wantsType = (t: AuditEntityType) =>
    !filters.entityType || filters.entityType === t
  if (wantsType("transaction")) fetchers.push(fetchTransactionEvents(filters))
  if (wantsType("movement")) fetchers.push(fetchMovementEvents(filters))
  if (wantsType("project")) fetchers.push(fetchProjectEvents(filters))
  if (wantsType("unit")) fetchers.push(fetchUnitEvents(filters))
  if (wantsType("material")) fetchers.push(fetchMaterialEvents(filters))

  const chunks = await Promise.all(fetchers)
  let raw = chunks.flat()

  // Apply post-projection filters that are easier here than in the queries.
  if (filters.actorId) {
    const actorHex = filters.actorId.toHexString()
    raw = raw.filter((e) => e.actorId.toHexString() === actorHex)
  }
  if (filters.action) {
    raw = raw.filter((e) => e.action === filters.action)
  }

  // Sort newest first
  raw.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())

  // Bulk denormalize actor and project names
  const denormalized = await denormalize(raw)

  // Paginate
  const total = denormalized.length
  const start = (filters.page - 1) * filters.pageSize
  const events = denormalized.slice(start, start + filters.pageSize)
  return { events, total }
}

async function denormalize(raw: RawEvent[]): Promise<AuditEvent[]> {
  if (raw.length === 0) return []
  const db = getDb()
  const actorIds = [...new Set(raw.map((e) => e.actorId.toHexString()))].map(
    (s) => new ObjectId(s)
  )
  const projectIds = [
    ...new Set(raw.map((e) => e.projectId?.toHexString()).filter((x): x is string => !!x)),
  ].map((s) => new ObjectId(s))
  const [users, projects] = await Promise.all([
    actorIds.length === 0
      ? Promise.resolve([] as Array<{ _id: ObjectId; name?: string; email?: string; role?: string }>)
      : db
          .collection<{ _id: ObjectId; name?: string; email?: string; role?: string }>("users")
          .find({ _id: { $in: actorIds } }, { projection: { name: 1, email: 1, role: 1 } })
          .toArray(),
    projectIds.length === 0
      ? Promise.resolve([] as Array<{ _id: ObjectId; name: string }>)
      : db
          .collection<{ _id: ObjectId; name: string }>("projects")
          .find({ _id: { $in: projectIds } }, { projection: { name: 1 } })
          .toArray(),
  ])
  const userById = new Map(users.map((u) => [u._id.toHexString(), u]))
  const projectById = new Map(projects.map((p) => [p._id.toHexString(), p.name]))
  return raw.map((e) => {
    const u = userById.get(e.actorId.toHexString())
    const actorName = u?.name ?? u?.email ?? "(unknown)"
    const actorRole: "admin" | "floor_manager" =
      u?.role === "admin" ? "admin" : "floor_manager"
    return {
      ...e,
      actorName,
      actorRole,
      projectName: e.projectId
        ? projectById.get(e.projectId.toHexString())
        : undefined,
    }
  })
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors. (The `users` collection field names — `name`, `email`, `role` — assume the existing Auth.js adapter shape. If different, adjust the projection and the fallback chain in `denormalize`.)

- [ ] **Step 3: Commit**

```bash
git add lib/audit/repository.ts
git commit -m "feat(audit): add listAuditEvents (Approach A — application-level union)

Reads in parallel from transactions, materialMovements, projects, units,
and materials (catalog) — entity-type filter narrows the fan-out. Projects
each row into 0..2 AuditEvents using the rules from the spec: created or
reversed (from createdAt), plus voided (from voidedAt) when applicable.
Sort + paginate in JS. Bulk-denormalize actor + project names via two
\$in queries."
```

---

## Task 10 — Audit: `listEntityHistory` in `lib/audit/repository.ts`

**Files:**
- Modify: `lib/audit/repository.ts` (append)

- [ ] **Step 1: Append `listEntityHistory` and a `denormalizeOne` helper that reuses the same logic**

Append to `lib/audit/repository.ts`:

```ts
export async function listEntityHistory(
  entityType: AuditEntityType,
  entityId: ObjectId
): Promise<AuditEvent[]> {
  const db = getDb()
  const raw: RawEvent[] = []

  if (entityType === "transaction") {
    const coll = db.collection<{
      _id: ObjectId
      projectId: ObjectId
      category: string
      kind: string
      amount: number
      description: string
      reversalOf?: ObjectId
      transferGroupId?: ObjectId
      voided?: boolean
      voidedAt?: Date
      voidedBy?: ObjectId
      createdBy: ObjectId
      createdAt: Date
    }>("transactions")
    const self = await coll.findOne({ _id: entityId })
    if (!self) return []
    // Self events (created/reversed + voided if applicable)
    raw.push(...txnRowToEvents(self))
    // Reversal pointing at self
    const revs = await coll
      .find({ reversalOf: entityId })
      .toArray()
    for (const r of revs) raw.push(...txnRowToEvents(r))
    // Transfer group peers (both legs + their reversals)
    if (self.transferGroupId) {
      const groupPeers = await coll
        .find({
          transferGroupId: self.transferGroupId,
          _id: { $ne: self._id },
        })
        .toArray()
      for (const p of groupPeers) raw.push(...txnRowToEvents(p))
    }
  } else if (entityType === "movement") {
    const coll = db.collection<{
      _id: ObjectId
      projectId: ObjectId
      category: string
      kind: string
      qty: number
      reversalOf?: ObjectId
      transferGroupId?: ObjectId
      voided?: boolean
      voidedAt?: Date
      voidedBy?: ObjectId
      createdBy: ObjectId
      createdAt: Date
    }>("materialMovements")
    const self = await coll.findOne({ _id: entityId })
    if (!self) return []
    raw.push(...movRowToEvents(self))
    const revs = await coll.find({ reversalOf: entityId }).toArray()
    for (const r of revs) raw.push(...movRowToEvents(r))
    if (self.transferGroupId) {
      const groupPeers = await coll
        .find({
          transferGroupId: self.transferGroupId,
          _id: { $ne: self._id },
        })
        .toArray()
      for (const p of groupPeers) raw.push(...movRowToEvents(p))
    }
  } else if (entityType === "project") {
    const r = await db
      .collection<{ _id: ObjectId; name: string; createdBy: ObjectId; createdAt: Date }>(
        "projects"
      )
      .findOne({ _id: entityId })
    if (r) {
      raw.push({
        id: `project:${r._id.toHexString()}:created`,
        occurredAt: r.createdAt,
        actorId: r.createdBy,
        action: "created",
        entityType: "project",
        entityId: r._id,
        projectId: r._id,
        summary: `Created project: ${r.name}`,
        refUrl: `/projects/${r._id.toHexString()}`,
      })
    }
  } else if (entityType === "unit") {
    const r = await db
      .collection<{
        _id: ObjectId
        projectId: ObjectId
        type: string
        number: string
        createdBy: ObjectId
        createdAt: Date
      }>("units")
      .findOne({ _id: entityId })
    if (r) {
      raw.push({
        id: `unit:${r._id.toHexString()}:created`,
        occurredAt: r.createdAt,
        actorId: r.createdBy,
        action: "created",
        entityType: "unit",
        entityId: r._id,
        projectId: r.projectId,
        summary: `Created ${r.type}: ${r.number}`,
        refUrl: `/projects/${r.projectId.toHexString()}`,
      })
    }
  } else if (entityType === "material") {
    const r = await db
      .collection<{ _id: ObjectId; name: string; createdBy: ObjectId; createdAt: Date }>(
        "materials"
      )
      .findOne({ _id: entityId })
    if (r) {
      raw.push({
        id: `material:${r._id.toHexString()}:created`,
        occurredAt: r.createdAt,
        actorId: r.createdBy,
        action: "created",
        entityType: "material",
        entityId: r._id,
        summary: `Added material to catalog: ${r.name}`,
      })
    }
  }

  raw.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
  return denormalize(raw)
}

function txnRowToEvents(r: {
  _id: ObjectId
  projectId: ObjectId
  category: string
  kind: string
  amount: number
  description: string
  reversalOf?: ObjectId
  voided?: boolean
  voidedAt?: Date
  voidedBy?: ObjectId
  createdBy: ObjectId
  createdAt: Date
}): RawEvent[] {
  const action: AuditAction = r.reversalOf ? "reversed" : "created"
  const out: RawEvent[] = [
    {
      id: `transaction:${r._id.toHexString()}:${action}`,
      occurredAt: r.createdAt,
      actorId: r.createdBy,
      action,
      entityType: "transaction",
      entityId: r._id,
      projectId: r.projectId,
      summary: summarizeTransaction(r, action),
      refUrl: `/projects/${r.projectId.toHexString()}/financials`,
    },
  ]
  if (r.voidedAt && r.voidedBy) {
    out.push({
      id: `transaction:${r._id.toHexString()}:voided`,
      occurredAt: r.voidedAt,
      actorId: r.voidedBy,
      action: "voided",
      entityType: "transaction",
      entityId: r._id,
      projectId: r.projectId,
      summary: `Voided ${r.kind} (₹${r.amount.toLocaleString("en-IN")}): ${r.description}`,
      refUrl: `/projects/${r.projectId.toHexString()}/financials`,
    })
  }
  return out
}

function movRowToEvents(r: {
  _id: ObjectId
  projectId: ObjectId
  category: string
  kind: string
  qty: number
  reversalOf?: ObjectId
  voided?: boolean
  voidedAt?: Date
  voidedBy?: ObjectId
  createdBy: ObjectId
  createdAt: Date
}): RawEvent[] {
  const action: AuditAction = r.reversalOf ? "reversed" : "created"
  const out: RawEvent[] = [
    {
      id: `movement:${r._id.toHexString()}:${action}`,
      occurredAt: r.createdAt,
      actorId: r.createdBy,
      action,
      entityType: "movement",
      entityId: r._id,
      projectId: r.projectId,
      summary: `${action === "created" ? "Created" : "Reversed"} ${r.category} (${r.qty}, ${r.kind})`,
      refUrl: `/projects/${r.projectId.toHexString()}/materials`,
    },
  ]
  if (r.voidedAt && r.voidedBy) {
    out.push({
      id: `movement:${r._id.toHexString()}:voided`,
      occurredAt: r.voidedAt,
      actorId: r.voidedBy,
      action: "voided",
      entityType: "movement",
      entityId: r._id,
      projectId: r.projectId,
      summary: `Voided ${r.category} (${r.qty}, ${r.kind})`,
      refUrl: `/projects/${r.projectId.toHexString()}/materials`,
    })
  }
  return out
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add lib/audit/repository.ts
git commit -m "feat(audit): add listEntityHistory for per-row History sheet

Scoped lookup for a single entity's lifecycle. For transactions and
movements: fetches the row itself plus any reversal pointing at it plus
(if the row has a transferGroupId) the rest of the transfer group — so
the History sheet on any transfer leg shows the full pair-and-reversal
picture. For projects/units/materials: just the single created event."
```

---

## Task 11 — Audit: `getEntityHistoryAction`

**Files:**
- Create: `app/(authed)/audit/actions.ts`

- [ ] **Step 1: Create the action file**

```ts
"use server"

import { ObjectId } from "mongodb"
import { requireAdmin } from "@/lib/auth/session"
import { listEntityHistory } from "@/lib/audit/repository"
import type { AuditEvent, AuditEntityType } from "@/lib/audit/schemas"
import type { ActionResult } from "@/lib/projects/schemas"

// AuditEntityType values that getEntityHistoryAction accepts. Server-side
// allowlist matches the union in schemas.ts.
const VALID_TYPES: AuditEntityType[] = [
  "transaction",
  "movement",
  "project",
  "unit",
  "material",
]

export async function getEntityHistoryAction(
  entityType: string,
  entityId: string
): Promise<ActionResult<AuditEvent[]>> {
  await requireAdmin()
  if (!VALID_TYPES.includes(entityType as AuditEntityType)) {
    return { ok: false, error: "Invalid entity type." }
  }
  if (!ObjectId.isValid(entityId)) {
    return { ok: false, error: "Invalid entity id." }
  }
  try {
    const events = await listEntityHistory(
      entityType as AuditEntityType,
      new ObjectId(entityId)
    )
    return { ok: true, data: events }
  } catch (err) {
    console.error("getEntityHistoryAction failed", err)
    return { ok: false, error: "Could not load history. Please try again." }
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/audit/actions.ts"
git commit -m "feat(audit): add getEntityHistoryAction (admin-only)

Server action consumed by HistorySheet / HistoryDialog. requireAdmin as
first line; whitelists entityType; validates entityId; returns events as
ActionResult<AuditEvent[]>."
```

---

## Task 12 — Audit: `<HistorySheet>` and `<HistoryDialog>` components

**Files:**
- Create: `app/(authed)/components/history-sheet.tsx`

- [ ] **Step 1: Create the file with both exports sharing one body component**

```tsx
"use client"

import { useEffect, useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { getEntityHistoryAction } from "@/app/(authed)/audit/actions"
import type { AuditEvent, AuditEntityType } from "@/lib/audit/schemas"

type HistoryProps = {
  entityType: AuditEntityType
  entityId: string
  trigger: React.ReactNode
}

// Shared body component. Renders the loading/error/list states.
function HistoryBody({
  entityType,
  entityId,
  open,
}: {
  entityType: AuditEntityType
  entityId: string
  open: boolean
}) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; events: AuditEvent[] }
  >({ status: "idle" })

  useEffect(() => {
    if (!open) return
    setState({ status: "loading" })
    getEntityHistoryAction(entityType, entityId).then((res) => {
      if (!res.ok) {
        setState({ status: "error", message: res.error })
      } else {
        setState({ status: "ready", events: res.data })
      }
    })
  }, [open, entityType, entityId])

  if (state.status === "loading" || state.status === "idle") {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (state.status === "error") {
    return (
      <p className="text-sm text-destructive" role="alert">
        {state.message}
      </p>
    )
  }
  if (state.events.length === 0) {
    return <p className="text-sm text-muted-foreground">No history found.</p>
  }
  return (
    <ol className="flex flex-col gap-3">
      {state.events.map((e) => (
        <li
          key={e.id}
          className="flex flex-col gap-1 rounded border border-border bg-card p-3"
        >
          <div className="flex items-center gap-2">
            <Badge variant={actionVariant(e.action)}>{e.action}</Badge>
            <span className="text-sm font-medium">{e.actorName}</span>
            <Badge variant="outline" className="text-xs">
              {e.actorRole === "admin" ? "admin" : "floor manager"}
            </Badge>
            <span className="ml-auto text-xs text-muted-foreground" title={e.occurredAt.toISOString()}>
              {formatRelative(e.occurredAt)}
            </span>
          </div>
          <p className="text-sm">{e.summary}</p>
          {e.projectName ? (
            <p className="text-xs text-muted-foreground">{e.projectName}</p>
          ) : null}
        </li>
      ))}
    </ol>
  )
}

function actionVariant(a: AuditEvent["action"]): "default" | "destructive" | "secondary" {
  if (a === "voided") return "destructive"
  if (a === "reversed") return "secondary"
  return "default"
}

function formatRelative(d: Date): string {
  const diff = Date.now() - d.getTime()
  const m = Math.round(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.round(h / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString()
}

export function HistorySheet({ entityType, entityId, trigger }: HistoryProps) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>History</SheetTitle>
          <SheetDescription>
            Lifecycle events for this entity, newest first.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          <HistoryBody entityType={entityType} entityId={entityId} open={open} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function HistoryDialog({ entityType, entityId, trigger }: HistoryProps) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>History</DialogTitle>
          <DialogDescription>
            Lifecycle events for this entity, newest first.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2">
          <HistoryBody entityType={entityType} entityId={entityId} open={open} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors. If `<Badge variant="outline">` doesn't exist in this project's badge variants, swap to `secondary` or whatever the existing variants are (`grep -A 5 'badgeVariants' components/ui/badge.tsx`).

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/components/history-sheet.tsx"
git commit -m "feat(audit): add HistorySheet + HistoryDialog components

Two trigger surfaces sharing one HistoryBody. HistorySheet uses shadcn
Sheet (slide-in from right) for normal contexts. HistoryDialog uses the
existing Dialog primitive for trigger contexts that are themselves inside
a Sheet (the per-project movements-sheet — nested Sheets are awkward UX).

Calls getEntityHistoryAction on open; renders a vertical timeline with
actor badges, relative timestamps, action variants."
```

---

## Task 13 — Audit: `/audit` page + table

**Files:**
- Create: `app/(authed)/audit/page.tsx`
- Create: `app/(authed)/audit/audit-table.tsx`

- [ ] **Step 1: Create the audit-table server component**

```tsx
// app/(authed)/audit/audit-table.tsx
import { Badge } from "@/components/ui/badge"
import type { AuditEvent } from "@/lib/audit/schemas"

export function AuditTable({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No events match the current filters.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr className="text-left">
            <th className="px-3 py-2 font-medium">When</th>
            <th className="px-3 py-2 font-medium">Actor</th>
            <th className="px-3 py-2 font-medium">Action</th>
            <th className="px-3 py-2 font-medium">Entity</th>
            <th className="px-3 py-2 font-medium">Summary</th>
            <th className="px-3 py-2 font-medium">Project</th>
            <th className="px-3 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {events.map((e) => (
            <tr key={e.id} className="hover:bg-muted/30">
              <td className="px-3 py-2 whitespace-nowrap" title={e.occurredAt.toISOString()}>
                {e.occurredAt.toLocaleString()}
              </td>
              <td className="px-3 py-2">
                <span>{e.actorName}</span>
                <Badge variant="outline" className="ml-2 text-xs">
                  {e.actorRole === "admin" ? "admin" : "FM"}
                </Badge>
              </td>
              <td className="px-3 py-2">
                <Badge variant={actionVariant(e.action)}>{e.action}</Badge>
              </td>
              <td className="px-3 py-2">{e.entityType}</td>
              <td className="px-3 py-2">{e.summary}</td>
              <td className="px-3 py-2">{e.projectName ?? ""}</td>
              <td className="px-3 py-2 text-right">
                {e.refUrl ? (
                  <a
                    href={e.refUrl}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    View →
                  </a>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function actionVariant(
  a: AuditEvent["action"]
): "default" | "destructive" | "secondary" {
  if (a === "voided") return "destructive"
  if (a === "reversed") return "secondary"
  return "default"
}
```

- [ ] **Step 2: Create the audit page**

```tsx
// app/(authed)/audit/page.tsx
import { ObjectId } from "mongodb"
import { requireAdmin } from "@/lib/auth/session"
import { listAuditEvents } from "@/lib/audit/repository"
import type {
  AuditAction,
  AuditEntityType,
  AuditFilters,
} from "@/lib/audit/schemas"
import { getDb } from "@/lib/db/client"
import { AuditFiltersForm } from "./audit-filters"
import { AuditTable } from "./audit-table"

const VALID_ACTIONS: AuditAction[] = ["created", "voided", "reversed"]
const VALID_ENTITY_TYPES: AuditEntityType[] = [
  "transaction",
  "movement",
  "project",
  "unit",
  "material",
]

function parseFilters(searchParams: Record<string, string | string[] | undefined>): AuditFilters {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const fromRaw = first(searchParams.from)
  const toRaw = first(searchParams.to)
  const actorRaw = first(searchParams.actor)
  const actionRaw = first(searchParams.action)
  const entityTypeRaw = first(searchParams.entityType)
  const projectRaw = first(searchParams.project)
  const pageRaw = first(searchParams.page)
  const pageSizeRaw = first(searchParams.pageSize)
  return {
    from: fromRaw ? new Date(fromRaw) : monthStart,
    to: toRaw ? new Date(toRaw) : now,
    actorId: actorRaw && ObjectId.isValid(actorRaw) ? new ObjectId(actorRaw) : undefined,
    action: actionRaw && VALID_ACTIONS.includes(actionRaw as AuditAction)
      ? (actionRaw as AuditAction)
      : undefined,
    entityType:
      entityTypeRaw && VALID_ENTITY_TYPES.includes(entityTypeRaw as AuditEntityType)
        ? (entityTypeRaw as AuditEntityType)
        : undefined,
    projectId:
      projectRaw && ObjectId.isValid(projectRaw)
        ? new ObjectId(projectRaw)
        : undefined,
    page: pageRaw ? Math.max(1, parseInt(pageRaw, 10) || 1) : 1,
    pageSize: pageSizeRaw ? Math.min(200, parseInt(pageSizeRaw, 10) || 50) : 50,
  }
}

function first(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0]
  return v
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAdmin()
  const sp = await searchParams
  const filters = parseFilters(sp)

  // Load filter-form options (users + projects)
  const db = getDb()
  const [users, projects] = await Promise.all([
    db
      .collection<{ _id: ObjectId; name?: string; email?: string; role?: string }>("users")
      .find({}, { projection: { name: 1, email: 1, role: 1 } })
      .toArray(),
    db
      .collection<{ _id: ObjectId; name: string }>("projects")
      .find({}, { projection: { name: 1 } })
      .sort({ name: 1 })
      .toArray(),
  ])

  const { events, total } = await listAuditEvents(filters)
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize))

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Audit</h1>
        <p className="text-sm text-muted-foreground">
          {total} event{total === 1 ? "" : "s"} · page {filters.page} of {totalPages}
        </p>
      </header>
      <AuditFiltersForm
        currentFilters={filters}
        users={users.map((u) => ({
          id: u._id.toHexString(),
          label: u.name ?? u.email ?? "(unknown)",
        }))}
        projects={projects.map((p) => ({
          id: p._id.toHexString(),
          label: p.name,
        }))}
      />
      <AuditTable events={events} />
      <Pagination current={filters.page} total={totalPages} />
    </div>
  )
}

function Pagination({ current, total }: { current: number; total: number }) {
  if (total <= 1) return null
  // Render a small numeric pagination — for now just "Prev / Next" using
  // href-relative search-param updates. (Full numeric pagination can land
  // in a future polish iteration.)
  return (
    <nav className="flex items-center gap-3 text-sm">
      <PaginationLink page={current - 1} disabled={current <= 1} label="← Prev" />
      <span className="text-muted-foreground">
        Page {current} of {total}
      </span>
      <PaginationLink
        page={current + 1}
        disabled={current >= total}
        label="Next →"
      />
    </nav>
  )
}

function PaginationLink({
  page,
  disabled,
  label,
}: {
  page: number
  disabled: boolean
  label: string
}) {
  if (disabled) {
    return <span className="text-muted-foreground">{label}</span>
  }
  // Pagination uses a self-link — the filter form client component manages
  // search-param URL updates, but for pagination a server-side link is fine.
  return (
    <a className="text-primary hover:underline" href={`?page=${page}`}>
      {label}
    </a>
  )
}
```

The pagination link is a known simplification — it loses any non-`page` search params on click. Refinement: read the current URL's search params in the page server component and forward them in the link. Acceptable for the first version.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors. (`AuditFiltersForm` isn't created yet — TS will error. Either temporarily stub it or proceed to Task 14 then come back to typecheck. The plan order proceeds to Task 14 next; defer typecheck and commit to end of Task 14.)

- [ ] **Step 4: Do NOT commit yet**

This task is half — the page references `<AuditFiltersForm>` which Task 14 creates. Combined commit happens at the end of Task 14.

---

## Task 14 — Audit: filter form (client component)

**Files:**
- Create: `app/(authed)/audit/audit-filters.tsx`

- [ ] **Step 1: Create the filter form**

```tsx
"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AuditFilters, AuditAction, AuditEntityType } from "@/lib/audit/schemas"

type Option = { id: string; label: string }

export function AuditFiltersForm({
  currentFilters,
  users,
  projects,
}: {
  currentFilters: AuditFilters
  users: Option[]
  projects: Option[]
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [from, setFrom] = useState<string>(toIsoDate(currentFilters.from))
  const [to, setTo] = useState<string>(toIsoDate(currentFilters.to))
  const [actor, setActor] = useState<string>(
    currentFilters.actorId?.toHexString() ?? "all"
  )
  const [action, setAction] = useState<string>(currentFilters.action ?? "all")
  const [entityType, setEntityType] = useState<string>(
    currentFilters.entityType ?? "all"
  )
  const [project, setProject] = useState<string>(
    currentFilters.projectId?.toHexString() ?? "all"
  )

  function apply() {
    const params = new URLSearchParams(sp.toString())
    setParam(params, "from", from)
    setParam(params, "to", to)
    setParam(params, "actor", actor === "all" ? "" : actor)
    setParam(params, "action", action === "all" ? "" : action)
    setParam(params, "entityType", entityType === "all" ? "" : entityType)
    setParam(params, "project", project === "all" ? "" : project)
    params.delete("page") // reset to page 1 on filter change
    startTransition(() => {
      router.push(`?${params.toString()}`)
    })
  }

  function reset() {
    setFrom("")
    setTo("")
    setActor("all")
    setAction("all")
    setEntityType("all")
    setProject("all")
    startTransition(() => {
      router.push(`?`)
    })
  }

  return (
    <form
      className="grid grid-cols-1 gap-3 rounded border border-border bg-card p-4 md:grid-cols-3 lg:grid-cols-6"
      onSubmit={(e) => {
        e.preventDefault()
        apply()
      }}
    >
      <Field label="From">
        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          disabled={isPending}
        />
      </Field>
      <Field label="To">
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          disabled={isPending}
        />
      </Field>
      <Field label="Actor">
        <Select value={actor} onValueChange={setActor} disabled={isPending}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Action">
        <Select value={action} onValueChange={setAction} disabled={isPending}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            <SelectItem value="created">Created</SelectItem>
            <SelectItem value="voided">Voided</SelectItem>
            <SelectItem value="reversed">Reversed</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Entity">
        <Select
          value={entityType}
          onValueChange={setEntityType}
          disabled={isPending}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            <SelectItem value="transaction">Transaction</SelectItem>
            <SelectItem value="movement">Movement</SelectItem>
            <SelectItem value="project">Project</SelectItem>
            <SelectItem value="unit">Unit</SelectItem>
            <SelectItem value="material">Material</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Project">
        <Select value={project} onValueChange={setProject} disabled={isPending}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="flex items-end gap-2 md:col-span-3 lg:col-span-6">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Applying…" : "Apply filters"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={reset}
          disabled={isPending}
        >
          Reset
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function setParam(params: URLSearchParams, key: string, value: string) {
  if (value) params.set(key, value)
  else params.delete(key)
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors. (The filter-form references `<Select>` etc. — `select.tsx` is already in `components/ui/`.)

- [ ] **Step 3: Commit (combined: page + table + filters)**

```bash
git add "app/(authed)/audit/"
git commit -m "feat(audit): /audit admin page with filterable table and pagination

Server page enforces requireAdmin first line. Parses URL search params
into AuditFilters (defaults: current-month, no other filters). Loads
users + projects for dropdown options. Calls listAuditEvents.

AuditTable: server component, 7 columns (When, Actor+role, Action, Entity,
Summary, Project, View deep-link).

AuditFiltersForm: client component, URL-synced via router.push, resets to
page 1 on filter change."
```

---

## Task 15 — Audit: History trigger on ledger-table

**Files:**
- Modify: `app/(authed)/projects/[id]/financials/ledger-table.tsx`

- [ ] **Step 1: Inspect the existing row-actions pattern**

```bash
sed -n '1,40p' "app/(authed)/projects/[id]/financials/ledger-table.tsx"
```

Note where existing row actions (Reverse, Void) render — most likely a `<DropdownMenu>` inside the row's last cell, OR inline buttons. Match the same pattern for the History trigger.

- [ ] **Step 2: Add the History trigger**

At the top of the file:

```tsx
import { HistorySheet } from "@/app/(authed)/components/history-sheet"
import { Button } from "@/components/ui/button"
```

In the row-actions cell, add (guarded by `session.user.role === "admin"` — the ledger-table is already admin-only per Phase 5, so the guard may be redundant; mirror the existing Reverse button's guard):

```tsx
<HistorySheet
  entityType="transaction"
  entityId={row._id.toHexString()}
  trigger={
    <Button variant="ghost" size="sm">
      History
    </Button>
  }
/>
```

If the existing pattern wraps actions in a `<DropdownMenu>`, place the `<HistorySheet>` outside the dropdown (because the trigger needs to be the actual click target — a `<DropdownMenuItem>` won't work as a Sheet trigger directly).

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(authed)/projects/[id]/financials/ledger-table.tsx"
git commit -m "feat(audit): History row action on ledger-table

Opens HistorySheet for the row's transaction. Admin-only (the entire
ledger-table surface is admin-only per Phase 5; same guard mirrored)."
```

---

## Task 16 — Audit: History trigger on transfer tables

**Files:**
- Modify: `app/(authed)/transfers/money-transfers-table.tsx`
- Modify: `app/(authed)/transfers/material-transfers-table.tsx`

- [ ] **Step 1: Add History trigger on money-transfers-table**

In `app/(authed)/transfers/money-transfers-table.tsx`, add the same `HistorySheet` import and trigger as Task 15, but pass `entityType="transaction"` and `entityId={row.sourceTxId.toHexString()}` (any leg id works — `listEntityHistory` will follow the `transferGroupId` to include the peer).

- [ ] **Step 2: Add History trigger on material-transfers-table**

Same as Step 1 but in `app/(authed)/transfers/material-transfers-table.tsx`, with `entityType="movement"` and `entityId={row.sourceMovId.toHexString()}`.

If the exact row field names differ from `sourceTxId`/`sourceMovId`, inspect the file and use whatever id is exposed on the row. Any leg of the pair is sufficient — `listEntityHistory` follows the `transferGroupId` lookup either way.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(authed)/transfers/money-transfers-table.tsx" "app/(authed)/transfers/material-transfers-table.tsx"
git commit -m "feat(audit): History row action on transfer tables (money + material)

Either leg's id passes — listEntityHistory follows transferGroupId to
fetch the peer leg and any reversal pair."
```

---

## Task 17 — Audit: History trigger on movements-sheet (uses Dialog variant)

**Files:**
- Modify: `app/(authed)/projects/[id]/materials/movements-sheet.tsx`

- [ ] **Step 1: Add the History trigger using `<HistoryDialog>`**

This surface is itself a Sheet. Use the Dialog variant to avoid the nested-Sheet UX problem (see Spec §3e).

At the top of the file:

```tsx
import { HistoryDialog } from "@/app/(authed)/components/history-sheet"
import { Button } from "@/components/ui/button"
```

In each movement row's actions area:

```tsx
<HistoryDialog
  entityType="movement"
  entityId={mov._id.toHexString()}
  trigger={
    <Button variant="ghost" size="sm">
      History
    </Button>
  }
/>
```

Guard with `session.user.role === "admin"` if the surface is mixed-role (verify by looking at the existing actions in the file — if there's an existing admin-only button, mirror its guard).

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/materials/movements-sheet.tsx"
git commit -m "feat(audit): History row action on movements-sheet (Dialog variant)

The movements view is itself a Sheet; nested Sheets are awkward UX. Uses
HistoryDialog instead of HistorySheet — same body component, different
chrome."
```

---

## Task 18 — Audit: nav link in layout

**Files:**
- Modify: `app/(authed)/layout.tsx`

- [ ] **Step 1: Add the admin-only Audit nav link**

Open `app/(authed)/layout.tsx`. Find the "Transfers" admin nav link (added in Phase 6). Add a sibling "Audit" link with the same admin guard immediately after:

```tsx
{session.user.role === "admin" ? (
  <Link href="/audit" className="...same classes as Transfers link...">
    Audit
  </Link>
) : null}
```

Mirror exactly whatever guard/classes the Transfers link uses.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/layout.tsx"
git commit -m "feat(audit): admin-only Audit nav link"
```

---

## Task 19 — Verification sweep (T-tasks)

**Files:** none modified; this is a verification batch. Each step is a manual check or a command. Use the dev server (`npm run dev`) and a browser, plus Atlas / `mongosh` for backend assertions.

- [ ] **Step 1: Typecheck + lint clean (T-cross-2)**

```bash
npm run typecheck
npm run lint
```

Expected: both clean. If lint surfaces auto-fixable warnings, address inline before moving on.

- [ ] **Step 2: T-cleanup-1 — type narrowing took effect**

Already verified by Step 1 (the narrowing was checked when Task 2 committed). Nothing extra to do; tick this box once Step 1 is clean.

- [ ] **Step 3: T-cleanup-2 — reverse a transfer with a voided leg**

Set up via `mongosh`:

```js
// Find a transfer's transferGroupId, then void one leg:
const grp = db.transactions.findOne({ transferGroupId: { $exists: true } }).transferGroupId
db.transactions.updateOne({ transferGroupId: grp, kind: "expense" }, { $set: { voided: true, voidedAt: new Date() } })
```

Then in the UI, go to `/transfers` → Money tab → click Reverse on that transfer. Confirm the error message says "A leg of this transfer is voided; cannot reverse."

Cleanup: `db.transactions.updateOne({ ... }, { $unset: { voided: 1, voidedAt: 1 } })`.

- [ ] **Step 4: T-cleanup-3 — date filter on /transfers**

In the UI, go to `/transfers`, set a narrow date range, confirm results are filtered correctly.

- [ ] **Step 5: T-stock-1 — reverse purchase WITHOUT andUnstock**

Record a purchase on some project (Materials tab → "Log purchase"). Then go to Financials tab, find that purchase row, click Reverse. Leave "Also undo stock" unchecked. Confirm: reversal row appears in ledger; project's stockOnHand for that material is unchanged; no new materialMovements row inserted.

Verify in `mongosh`:

```js
db.materialMovements.find({ transactionId: <reversalId> }).count()  // should be 0
db.projectMaterials.findOne({ projectId: ..., materialId: ... }).stockOnHand  // should be unchanged
```

- [ ] **Step 6: T-stock-2 — reverse purchase WITH andUnstock**

Same setup. Click Reverse, check "Also undo stock", confirm. Verify in `mongosh`:

```js
db.transactions.findOne({ reversalOf: <originalTxId> })             // should exist
db.materialMovements.findOne({ reversalOf: <originalMovId> })       // should exist (kind: "out", category: "purchase")
db.projectMaterials.findOne({ projectId, materialId }).stockOnHand  // should be decreased by qty
```

- [ ] **Step 7: T-stock-3 — insufficient stock surfaces friendly error**

Set up: purchase X kg → consume X-1 kg → attempt reverse with andUnstock. Confirm: error message includes the project name and the available qty; nothing was inserted (no new transactions, no new materialMovements; stockOnHand unchanged).

```js
db.transactions.find({ reversalOf: <originalTxId> }).count()  // should be 0
db.materialMovements.find({ reversalOf: <originalMovId> }).count()  // should be 0
```

- [ ] **Step 8: T-stock-4 — double cascade attempt**

Repeat T-stock-2 (successful andUnstock). Then click Reverse again on the SAME original. Confirm error: `AlreadyReversedError` ("This transfer has already been reversed.") or `AlreadyUnstockedError` depending on order — the transaction-level guard fires first, so expect AlreadyReversedError-style message.

- [ ] **Step 9: T-stock-5 — checkbox hidden for non-purchase rows**

Find a sale row and an adhoc row in Financials. Click Reverse on each. Confirm the "Also undo stock" checkbox does NOT render.

- [ ] **Step 10: T-audit-1 — admin /audit renders**

Visit `/audit` as admin. Confirm: page renders; default filters cover current month; events sorted newest-first.

- [ ] **Step 11: T-audit-2 — FM redirected**

Log out, log in as floor manager, visit `/audit` directly. Confirm: redirected (via `requireAdmin`).

- [ ] **Step 12: T-audit-3 — filters narrow correctly**

As admin: try each filter individually (user, action, entity type, project, date range). Confirm narrowing. Try combining 2-3 filters; confirm AND semantics.

- [ ] **Step 13: T-audit-4 — event counts per scenario**

Find a known voided adhoc → confirm 2 rows in audit (created + voided).
Find a known reversed sale → confirm 2 rows (sale created + reversal reversed).
Find a plain unaffected entity (e.g. a fresh project) → confirm 1 row.

- [ ] **Step 14: T-audit-5 — actor name + role badge correct**

For events you created as admin: actor name = your name, role badge = admin.
For events created by a floor manager (e.g. an FM-logged consumption): actor name = FM's name, role badge = FM.

- [ ] **Step 15: T-audit-6 — pagination**

Increase volume if needed (or just confirm that `total` and the visible row count match: `total = pageSize * pageNumber + remaining`). Click Next; click Prev; confirm count consistency.

- [ ] **Step 16: T-audit-7 — History sheet from Ledger**

On Financials tab, find any row. Click History row action. Confirm: Sheet opens from the right; timeline renders; events match (created/voided/reversed); Sheet closes cleanly.

- [ ] **Step 17: T-audit-8 — History on a transfer shows both legs**

On `/transfers` → Money tab, find a transfer (preferably a reversed one). Click History. Confirm: timeline shows events from BOTH legs and the reversal pair (4 events total for a reversed transfer).

- [ ] **Step 18: T-cross-1 — no regressions on existing surfaces**

Browse: each project's tabs (Overview/Financials/Materials/Inventory), `/financials`, `/transfers`, `/materials` (catalog). Confirm: nothing visually broken; andUnstock checkbox only appears on purchase Reverse dialogs; History buttons only render for admin.

- [ ] **Step 19: If anything fails — fix in a focused commit per failure**

Do not batch fixes. Each fix gets its own commit with a clear message.

---

## Task 20 — Merge to local master

**Files:** none.

- [ ] **Step 1: Confirm all T-tasks in Task 19 pass and the working tree is clean**

```bash
git status
```

Expected: clean.

- [ ] **Step 2: Merge with `--no-ff` to preserve the feature-branch history**

```bash
git checkout master
git merge --no-ff feat/phase-7-audit-and-polish -m "Merge branch 'feat/phase-7-audit-and-polish' (Phase 7 — cleanup, andUnstock, audit log)"
```

- [ ] **Step 3: Confirm HEAD**

```bash
git log --oneline -5
```

Expected: top commit is the merge; previous commits are the Phase 7 work.

- [ ] **Step 4: Do NOT push**

Per project rule: do not push to origin without explicit user instruction. Tell the user the merge is local; ask whether they want to push.

---

## Post-merge

Update memory if Phase 7 surfaces any new feedback/project notes worth persisting. Likely candidates:

- If the `description`/`notes`/`purpose` field on `materialMovements` revealed a denormalization quirk during Task 5 Step 3a, capture it as feedback memory.
- If the `users` collection schema (from Auth.js adapter) had unexpected field names, capture as reference memory.
- Otherwise, no new memory needed.
