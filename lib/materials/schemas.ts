import { z } from "zod"
import type { ObjectId } from "mongodb"

// ---- Unit of measure -------------------------------------------------------

export const MaterialUnitSchema = z.enum([
  "bag",
  "kg",
  "ton",
  "m3",
  "m2",
  "m",
  "liter",
  "piece",
  "sheet",
  "box",
  "roll",
  "other",
])
export type MaterialUnit = z.infer<typeof MaterialUnitSchema>

// ---- Movement enums --------------------------------------------------------

export const MovementKindSchema = z.enum(["in", "out"])
export type MovementKind = z.infer<typeof MovementKindSchema>

// Full category enum declared upfront so Phase 6 (transfers) needs no migration.
// Phase 4 only writes "purchase", "return", "consumption".
export const MovementCategorySchema = z.enum([
  "purchase",
  "return",
  "consumption",
  "transfer_in",
  "transfer_out",
])
export type MovementCategory = z.infer<typeof MovementCategorySchema>

// ---- Catalog action inputs -------------------------------------------------

// Server enforces: FM submissions are stripped of unitPrice BEFORE this schema
// runs (the FM form does not include the field). Admin submissions may include
// it.
export const CreateMaterialInputSchema = z
  .object({
    name: z.string().trim().min(1, "Name required").max(200, "Too long"),
    unit: MaterialUnitSchema,
    unitOther: z
      .string()
      .trim()
      .max(50, "Too long")
      .optional(),
    unitPrice: z
      .coerce
      .number()
      .min(0, "Price cannot be negative")
      .max(10_000_000, "Too large")
      .optional()
      .nullable(),
    notes: z.string().max(2000).optional().default(""),
  })
  .refine((v) => v.unit !== "other" || (v.unitOther && v.unitOther.length > 0), {
    message: "Provide a custom unit label",
    path: ["unitOther"],
  })
export type CreateMaterialInput = z.infer<typeof CreateMaterialInputSchema>

export const UpdateMaterialInputSchema = z
  .object({
    materialId: z.string().min(1, "Missing material"),
    name: z.string().trim().min(1).max(200).optional(),
    unit: MaterialUnitSchema.optional(),
    unitOther: z.string().trim().max(50).optional(),
    unitPrice: z
      .coerce
      .number()
      .min(0)
      .max(10_000_000)
      .optional()
      .nullable(),
    notes: z.string().max(2000).optional(),
  })
  .refine(
    (v) =>
      v.unit === undefined ||
      v.unit !== "other" ||
      (v.unitOther && v.unitOther.length > 0),
    { message: "Provide a custom unit label", path: ["unitOther"] }
  )
export type UpdateMaterialInput = z.infer<typeof UpdateMaterialInputSchema>

// ---- Movement action inputs ------------------------------------------------

const positiveQty = z
  .coerce
  .number()
  .positive("Must be > 0")
  .max(1_000_000, "Too large")

export const RecordPurchaseInputSchema = z.object({
  projectId: z.string().min(1, "Missing project"),
  materialId: z.string().min(1, "Missing material"),
  qty: positiveQty,
  unitPriceAtMovement: z
    .coerce
    .number()
    .positive("Must be > 0")
    .max(10_000_000, "Too large"),
  occurredAt: z.coerce.date(),
  notes: z.string().max(2000).optional().default(""),
})
export type RecordPurchaseInput = z.infer<typeof RecordPurchaseInputSchema>

export const LogConsumptionInputSchema = z.object({
  projectId: z.string().min(1, "Missing project"),
  materialId: z.string().min(1, "Missing material"),
  qty: positiveQty,
  purpose: z
    .string()
    .trim()
    .min(1, "Purpose is required")
    .max(500, "Too long"),
  occurredAt: z.coerce.date(),
  notes: z.string().max(2000).optional().default(""),
})
export type LogConsumptionInput = z.infer<typeof LogConsumptionInputSchema>

export const LogReturnInputSchema = z.object({
  projectId: z.string().min(1, "Missing project"),
  materialId: z.string().min(1, "Missing material"),
  qty: positiveQty,
  purpose: z.string().trim().max(500).optional().default(""),
  occurredAt: z.coerce.date(),
  notes: z.string().max(2000).optional().default(""),
})
export type LogReturnInput = z.infer<typeof LogReturnInputSchema>

// ---- Domain types ----------------------------------------------------------

export type Material = {
  _id: ObjectId
  name: string
  unit: MaterialUnit
  unitOther?: string
  unitPrice: number | null
  notes?: string
  createdBy: ObjectId
  createdAt: Date
  updatedAt: Date
}

export type ProjectMaterial = {
  _id: ObjectId
  projectId: ObjectId
  materialId: ObjectId
  stockOnHand: number
  createdAt: Date
  updatedAt: Date
}

export type MaterialMovement = {
  _id: ObjectId
  projectId: ObjectId
  materialId: ObjectId
  kind: MovementKind
  category: MovementCategory
  qty: number
  unitPriceAtMovement?: number
  amount?: number
  purpose?: string
  notes?: string
  transactionId?: ObjectId | null
  voided?: boolean
  voidedAt?: Date
  voidedBy?: ObjectId
  occurredAt: Date
  createdBy: ObjectId
  createdAt: Date
}
