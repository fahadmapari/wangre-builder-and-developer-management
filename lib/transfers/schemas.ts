import { z } from "zod"
import type { MaterialUnit } from "@/lib/materials/schemas"

// ──────────────────────────────────────────────────────────────────────────
// Phase 6 — transfer inputs (server-action layer)
// ──────────────────────────────────────────────────────────────────────────

export const CreateMoneyTransferInputSchema = z.object({
  sourceProjectId: z.string().min(1, "Missing source project"),
  destProjectId: z.string().min(1, "Missing destination project"),
  amount: z.coerce
    .number()
    .int("Whole rupees only")
    .min(1, "Must be at least ₹1")
    .max(100_000_000, "Too large (max ₹10 crore)"),
  occurredAt: z.coerce.date(),
  description: z.string().trim().min(1, "Description required").max(500),
  notes: z.string().max(2000).optional().default(""),
})
export type CreateMoneyTransferInput = z.infer<typeof CreateMoneyTransferInputSchema>

export const CreateMaterialTransferInputSchema = z.object({
  sourceProjectId: z.string().min(1, "Missing source project"),
  destProjectId: z.string().min(1, "Missing destination project"),
  materialId: z.string().min(1, "Missing material"),
  qty: z.coerce
    .number()
    .positive("Must be > 0")
    .max(1_000_000, "Too large"),
  occurredAt: z.coerce.date(),
  notes: z.string().max(2000).optional().default(""),
})
export type CreateMaterialTransferInput = z.infer<typeof CreateMaterialTransferInputSchema>

export const ReverseTransferInputSchema = z.object({
  transferGroupId: z.string().min(1, "Missing transfer"),
  occurredAt: z.coerce.date().optional(),
  notes: z.string().max(2000).optional().default(""),
})
export type ReverseTransferInput = z.infer<typeof ReverseTransferInputSchema>

// ──────────────────────────────────────────────────────────────────────────
// Phase 6 — display row types (used by /transfers tables)
// ──────────────────────────────────────────────────────────────────────────

export type TransferStatus = "active" | "reversed"

export type MoneyTransferRow = {
  transferGroupId: string         // hex
  occurredAt: Date                 // taken from source leg
  sourceProjectId: string          // hex
  sourceProjectName: string
  destProjectId: string            // hex
  destProjectName: string
  amount: number                   // positive whole rupees
  description: string              // user-supplied portion (without the "Transfer to/from" prefix if discoverable, else full source description)
  status: TransferStatus
  reversedAt: Date | null          // earliest createdAt among reversal legs
  createdBy: string                // userId hex
  createdByName: string | null
}

export type MaterialTransferRow = {
  transferGroupId: string
  occurredAt: Date
  sourceProjectId: string
  sourceProjectName: string
  destProjectId: string
  destProjectName: string
  materialId: string
  materialName: string
  materialUnit: MaterialUnit
  materialUnitOther?: string
  qty: number
  status: TransferStatus
  reversedAt: Date | null
  createdBy: string
  createdByName: string | null
}
