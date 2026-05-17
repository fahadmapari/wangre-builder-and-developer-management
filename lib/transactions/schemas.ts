import { z } from "zod"
import type { ObjectId } from "mongodb"

export const TransactionKindSchema = z.enum(["income", "expense"])
export type TransactionKind = z.infer<typeof TransactionKindSchema>

// Full category enum declared up-front (Phase 3). Phase 5 introduces the first
// writer of "adhoc". Phase 6 will write "transfer_in" / "transfer_out".
export const TransactionCategorySchema = z.enum([
  "sale",
  "purchase",
  "transfer_in",
  "transfer_out",
  "adhoc",
])
export type TransactionCategory = z.infer<typeof TransactionCategorySchema>

// ──────────────────────────────────────────────────────────────────────────
// Phase 3 — mark sold / unmark sold (unchanged)
// ──────────────────────────────────────────────────────────────────────────

export const MarkUnitSoldInputSchema = z.object({
  projectId: z.string().min(1, "Missing project"),
  unitId: z.string().min(1, "Missing unit"),
  salePrice: z.coerce
    .number()
    .int("Whole rupees only")
    .min(1, "Must be at least ₹1")
    .max(100_000_000, "Too large (max ₹10 crore)"),
  buyerName: z
    .string()
    .trim()
    .min(1, "Buyer name is required")
    .max(200, "Too long"),
  saleDate: z.coerce.date(),
  description: z.string().trim().min(1, "Description required").max(500),
  notes: z.string().max(2000).optional().default(""),
})
export type MarkUnitSoldInput = z.infer<typeof MarkUnitSoldInputSchema>

export const UnmarkUnitSoldInputSchema = z.object({
  unitId: z.string().min(1, "Missing unit"),
})
export type UnmarkUnitSoldInput = z.infer<typeof UnmarkUnitSoldInputSchema>

// ──────────────────────────────────────────────────────────────────────────
// Phase 5 — Financials inputs
// ──────────────────────────────────────────────────────────────────────────

export const LedgerKindFilterSchema = z.enum(["all", "income", "expense"])
export type LedgerKindFilter = z.infer<typeof LedgerKindFilterSchema>

export const LedgerCategoryFilterSchema = z.enum([
  "all",
  "sale",
  "purchase",
  "adhoc",
  "transfer_in",
  "transfer_out",
])
export type LedgerCategoryFilter = z.infer<typeof LedgerCategoryFilterSchema>

export const LedgerVoidedFilterSchema = z.enum(["active", "all"])
export type LedgerVoidedFilter = z.infer<typeof LedgerVoidedFilterSchema>

// Parsed filter shape used by the repository. `from`/`to` are inclusive
// date-only bounds; the repository expands `to` to end-of-day on the query
// side so a date typed `2026-12-31` covers the full day.
export type LedgerFilters = {
  from: Date
  to: Date
  kind: LedgerKindFilter
  category: LedgerCategoryFilter
  includeVoided: boolean
}

export const CreateAdhocIncomeInputSchema = z.object({
  projectId: z.string().min(1, "Missing project"),
  amount: z.coerce
    .number()
    .int("Whole rupees only")
    .min(1, "Must be at least ₹1")
    .max(100_000_000, "Too large"),
  occurredAt: z.coerce.date(),
  description: z.string().trim().min(1, "Description required").max(500),
  buyerName: z.string().trim().max(200).optional().default(""),
  notes: z.string().max(2000).optional().default(""),
})
export type CreateAdhocIncomeInput = z.infer<typeof CreateAdhocIncomeInputSchema>

export const CreateAdhocExpenseInputSchema = z.object({
  projectId: z.string().min(1, "Missing project"),
  amount: z.coerce
    .number()
    .int("Whole rupees only")
    .min(1, "Must be at least ₹1")
    .max(100_000_000, "Too large"),
  occurredAt: z.coerce.date(),
  description: z.string().trim().min(1, "Description required").max(500),
  notes: z.string().max(2000).optional().default(""),
})
export type CreateAdhocExpenseInput = z.infer<typeof CreateAdhocExpenseInputSchema>

export const VoidTransactionInputSchema = z.object({
  transactionId: z.string().min(1, "Missing transaction"),
})
export type VoidTransactionInput = z.infer<typeof VoidTransactionInputSchema>

export const ReverseTransactionInputSchema = z.object({
  transactionId: z.string().min(1, "Missing transaction"),
  occurredAt: z.coerce.date().optional(),
  notes: z.string().max(2000).optional().default(""),
  andUnstock: z.boolean().optional().default(false),
})
export type ReverseTransactionInput = z.infer<typeof ReverseTransactionInputSchema>

// ──────────────────────────────────────────────────────────────────────────
// Domain type
// ──────────────────────────────────────────────────────────────────────────

export type Transaction = {
  _id: ObjectId
  projectId: ObjectId
  unitId: ObjectId | null
  kind: TransactionKind
  category: TransactionCategory
  amount: number
  currency: "INR"
  description: string
  occurredAt: Date
  buyerName?: string
  notes?: string
  voided?: boolean
  voidedAt?: Date
  voidedBy?: ObjectId
  reversalOf?: ObjectId       // Phase 5 — FK to original when this row is a reversal
  transferGroupId?: ObjectId  // Phase 6 — shared by both legs of a transfer (and both legs of its reversal)
  createdBy: ObjectId
  createdAt: Date
}
