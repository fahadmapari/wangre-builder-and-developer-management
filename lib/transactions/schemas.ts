import { z } from "zod"
import type { ObjectId } from "mongodb"

export const TransactionKindSchema = z.enum(["income", "expense"])
export type TransactionKind = z.infer<typeof TransactionKindSchema>

// Full category enum is declared up-front to avoid migrations as Phases 4–6
// land. Phase 3 only writes "sale".
export const TransactionCategorySchema = z.enum([
  "sale",
  "purchase",
  "transfer_in",
  "transfer_out",
  "adhoc",
])
export type TransactionCategory = z.infer<typeof TransactionCategorySchema>

// Mark-sold dialog input. `unitId` and `projectId` are passed as ObjectId
// hex strings from the client; the server action converts them.
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
  createdBy: ObjectId
  createdAt: Date
}
